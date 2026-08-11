import app from './app';
import { env } from './config/env';
import { startScheduler, stopScheduler } from './scheduler/scheduler.worker';

const startServer = () => {
  try {
    app.listen(env.PORT, () => {
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

// Render sends SIGTERM on every deploy. Stopping the interval lets an in-flight
// publish finish rather than being interrupted by the next tick; the claim in
// the database is what covers the case where it does not finish.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    stopScheduler();
    process.exit(0);
  });
}

startServer();
