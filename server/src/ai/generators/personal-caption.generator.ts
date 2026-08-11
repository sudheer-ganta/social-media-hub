import { buildPersonalPrompt } from '../prompts/personal.prompt';
import { AiProviderError, type AiTextProvider } from '../providers';
import { filterCandidates, type Candidate } from '../personal/filters';
import { rankCandidates } from '../personal/score';
import type { MeasuredStyle } from '../style/measure';
import type {
  CaptionRequest,
  CaptionResult,
  CaptionVariation,
  ImageAnalysis,
  InlineImage,
  RawPersonalPayload,
} from '../types';

/**
 * Personal Creative — the writing half of the personal brain.
 *
 * Called by `creative-intelligence.generator.ts` once stage one has run, so the
 * expensive shared work (fetching the image, looking at it) happens exactly
 * once and in exactly one place regardless of mode. What arrives here is the
 * read, the pixels, and this person's style memory.
 *
 *   image + read ─┐
 *   style profile ├→ [write N] → [filter] → [rank] → top 3–5
 *   real examples ┘        ▲          │
 *                          └──────────┘  one repair pass, only if too few survive
 *
 * ─── Why the filter runs after the model rather than inside the prompt ───────
 * Because a caption is cheap and a round trip is not. Generating eight and
 * keeping four costs a few hundred output tokens; describing every failure mode
 * to the model in advance costs a longer prompt on every request *and* spends
 * the model's attention on avoidance rather than invention. See the header of
 * `personal/filters.ts`.
 *
 * ─── What this deliberately does not do ─────────────────────────────────────
 * No hashtags, no per-platform rewrites, no angles, no hooks, no "why it
 * works", no SEO, no campaign, no competitor block, no reach score. Those are
 * Brand's, they are all still there, and none of them is reachable from this
 * file. A personal post is not a small marketing post.
 */

/**
 * Ask for more than we return.
 *
 * The filter is expected to reject: that is what it is for. Over-generating is
 * how a batch survives losing three candidates to a repeated joke without
 * needing a second round trip, and the extra output is a rounding error against
 * the cost of the image tokens already in the request.
 */
const OVERSHOOT = 3;

/** A model that returns fewer than this after filtering gets one more go. */
const MIN_ACCEPTABLE = 2;

/** Personal has no floor worth speaking of. "ok" is a caption. */
const MIN_PERSONAL_CAPTION_LENGTH = 2;

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Pulls the candidates out of a reply.
 *
 * Deliberately tolerant of `behaviour` being missing or nonsense — it is
 * internal telemetry and a caption is not worth discarding over a label nobody
 * will ever see.
 */
function readCandidates(payload: RawPersonalPayload): Candidate[] {
  const raw = Array.isArray(payload.captions) ? payload.captions : [];

  return raw
    .map((item) => ({
      text: asString(item?.text),
      behaviour: asString(item?.behaviour).slice(0, 40),
    }))
    .filter((item) => item.text.length >= MIN_PERSONAL_CAPTION_LENGTH);
}

/**
 * The observation fields, for the two checks that need to know what is in the
 * picture: "does this caption just describe the photo" and "does it touch the
 * photo at all".
 */
function observationsOf(analysis: ImageAnalysis | null): string[] {
  if (!analysis) return [];
  return [
    analysis.primarySubject,
    analysis.setting,
    ...analysis.secondarySubjects,
    ...analysis.objects,
  ].filter(Boolean);
}

export interface WritePersonalOptions {
  request: CaptionRequest;
  provider: AiTextProvider;
  analysis: ImageAnalysis | null;
  /** The pixels, so the writer looks at the picture and not only at the read. */
  image: InlineImage | null;
  /** Rendered by `style/render.ts`. Null until they have a style. */
  styleSection?: string | null;
  /** Their real captions, labelled as evidence. Null when there is no history. */
  evidenceSection?: string | null;
  /** The raw captions behind that section, for the repetition check. */
  history?: string[];
  /** The measured half of their profile, for ranking. */
  style?: MeasuredStyle | null;
  /** When generation started, so `durationMs` covers stage one too. */
  startedAt: number;
}

export async function writePersonalCaption({
  request,
  provider,
  analysis,
  image,
  styleSection = null,
  evidenceSection = null,
  history = [],
  style = null,
  startedAt,
}: WritePersonalOptions): Promise<CaptionResult> {
  const observations = observationsOf(analysis);
  const wanted = request.variationCount;

  const built = buildPersonalPrompt(request, {
    imageAnalysis: analysis,
    styleSection,
    evidenceSection,
    count: wanted + OVERSHOOT,
  });

  const ask = async (extra?: string) =>
    (await provider.generateJson({
      systemInstruction: built.systemInstruction,
      prompt: extra ? `${built.prompt}\n\n${extra}` : built.prompt,
      responseSchema: built.responseSchema,
      temperature: built.temperature,
      // The bytes ride along, exactly as they do for Brand. The read is a
      // summary; the picture is the thing. A model writing while it can see
      // the photo picks up the detail no structured summary survives.
      ...(image && { images: [{ mimeType: image.mimeType, data: image.data }] }),
    })) as RawPersonalPayload;

  const payload = await ask();
  const read = payload.read;

  let { kept, dropped } = filterCandidates(readCandidates(payload), {
    history,
    observations,
  });

  // One repair pass, and only when the batch genuinely collapsed. Quoting what
  // was rejected and why is what makes the second attempt different from the
  // first — a bare "try again" returns the same jokes.
  if (kept.length < MIN_ACCEPTABLE && dropped.length > 0) {
    const rejected = dropped
      .slice(0, 6)
      .map((item) => `- "${item.text}" — rejected: ${item.reason}`)
      .join('\n');

    const retry = await ask(
      [
        '## These were rejected — do not repeat them or anything near them',
        rejected,
        'Write a completely different set. Different jokes, different structures, different starting words.',
      ].join('\n'),
    );

    const second = filterCandidates(readCandidates(retry), { history, observations });
    kept = [...kept, ...second.kept];
    dropped = [...dropped, ...second.dropped];
  }

  if (kept.length === 0) {
    throw new AiProviderError(
      'The AI did not return a usable caption. Please try again.',
      502,
      true,
      `personal: every candidate filtered (${dropped
        .slice(0, 4)
        .map((d) => d.reason)
        .join('; ')})`,
    );
  }

  const ranked = rankCandidates(kept, { history, observations, style }).slice(0, wanted);

  const variations: CaptionVariation[] = ranked.map((candidate) => ({
    // Empty on purpose. Brand's tone is a label the member chose to see;
    // `behaviour` is an internal decision, and showing "chaotic" over someone's
    // own caption turns a voice back into a menu of options.
    tone: '',
    caption: candidate.text,
    hook: '',
    wordCount: countWords(candidate.text),
  }));

  const durationMs = Date.now() - startedAt;

  console.info('[ai] personal caption generated', {
    model: provider.model,
    durationMs,
    asked: wanted + OVERSHOOT,
    kept: kept.length,
    returned: variations.length,
    // The two lines that answer "why did I only get two options" and "why is
    // this one on top", without needing the payload.
    dropped: dropped.map((item) => item.reason),
    behaviours: ranked.map((item) => item.behaviour),
    styled: Boolean(style),
    historyUsed: history.length,
    whatFits: asString(read?.whatFits).slice(0, 160),
  });

  return {
    caption: variations[0].caption,
    variations,
    // Personal posts carry none of these. Empty rather than absent because the
    // shape is shared with Brand and the browser reads both.
    hashtags: [],
    platformCaptions: {},
    ...(analysis && { imageAnalysis: analysis }),
    meta: {
      provider: provider.id,
      model: provider.model,
      durationMs,
      generatedAt: new Date().toISOString(),
      promptVersion: built.version,
    },
  };
}
