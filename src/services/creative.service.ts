import { getSupabase } from "@/lib/supabase";
import { API_BASE_URL } from "@/constants/api";
import type { CreativeDna, FunnelStage, MarketingGoal } from "@/ai/types";
import type {
  CreativeIntentBrief,
  DiscoveredConcepts,
  GeneratedAsset,
  ReferenceStyleProfile,
  ScoredCreativeConcept,
  UnderstoodCreative,
} from "@/types/creative";

/**
 * The browser's side of FlowPost's creative engine. Mirrors `ai.service.ts`
 * exactly: the browser never talks to Gemini or Cloudinary directly, it talks
 * to `/api/ai/creative/*` and the Express backend holds every key.
 */

const CREATIVE_ENDPOINT = "/api/ai/creative";

/**
 * Generation is two image models back to back — the visual, then the campaign
 * designed over it — so it needs materially more room than a caption call.
 * A timeout here aborts a request the server is still paying for, which is
 * the one failure mode worse than waiting.
 */
const REQUEST_TIMEOUT_MS = 180_000;

async function getAccessToken(): Promise<string> {
  const {
    data: { session },
  } = await getSupabase().auth.getSession();
  if (!session?.access_token) {
    throw new Error("You need to be signed in to create with FlowPost.");
  }
  return session.access_token;
}

async function request<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${CREATIVE_ENDPOINT}${path}`, {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...init.headers,
        Authorization: `Bearer ${await getAccessToken()}`,
      },
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new Error("This took too long. Please try again.");
    }
    throw new Error("Could not reach FlowPost's creative engine. Check your connection and try again.");
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && typeof body.error === "string" ? body.error : fallback;
    throw new Error(message);
  }

  return body as T;
}

export interface CreativeRequestInput {
  prompt: string;
  contextType: "personal" | "brand";
  brandId?: string;
  goal: MarketingGoal;
  funnelStage: FunnelStage;
  platforms: string[];
  assetUrls: string[];
  creativeDna?: Partial<CreativeDna>;
  brandVoice?: Record<string, unknown>;
  /** "Show FlowPost what you like" — 2-6 inspiration image URLs, distinct from assetUrls (product/logo, preserved exactly). Ignored when referenceStyleProfile is given. */
  referenceImageUrls?: string[];
  /** Optional lightweight labels, same order as referenceImageUrls. */
  referenceLabels?: string[];
  /** A previously-saved style profile the member is reusing — skips re-analysing referenceImageUrls. */
  referenceStyleProfile?: ReferenceStyleProfile;
  /** The concept picked from `discoverConcepts`. Omitted, the backend discovers concepts itself and picks the strongest. */
  selectedConcept?: ScoredCreativeConcept;
  /** The brief `discoverConcepts` returned, handed back so generation validates against the same requirements the concepts were gated on. */
  intent?: CreativeIntentBrief;
}

/**
 * FlowPost's creative director: "what is the advertising idea?" — 3–5
 * genuinely different, quality-gated concepts. No art direction, no image
 * generated yet — this is what the concept picker shows (spec §19).
 */
export async function discoverConcepts(input: CreativeRequestInput): Promise<DiscoveredConcepts> {
  return request<DiscoveredConcepts>(
    "/concepts",
    { method: "POST", body: JSON.stringify(input) },
    "Could not come up with creative concepts. Please try again.",
  );
}

/** A single ready-to-read direction and summary, for a caller that wants one answer rather than a set of concepts to choose between. */
export async function understandCreative(input: CreativeRequestInput): Promise<UnderstoodCreative> {
  return request<UnderstoodCreative>(
    "/direction",
    { method: "POST", body: JSON.stringify(input) },
    "Could not work out a creative direction. Please try again.",
  );
}

/** Runs the full pipeline and returns the persisted, completed asset. */
export async function generateCreative(input: CreativeRequestInput): Promise<GeneratedAsset> {
  return request<GeneratedAsset>(
    "/generate",
    { method: "POST", body: JSON.stringify(input) },
    "Could not generate this creative. Please try again.",
  );
}

/** Natural-language refinement of a previously generated asset. */
export async function refineCreative(assetId: string, instruction: string): Promise<GeneratedAsset> {
  return request<GeneratedAsset>(
    "/refine",
    { method: "POST", body: JSON.stringify({ assetId, instruction }) },
    "Could not apply that change. Please try again.",
  );
}

export async function fetchCreativeHistory(scope: {
  contextType: "personal" | "brand";
  brandId?: string;
}): Promise<GeneratedAsset[]> {
  const params = new URLSearchParams({ contextType: scope.contextType });
  if (scope.brandId) params.set("brandId", scope.brandId);
  const { assets } = await request<{ assets: GeneratedAsset[] }>(
    `/history?${params.toString()}`,
    { method: "GET" },
    "Could not load generation history.",
  );
  return assets;
}

export const creativeService = {
  discoverConcepts,
  understandCreative,
  generateCreative,
  refineCreative,
  fetchCreativeHistory,
};
