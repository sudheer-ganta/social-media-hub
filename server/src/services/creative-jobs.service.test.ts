import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getJob,
  JOB_MAX_RUNTIME_MS,
  JOB_RETENTION_MS,
  MAX_RUNNING_JOBS_PER_OWNER,
  resetJobsForTests,
  startJob,
  TooManyJobsError,
} from './creative-jobs.service';

const describeError = (error: unknown) => ({
  status: 422,
  message: error instanceof Error ? error.message : 'unknown',
});

/** A promise the test settles by hand, to hold a job open. */
function gate<T = unknown>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const settle = () => new Promise((r) => setImmediate(r));

beforeEach(() => resetJobsForTests());
afterEach(() => vi.useRealTimers());

describe('creative jobs', () => {
  it('answers with an id at once while the work is still running', () => {
    const work = gate();
    const id = startJob('u1', 'generate', () => work.promise, describeError);
    expect(getJob('u1', id)).toMatchObject({ id, kind: 'generate', status: 'running' });
    expect(getJob('u1', id)).not.toHaveProperty('result');
  });

  it('delivers the result once the work finishes', async () => {
    const work = gate<{ imageUrl: string }>();
    const id = startJob('u1', 'generate', () => work.promise, describeError);
    work.resolve({ imageUrl: 'https://example.test/a.png' });
    await settle();
    expect(getJob('u1', id)).toMatchObject({ status: 'done', result: { imageUrl: 'https://example.test/a.png' } });
  });

  it('reports a failure with the message the member should see', async () => {
    const work = gate();
    const id = startJob('u1', 'generate', () => work.promise, describeError);
    work.reject(new Error('The logo could not be read.'));
    await settle();
    expect(getJob('u1', id)).toMatchObject({ status: 'failed', error: { status: 422, message: 'The logo could not be read.' } });
  });

  it('never lets one member read another member\'s job', () => {
    const id = startJob('u1', 'generate', () => gate().promise, describeError);
    expect(getJob('someone-else', id)).toBeNull();
    expect(getJob('u1', 'no-such-job')).toBeNull();
  });

  it('returns the same job for a retried start instead of generating twice', async () => {
    let runs = 0;
    const work = gate();
    const start = () => startJob('u1', 'generate', () => { runs += 1; return work.promise; }, describeError, 'key-1');
    const first = start();
    const second = start();
    expect(second).toBe(first);
    expect(runs).toBe(1);
    expect(startJob('u1', 'generate', () => gate().promise, describeError, 'key-2')).not.toBe(first);
  });

  it('limits how many generations one member can have running, but not other members', () => {
    for (let i = 0; i < MAX_RUNNING_JOBS_PER_OWNER; i += 1) startJob('u1', 'generate', () => gate().promise, describeError);
    expect(() => startJob('u1', 'generate', () => gate().promise, describeError)).toThrow(TooManyJobsError);
    expect(() => startJob('u2', 'generate', () => gate().promise, describeError)).not.toThrow();
  });

  it('frees a slot when a job finishes', async () => {
    const gates = Array.from({ length: MAX_RUNNING_JOBS_PER_OWNER }, () => gate());
    gates.forEach((g) => startJob('u1', 'generate', () => g.promise, describeError));
    gates[0].resolve(undefined);
    await settle();
    expect(() => startJob('u1', 'generate', () => gate().promise, describeError)).not.toThrow();
  });

  it('reports a job that never finishes as failed rather than leaving the member waiting forever', () => {
    vi.useFakeTimers();
    const id = startJob('u1', 'generate', () => gate().promise, describeError);
    vi.setSystemTime(Date.now() + JOB_MAX_RUNTIME_MS + 1000);
    expect(getJob('u1', id)).toMatchObject({ status: 'failed', error: { status: 504 } });
  });

  it('forgets a finished job after the retention window', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const work = gate();
    const id = startJob('u1', 'generate', () => work.promise, describeError);
    work.resolve('ok');
    await settle();
    expect(getJob('u1', id)).toMatchObject({ status: 'done' });
    vi.setSystemTime(Date.now() + JOB_RETENTION_MS + 1000);
    expect(getJob('u1', id)).toBeNull();
  });
});
