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
import { authenticatedFetch } from "@/lib/auth-token";

/**
 * The browser's side of FlowPost's creative engine. Mirrors `ai.service.ts`
 * exactly: the browser never talks to Gemini or Cloudinary directly, it talks
 * to `/api/ai/creative/*` and the Express backend holds every key.
 */

const CREATIVE_ENDPOINT = "/api/ai/creative";

const REQUEST_TIMEOUT_MS = 180_000;

/** A failed request, with the HTTP status when the server answered (0 when it never did). */
class RequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RequestError";
  }
}

async function request<T>(
  path: string,
  init: RequestInit,
  fallback: string,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await authenticatedFetch(
      `${API_BASE_URL}${CREATIVE_ENDPOINT}${path}`,
      {
        ...init,
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          ...(init.method === "POST" && { "Idempotency-Key": crypto.randomUUID() }),
          ...init.headers,
        },
      },
      "You need to be signed in to create with Rally.",
    );
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new RequestError("This took too long. Please try again.", 0);
    }
    throw new RequestError("Could not reach Rally's creative engine. Check your connection and try again.", 0);
  } finally {
    clearTimeout(timeout);
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body === "object" && typeof body.error === "string" ? body.error : fallback;
    throw new RequestError(message, response.status);
  }

  return body as T;
}

/**
 * The slow calls (concepts, generate, refine, regenerate) run as background
 * jobs: the server answers at once with a job id and the browser polls, so a
 * generation that takes minutes is waited out instead of abandoned after one
 * request's timeout. The result is exactly what the direct endpoint returns.
 */
const JOB_POLL_FIRST_MS = 1_500;
const JOB_POLL_MAX_MS = 4_000;
const JOB_POLL_REQUEST_TIMEOUT_MS = 30_000;
/** Far beyond any real generation: a job that outlives this is reported, not waited on forever. */
const JOB_MAX_WAIT_MS = 20 * 60 * 1000;
const JOB_MAX_CONSECUTIVE_POLL_FAILURES = 6;

interface JobView<T> {
  id: string;
  kind: string;
  status: "running" | "done" | "failed";
  result?: T;
  error?: { message: string; status: number };
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function runJob<T>(kind: "concepts" | "generate" | "refine" | "regenerate", payload: unknown, fallback: string): Promise<T> {
  // One key for this run: if the start request is retried, the server hands back the same job.
  const idempotencyKey = crypto.randomUUID();
  const { jobId } = await request<{ jobId: string }>(
    "/jobs",
    { method: "POST", body: JSON.stringify({ kind, payload }), headers: { "Idempotency-Key": idempotencyKey } },
    fallback,
  );

  const deadline = Date.now() + JOB_MAX_WAIT_MS;
  let delay = JOB_POLL_FIRST_MS;
  let failures = 0;

  while (Date.now() < deadline) {
    await sleep(delay);
    delay = Math.min(Math.round(delay * 1.25), JOB_POLL_MAX_MS);

    let job: JobView<T>;
    try {
      job = await request<JobView<T>>(`/jobs/${jobId}`, { method: "GET" }, fallback, JOB_POLL_REQUEST_TIMEOUT_MS);
      failures = 0;
    } catch (cause) {
      // A dropped connection or a slow answer while polling says nothing about the job: keep waiting.
      // An answer that says "gone" or "not yours" is final.
      const status = cause instanceof RequestError ? cause.status : 0;
      const transient = status === 0 || status === 408 || status === 429 || status >= 500;
      if (!transient || ++failures >= JOB_MAX_CONSECUTIVE_POLL_FAILURES) throw cause;
      continue;
    }

    if (job.status === "done") return job.result as T;
    if (job.status === "failed") throw new Error(job.error?.message ?? fallback);
  }

  throw new Error("This is taking much longer than expected. Please try again.");
}

export interface CreativeRequestInput {
  prompt: string;
  styleId?: string;
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

export async function syncCreativeAttribution(input: { postId: string; contextType: "personal" | "brand"; brandId?: string | null; media: Array<{ id: string; generatedAssetId?: string }>; eventId?: string }) {
  const response = await authenticatedFetch(`${API_BASE_URL}/api/creative/attribution/sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error ?? "Could not preserve creative attribution.");
  return body as { attributed: number; removed: number };
}

export interface CreativeStyleSummary {
  id: string;
  name: string;
  description: string;
  visualCharacter: string[];
}

export async function fetchCreativeStyles(): Promise<CreativeStyleSummary[]> {
  const { styles } = await request<{ styles: CreativeStyleSummary[] }>(
    "/styles",
    { method: "GET" },
    "Could not load the style library.",
  );
  return styles;
}

/**
 * FlowPost's creative director: "what is the advertising idea?" — 3–5
 * genuinely different, quality-gated concepts. No art direction, no image
 * generated yet — this is what the concept picker shows (spec §19).
 */
export async function discoverConcepts(input: CreativeRequestInput): Promise<DiscoveredConcepts> {
  return runJob<DiscoveredConcepts>("concepts", input, "Could not come up with creative concepts. Please try again.");
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
  return runJob<GeneratedAsset>("generate", input, "Could not generate this creative. Please try again.");
}

/** Natural-language refinement of a previously generated asset. */
export async function refineCreative(assetId: string, instruction: string): Promise<GeneratedAsset> {
  return runJob<GeneratedAsset>("refine", { assetId, instruction }, "Could not apply that change. Please try again.");
}

export type EditableTextField = "headline" | "supportingLine" | "offerText" | "eventBadge" | "brandMessage" | "cta";

/** The typography a line has now. Anything absent is automatic. */
export interface TextLineStyle {
  fontFamily?: string;
  fontWeight?: number;
  /** 1 is the size Rally fitted for this wording. */
  sizeScale: number;
  color?: string;
}

/** A line of text on a finished creative that can be reworded or restyled in place. */
export interface EditableTextLine {
  field: EditableTextField;
  role: string;
  /** The wording as it is typeset now. */
  text: string;
  maxLength: number;
  style: TextLineStyle;
  /** The font families that can display this wording. */
  fonts: string[];
}

export interface FontOption {
  family: string;
  category: string;
  /** Weights that have real font files. */
  weights: number[];
  /** Root-relative URL of each weight's font file, keyed by weight: the file the render itself uses. */
  files: Record<number, string>;
}

export interface EditableText {
  canEdit: boolean;
  /** Why not, when `canEdit` is false. */
  reason?: string;
  lines: EditableTextLine[];
  fonts?: FontOption[];
  /** Colours offered for text: the brand's own, then light and dark. */
  palette?: string[];
}

/** What to change on one line. Every part is optional; absent parts stay as they are. */
export interface TextLineChange {
  text?: string;
  style?: Partial<Pick<TextLineStyle, "fontFamily" | "fontWeight" | "sizeScale" | "color">>;
}

export async function fetchEditableText(assetId: string): Promise<EditableText> {
  return request<EditableText>(
    `/text/${encodeURIComponent(assetId)}`,
    { method: "GET" },
    "Could not load this creative's text.",
  );
}

/**
 * Rewords and/or restyles lines of a finished creative WITHOUT regenerating it:
 * the picture is reused and only the text is re-fitted. Returns a new asset.
 */
export async function retypeCreative(
  assetId: string,
  changes: Partial<Record<EditableTextField, TextLineChange>>,
): Promise<GeneratedAsset> {
  const edits: Partial<Record<EditableTextField, string>> = {};
  const styles: Partial<Record<EditableTextField, NonNullable<TextLineChange["style"]>>> = {};
  for (const [field, change] of Object.entries(changes) as [EditableTextField, TextLineChange][]) {
    if (change.text !== undefined) edits[field] = change.text;
    if (change.style && Object.keys(change.style).length) styles[field] = change.style;
  }
  return request<GeneratedAsset>(
    "/retype",
    {
      method: "POST",
      body: JSON.stringify({
        assetId,
        ...(Object.keys(edits).length && { edits }),
        ...(Object.keys(styles).length && { styles }),
      }),
    },
    "Could not change that text. Your creative is unchanged.",
  );
}

export async function regenerateCreative(assetId: string): Promise<GeneratedAsset> {
  return runJob<GeneratedAsset>("regenerate", { assetId }, "Could not regenerate this creative. Your existing image is unchanged.");
}

export async function recordCreativeSignal(assetId: string, signal: "saved" | "reused"): Promise<void> {
  await request("/signal", { method: "POST", body: JSON.stringify({ assetId, signal }) }, "Could not record that choice.");
}

export async function rejectCreativeConcept(conceptId: string, brandId: string): Promise<void> {
  await request("/signal", { method: "POST", body: JSON.stringify({ conceptId, brandId, signal: "rejected" }) }, "Could not record that preference.");
}

export interface BrandIntelligencePreference {
  id: string; dimension: string; value: string; polarity: "positive" | "negative";
  source: string; occurrenceCount: number; confidence: number; strength: "explicit" | "strong" | "weak";
}
export interface BrandCreativeIntelligence {
  brandId: string; explicit: BrandIntelligencePreference[]; learned: BrandIntelligencePreference[];
  preferredStyleId?: string; guidance: string[];
}
export async function fetchBrandCreativeIntelligence(brandId: string): Promise<BrandCreativeIntelligence> {
  return request(`/brand-intelligence/${brandId}`, { method: "GET" }, "Could not load creative preferences.");
}
export async function setBrandCreativePreference(brandId: string, input: { dimension: string; value: string; polarity: "positive" | "negative" }): Promise<BrandCreativeIntelligence> {
  return request(`/brand-intelligence/${brandId}/preferences`, { method: "POST", body: JSON.stringify(input) }, "Could not save that creative preference.");
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
  fetchEditableText,
  retypeCreative,
  regenerateCreative,
  recordCreativeSignal,
  rejectCreativeConcept,
  fetchBrandCreativeIntelligence,
  setBrandCreativePreference,
  fetchCreativeHistory,
  fetchCreativeStyles,
  syncCreativeAttribution,
};
