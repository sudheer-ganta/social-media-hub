import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.hoisted(() => vi.fn(async () => ({
  data: { session: { access_token: "test-token" } },
})));
vi.mock("@/lib/supabase", () => ({ getSupabase: () => ({ auth: { getSession } }) }));

const { generateCreative, regenerateCreative } = await import("./creative.service");

const base = {
  prompt: "Create a premium coffee launch post",
  contextType: "personal" as const,
  goal: "brand_awareness" as const,
  funnelStage: "TOFU" as const,
  platforms: ["instagram"],
  assetUrls: [],
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

/**
 * A server that runs each started job to completion by its first poll, in the
 * order they were started: results[0] answers the first job, and so on.
 */
function mockJobServer(results: unknown[]) {
  const started: Array<{ kind: string; payload: unknown }> = [];
  const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.endsWith("/jobs") && init?.method === "POST") {
      started.push(JSON.parse(String(init.body)));
      return json({ jobId: `job-${started.length - 1}` }, 202);
    }
    const match = url.match(/\/jobs\/job-(\d+)$/);
    if (match) return json({ id: `job-${match[1]}`, kind: started[Number(match[1])].kind, status: "done", result: results[Number(match[1])] });
    throw new Error(`unexpected request: ${url}`);
  });
  return { fetchMock, started };
}

/** Polling sleeps between checks: step fake time until the call settles. */
async function settled<T>(promise: Promise<T>): Promise<T> {
  let done = false;
  void promise.then(() => { done = true; }, () => { done = true; });
  while (!done) await vi.advanceTimersByTimeAsync(1_700);
  return promise;
}

describe("frontend concept lifecycle integration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("generates A, generates B, then reopens unchanged A without a duplicate asset", async () => {
    const imageA = { id: "asset-a", imageUrl: "https://cdn/a.png", status: "COMPLETED" };
    const imageB = { id: "asset-b", imageUrl: "https://cdn/b.png", status: "COMPLETED" };
    // The lightweight reopen request is allowed; the backend cache returns A.
    const { started } = mockJobServer([imageA, imageB, imageA]);

    const conceptA = { conceptId: "concept-a", conceptName: "A" } as never;
    const conceptB = { conceptId: "concept-b", conceptName: "B" } as never;
    const firstA = await settled(generateCreative({ ...base, selectedConcept: conceptA }));
    const firstB = await settled(generateCreative({ ...base, selectedConcept: conceptB }));
    const reopenedA = await settled(generateCreative({ ...base, selectedConcept: conceptA }));

    expect(started).toHaveLength(3);
    expect(firstB.id).toBe("asset-b");
    expect(reopenedA).toEqual(firstA);
    expect(reopenedA.id).toBe("asset-a");
    expect(reopenedA.imageUrl).toBe("https://cdn/a.png");
    expect(started[2].kind).toBe("generate");
  });

  it("uses the explicit regeneration endpoint and preserves the original response", async () => {
    const original = Object.freeze({ id: "asset-a", imageUrl: "https://cdn/a.png", status: "COMPLETED" });
    const variation = { id: "asset-a-v2", imageUrl: "https://cdn/a-v2.png", status: "COMPLETED", parentAssetId: "asset-a" };
    const { started } = mockJobServer([variation]);
    const result = await settled(regenerateCreative(original.id));

    expect(result).toEqual(variation);
    expect(original.imageUrl).toBe("https://cdn/a.png");
    expect(started[0]).toEqual({ kind: "regenerate", payload: { assetId: "asset-a" } });
  });
});

describe("waiting for a slow generation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  /** A job that is still running for `runningPolls` checks, then resolves with `outcome`. */
  function slowServer(runningPolls: number, outcome: { status: "done"; result: unknown } | { status: "failed"; error: { message: string; status: number } }) {
    let polls = 0;
    return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs") && init?.method === "POST") return json({ jobId: "job-0" }, 202);
      polls += 1;
      return polls <= runningPolls
        ? json({ id: "job-0", kind: "generate", status: "running" })
        : json({ id: "job-0", kind: "generate", ...outcome });
    });
  }

  it("keeps waiting well past the old three-minute limit and still delivers the image", async () => {
    const asset = { id: "asset-slow", imageUrl: "https://cdn/slow.png", status: "COMPLETED" };
    // ~160 polls at 4 s is over ten minutes of waiting.
    const fetchMock = slowServer(160, { status: "done", result: asset });
    const result = await settled(generateCreative(base));
    expect(result).toEqual(asset);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(160);
  });

  it("surfaces the server's own message when the job fails", async () => {
    slowServer(2, { status: "failed", error: { message: "The logo could not be read.", status: 422 } });
    const pending = generateCreative(base);
    const assertion = expect(pending).rejects.toThrow("The logo could not be read.");
    await settled(pending.catch(() => undefined));
    await assertion;
  });

  it("rides out a dropped connection while polling instead of giving up", async () => {
    const asset = { id: "asset-ok", imageUrl: "https://cdn/ok.png", status: "COMPLETED" };
    let polls = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs") && init?.method === "POST") return json({ jobId: "job-0" }, 202);
      polls += 1;
      if (polls <= 3) throw new TypeError("network down");
      return json({ id: "job-0", kind: "generate", status: "done", result: asset });
    });
    expect(await settled(generateCreative(base))).toEqual(asset);
  });

  it("stops at once when the server says the job is gone", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs") && init?.method === "POST") return json({ jobId: "job-0" }, 202);
      return json({ error: "This request is no longer available. Please try again." }, 404);
    });
    const pending = generateCreative(base);
    const assertion = expect(pending).rejects.toThrow("no longer available");
    await settled(pending.catch(() => undefined));
    await assertion;
  });

  it("sends one idempotency key with the start request, so a retried start cannot generate twice", async () => {
    const fetchMock = slowServer(0, { status: "done", result: { id: "a" } });
    await settled(generateCreative(base));
    const start = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/jobs") && init?.method === "POST")!;
    const headers = new Headers((start[1] as RequestInit).headers);
    expect(headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
  });
});
