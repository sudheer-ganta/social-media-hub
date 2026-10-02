import { randomUUID } from 'crypto';

/**
 * Background runner for the creative engine's slow calls.
 *
 * Generating a creative can legitimately take minutes, longer than a browser
 * will wait on one request and longer than most proxies allow. So the browser
 * does not wait on the generation: it starts a job, gets an id straight back,
 * and polls. The work itself is the same service call the direct endpoints make.
 *
 * Jobs live in this process's memory. That keeps the runner small and needs no
 * schema change, with one stated limit: a restart (or a second server instance
 * that did not start the job) cannot answer for it. The poll then says the job
 * is gone and the member simply tries again. Nothing is lost that was saved:
 * a finished creative is already persisted by the service, not by this runner.
 */

export type JobStatus = 'running' | 'done' | 'failed';

export interface JobFailure {
  message: string;
  status: number;
}

export interface PublicJob {
  id: string;
  kind: string;
  status: JobStatus;
  result?: unknown;
  error?: JobFailure;
}

interface Job extends PublicJob {
  ownerId: string;
  startedAt: number;
  finishedAt?: number;
  dedupeKey?: string;
}

/** How long a finished job can still be collected. */
export const JOB_RETENTION_MS = 30 * 60 * 1000;
/** A job still running after this long is reported as failed: its request is long past any provider timeout. */
export const JOB_MAX_RUNTIME_MS = 30 * 60 * 1000;
/** Concurrent generations one member may have in flight. */
export const MAX_RUNNING_JOBS_PER_OWNER = 3;

export class TooManyJobsError extends Error {
  readonly status = 429;
  constructor() {
    super('You already have creatives generating. Wait for one to finish, then try again.');
    this.name = 'TooManyJobsError';
  }
}

const jobs = new Map<string, Job>();
const byDedupeKey = new Map<string, string>();

function sweep(now: number): void {
  for (const [id, job] of jobs) {
    if (job.status === 'running' && now - job.startedAt > JOB_MAX_RUNTIME_MS) {
      job.status = 'failed';
      job.finishedAt = now;
      job.error = { message: 'This took too long on our side. Please try again.', status: 504 };
    }
    if (job.finishedAt && now - job.finishedAt > JOB_RETENTION_MS) {
      jobs.delete(id);
      if (job.dedupeKey) byDedupeKey.delete(job.dedupeKey);
    }
  }
}

/**
 * Starts `work` in the background and returns its id at once.
 *
 * `dedupeKey` makes a retried start (a request that was sent twice because the
 * first answer was lost) return the same job instead of generating twice.
 */
export function startJob(
  ownerId: string,
  kind: string,
  work: () => Promise<unknown>,
  describeError: (error: unknown) => JobFailure,
  dedupeKey?: string,
): string {
  const now = Date.now();
  sweep(now);

  const scopedKey = dedupeKey ? `${ownerId}:${kind}:${dedupeKey}` : undefined;
  const existing = scopedKey ? byDedupeKey.get(scopedKey) : undefined;
  if (existing && jobs.has(existing)) return existing;

  const running = [...jobs.values()].filter((j) => j.ownerId === ownerId && j.status === 'running').length;
  if (running >= MAX_RUNNING_JOBS_PER_OWNER) throw new TooManyJobsError();

  const job: Job = { id: randomUUID(), ownerId, kind, status: 'running', startedAt: now, ...(scopedKey && { dedupeKey: scopedKey }) };
  jobs.set(job.id, job);
  if (scopedKey) byDedupeKey.set(scopedKey, job.id);

  void (async () => {
    try {
      job.result = await work();
      job.status = 'done';
    } catch (error) {
      job.error = describeError(error);
      job.status = 'failed';
    } finally {
      job.finishedAt = Date.now();
    }
  })();

  return job.id;
}

/** The job, if this owner started it and it is still held. A foreign id matches nothing. */
export function getJob(ownerId: string, id: string): PublicJob | null {
  sweep(Date.now());
  const job = jobs.get(id);
  if (!job || job.ownerId !== ownerId) return null;
  const { id: jobId, kind, status, result, error } = job;
  return { id: jobId, kind, status, ...(status === 'done' && { result }), ...(status === 'failed' && { error }) };
}

/** Test seam: forget every job. */
export function resetJobsForTests(): void {
  jobs.clear();
  byDedupeKey.clear();
}
