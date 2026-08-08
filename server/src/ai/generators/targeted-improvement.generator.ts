import { buildImprovePrompt, TARGET_KIND } from '../prompts/improve.prompt';
import { AiProviderError, type AiTextProvider } from '../providers';
import type {
  ImprovementRequest,
  RawImprovementPayload,
  TargetedImprovement,
} from '../types';

/**
 * Targeted improvement — the "Regenerate" behind one failed check.
 *
 * Sits beside the two engines rather than inside either. Creative Intelligence
 * writes a post; Marketing Intelligence judges one; this one repairs a named
 * part of one, and it is deliberately the least powerful of the three: it takes
 * a target, returns one passage, and has no path to touching anything else.
 *
 * Nothing here applies its own output. The result goes back to the browser as a
 * *proposal*, the member reads it, and only their click writes to the composer.
 * That split is the whole reason the endpoint exists separately from
 * `/api/ai/caption`, which returns something the composer may adopt wholesale.
 */

/** A caption shorter than this has nothing in it worth repairing. */
const MIN_IMPROVABLE_LENGTH = 12;

function asString(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * The tags, cleaned to what `withHashtags` can actually apply.
 *
 * A model asked for hashtags will occasionally return "#two words" or an empty
 * string. Both would survive into the caption as something that is not a tag,
 * so anything that is not a single tag-shaped token is dropped rather than
 * repaired — a wrong tag is worse than one fewer tag.
 */
function asHashtags(value: unknown, existing: readonly string[]): string[] {
  if (!Array.isArray(value)) return [];

  const seen = new Set(existing.map((tag) => tag.toLowerCase()));

  return value
    .map((entry) => asString(entry, 60).replace(/^#+/, '').trim())
    .filter((tag) => /^[\p{L}\p{N}_]+$/u.test(tag))
    .filter((tag) => {
      const key = tag.toLowerCase();
      // Never propose a tag the post already carries: it would apply to
      // nothing, and it makes the suggestion look padded.
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 8);
}

export interface TargetedImprovementDeps {
  provider: AiTextProvider;
}

/**
 * Produces one targeted improvement, or throws.
 *
 * Throws rather than degrading, and the caller must not touch the member's
 * caption when it does. There is no useful partial answer here: an improvement
 * that came back empty is a Regenerate that did nothing, and the honest thing
 * to show for it is "couldn't generate an improvement — your post hasn't been
 * changed" rather than an empty preview.
 */
export async function improveCaption(
  request: ImprovementRequest,
  { provider }: TargetedImprovementDeps,
): Promise<TargetedImprovement> {
  const startedAt = Date.now();

  if (request.caption.trim().length < MIN_IMPROVABLE_LENGTH) {
    throw new AiProviderError(
      'There is not enough caption here to improve yet. Write a line or two first.',
      422,
      false,
      `caption length ${request.caption.trim().length}`,
    );
  }

  const built = buildImprovePrompt(request);

  const payload = (await provider.generateJson({
    systemInstruction: built.systemInstruction,
    prompt: built.prompt,
    responseSchema: built.responseSchema,
    temperature: built.temperature,
  })) as RawImprovementPayload;

  const kind = TARGET_KIND[request.target];
  const note = asString(payload.note, 120);

  const improvement: TargetedImprovement = {
    target: request.target,
    kind,
    note,
    meta: {
      provider: provider.id,
      model: provider.model,
      durationMs: Date.now() - startedAt,
    },
  };

  if (kind === 'hashtags') {
    const hashtags = asHashtags(payload.hashtags, request.hashtags);
    if (hashtags.length === 0) {
      throw new AiProviderError(
        'The AI could not suggest better hashtags for this post. Please try again.',
        502,
        true,
        `no usable hashtags: ${JSON.stringify(payload).slice(0, 300)}`,
      );
    }
    return { ...improvement, hashtags };
  }

  if (kind === 'replace') {
    const caption = asString(payload.caption, 8000);
    // A "rewrite" that comes back identical, or shorter than a sentence, is not
    // an improvement the member can act on.
    if (caption.length < MIN_IMPROVABLE_LENGTH) {
      throw new AiProviderError(
        'The AI could not rewrite this caption. Please try again.',
        502,
        true,
        `unusable caption: ${JSON.stringify(payload).slice(0, 300)}`,
      );
    }
    return { ...improvement, caption };
  }

  const line = asString(payload.line, 300);
  if (!line) {
    throw new AiProviderError(
      'The AI could not write an improvement for this. Please try again.',
      502,
      true,
      `no usable line: ${JSON.stringify(payload).slice(0, 300)}`,
    );
  }

  return { ...improvement, line };
}
