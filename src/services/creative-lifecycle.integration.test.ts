import { beforeEach, describe, expect, it, vi } from "vitest";

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

describe("frontend concept lifecycle integration", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("generates A, generates B, then reopens unchanged A without a duplicate asset", async () => {
    const imageA = { id: "asset-a", imageUrl: "https://cdn/a.png", status: "COMPLETED" };
    const imageB = { id: "asset-b", imageUrl: "https://cdn/b.png", status: "COMPLETED" };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(imageA), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(imageB), { status: 200 }))
      // The lightweight reopen request is allowed; the backend cache returns A.
      .mockResolvedValueOnce(new Response(JSON.stringify(imageA), { status: 200 }));

    const conceptA = { conceptId: "concept-a", conceptName: "A" } as never;
    const conceptB = { conceptId: "concept-b", conceptName: "B" } as never;
    const firstA = await generateCreative({ ...base, selectedConcept: conceptA });
    const firstB = await generateCreative({ ...base, selectedConcept: conceptB });
    const reopenedA = await generateCreative({ ...base, selectedConcept: conceptA });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(firstB.id).toBe("asset-b");
    expect(reopenedA).toEqual(firstA);
    expect(reopenedA.id).toBe("asset-a");
    expect(reopenedA.imageUrl).toBe("https://cdn/a.png");
    expect(fetchMock.mock.calls[2][0]).toContain("/generate");
  });

  it("uses the explicit regeneration endpoint and preserves the original response", async () => {
    const original = Object.freeze({ id: "asset-a", imageUrl: "https://cdn/a.png", status: "COMPLETED" });
    const variation = { id: "asset-a-v2", imageUrl: "https://cdn/a-v2.png", status: "COMPLETED", parentAssetId: "asset-a" };
    const fetchMock = vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify(variation), { status: 200 }));

    const result = await regenerateCreative(original.id);

    expect(result).toEqual(variation);
    expect(original.imageUrl).toBe("https://cdn/a.png");
    expect(fetchMock.mock.calls[0][0]).toContain("/regenerate");
  });
});
