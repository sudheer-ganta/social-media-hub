import app from './app';
import { env } from './config/env';
import { startScheduler, stopScheduler, drainScheduler } from './scheduler/scheduler.worker';

let server: ReturnType<typeof app.listen> | undefined;

const startServer = () => {
  try {
    server = app.listen(env.PORT, () => {
      console.log(`Server is running on port ${env.PORT}`);

      /**
       * The scheduled-publish worker, in-process.
       *
       * A separate Render service would be tidier and is not worth a second
       * dyno: the loop is two indexed queries a minute when idle, and every bit
       * of state it needs is in the database. Running it here means a deploy
       * restarts it for free — and because it holds nothing in memory, a
       * restart costs at most one tick.
       *
       * `SCHEDULER_ENABLED=false` turns it off, which is what a second web
       * instance would set if this ever scales out. It does not have to: two
       * workers racing the same due row is a case the claim already handles.
       */
      if (process.env.SCHEDULER_ENABLED !== 'false') {
        startScheduler();
      } else {
        console.log('[scheduler] disabled by SCHEDULER_ENABLED=false');
      }
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

/**
 * Render sends SIGTERM on every deploy and gives the process about thirty seconds.
 *
 * Shut down in order: stop taking new work (no new ticks, no new connections),
 * let the publish that is in flight finish, then exit. Exiting immediately is
 * what produces a duplicate post — the network accepted it, the process died
 * before recording that, and the stale-claim reaper later retries the attempt.
 * The grace period is a little under the host's so a hung provider call cannot
 * keep us alive long enough to be SIGKILLed mid-write.
 */
const SHUTDOWN_GRACE_MS = 25_000;
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] ${signal} received, shutting down`);

  // Hard stop if anything below hangs.
  setTimeout(() => process.exit(1), SHUTDOWN_GRACE_MS + 2_000).unref();

  stopScheduler();

  // A manual publish is an HTTP request, so wait for open requests as well as
  // the scheduler's tick. `close()` stops accepting connections and resolves
  // once the ones in flight have finished.
  const requestsDone = new Promise<void>((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });

  try {
    const [, clean] = await Promise.all([requestsDone, drainScheduler(SHUTDOWN_GRACE_MS)]);
    if (!clean) console.warn('[server] in-flight scheduler tick did not finish before the deadline');
  } catch (error) {
    console.error('[server] error while draining', error);
  }
  process.exit(0);
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

startServer();
