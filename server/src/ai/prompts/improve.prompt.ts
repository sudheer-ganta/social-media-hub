import { platformLabel } from '../analysis/platform-rules';
import type {
  ImageAnalysis,
  ImprovementKind,
  ImprovementRequest,
  ImprovementTarget,
} from '../types';
import type { BuiltPrompt } from './caption.prompt';

/**
 * Targeted improvement — fix one thing, leave the rest alone.
 *
 * The third prompt, and the smallest. Creative Intelligence writes a post from
 * a brief; Marketing Intelligence judges one. This one is asked a much narrower
 * question: *this specific check failed — produce the specific text that would
 * pass it, and change nothing else.*
 *
 * ─── Why not reuse the caption generator ─────────────────────────────────────
 * Because "the hook is too long" is not a brief. Handing the whole post back to
 * the caption generator returns a different post: new angle, new facts, new
 * voice. The member wrote something they meant, and the one thing they asked
 * for was a shorter opening line. A generator that answers that by rewriting
 * everything is not an assistant, it is a replacement — and it silently
 * discards the details only the member knew.
 *
 * So every target below is scoped to a passage, and three of the four can only
 * *add* text. Only `readability` returns a whole caption, and that one is the
 * reason the UI shows a before/after and makes the member choose.
 *
 * ─── What it is never allowed to do ──────────────────────────────────────────
 * Invent facts, drop the member's facts, change the topic, change the song, or
 * write something that would fit any post. A generic improvement is worse than
 * no improvement: it reads like AI, and the member can tell.
 */

export const IMPROVE_PROMPT_VERSION = 1;

export const IMPROVE_SYSTEM_INSTRUCTION = `You improve one specific part of a social post that a reviewer has flagged. You are not rewriting the post.

The rules, in order of importance:
- The post belongs to the person who wrote it. Their topic, their facts, their opinions and their voice all survive your change. You are fixing a mechanical or structural problem, not replacing their thinking.
- Change only what you were asked to change. If you were asked for an opening line, return an opening line — not a new caption.
- Never invent a fact that is not already in the caption or visible in the image. No statistics, no names, no claims, no events.
- Match the register of what is already there. If they write in lowercase, write in lowercase. If they do not use emoji, do not add emoji.
- Be specific to this post. If your output would fit any other post on the same topic, it is wrong — write it again before you answer.
- Return only the JSON object described. No commentary, no markdown fences.`;

/** What each target is actually asking the model to produce. */
const TARGET_BRIEF: Record<ImprovementTarget, string> = {
  hook: 'Write ONE opening line to be placed above the caption as it stands. The member\'s current first line stays, directly beneath yours — so yours must lead into it rather than repeat or replace it. Short, concrete, and specific to this post: it is the only line most people will read.',
  readability:
    'Rewrite the caption so it is easier to read on a phone at a glance — shorter sentences, blank lines between thoughts, plainer words. Every fact, name, number, opinion and link in the original must still be present, and the meaning must not shift. This is a re-shaping of their words, not a new caption on the same subject. Keep any hashtags exactly as they are and in the same place.',
  cta: 'Write ONE sentence to be appended to the end of the caption that gives this specific reader a real reason to reply. It must come out of what the post is actually about — a question only someone who read this post could answer. No generic prompts ("thoughts?", "comment below", "double tap"), and nothing that asks for engagement for its own sake.',
  hashtags:
    'Propose hashtags that describe what this post is actually about — the subject, the specific thing pictured or named, the niche. Specific beats broad: a tag that could sit under a million unrelated posts brings the wrong audience or none. Return the tags to ADD; the ones already on the post are kept and must not be repeated.',
};

/** The kind of change each target produces. Ours to decide, not the model's. */
export const TARGET_KIND: Record<ImprovementTarget, ImprovementKind> = {
  hook: 'lead',
  readability: 'replace',
  cta: 'line',
  hashtags: 'hashtags',
};

function section(heading: string, lines: Array<string | null | undefined | false>) {
  const body = lines.filter((line): line is string => Boolean(line && String(line).trim()));
  return body.length > 0 ? `${heading}\n${body.join('\n')}` : null;
}

function imageSection(analysis: ImageAnalysis | undefined, hasImage: boolean): string | null {
  if (!hasImage) return null;
  if (!analysis) {
    return '## The image\nThis post has an image, but no analysis of it was supplied. Do not describe it — you cannot see it.';
  }

  return section('## What the image contains', [
    analysis.primarySubject && `- Main subject: ${analysis.primarySubject}`,
    analysis.sceneDescription && `- Scene: ${analysis.sceneDescription}`,
    analysis.mood && `- Mood: ${analysis.mood}`,
    analysis.themes.length > 0 && `- Themes: ${analysis.themes.join('; ')}`,
  ]);
}

/**
 * The response schema, built per target.
 *
 * One field per target rather than one schema with four optional fields: a
 * model given somewhere else to put its answer will occasionally put it there,
 * and a `caption` returned for a `hook` request is a whole-post rewrite arriving
 * through the door marked "opening line".
 */
export function buildImproveResponseSchema(
  target: ImprovementTarget,
): Record<string, unknown> {
  const note = {
    type: 'string',
    description:
      'At most 12 words naming what you changed, e.g. "Shorter opening, leads with the contrast".',
  };

  if (target === 'hashtags') {
    return {
      type: 'object',
      properties: {
        hashtags: {
          type: 'array',
          minItems: 1,
          maxItems: 8,
          items: { type: 'string', description: 'One tag, without the # and without spaces.' },
        },
        note,
      },
      required: ['hashtags', 'note'],
    };
  }

  if (target === 'readability') {
    return {
      type: 'object',
      properties: {
        caption: {
          type: 'string',
          description:
            'The full caption, re-shaped for readability, carrying every fact from the original.',
        },
        note,
      },
      required: ['caption', 'note'],
    };
  }

  return {
    type: 'object',
    properties: {
      line: {
        type: 'string',
        description:
          target === 'hook'
            ? 'One opening line, to sit above the existing caption.'
            : 'One sentence, to sit at the end of the caption.',
      },
      note,
    },
    required: ['line', 'note'],
  };
}

export function buildImprovePrompt(request: ImprovementRequest): BuiltPrompt {
  const prompt = [
    section('## The caption as it stands', [
      '"""',
      request.caption,
      '"""',
      request.hashtags.length > 0
        ? `Hashtags already on it: ${request.hashtags.map((tag) => `#${tag}`).join(' ')}`
        : 'It carries no hashtags.',
    ]),

    section('## Where it is going', [
      request.platforms.length > 0
        ? `- Networks: ${request.platforms.map(platformLabel).join(', ')}`
        : '- No network chosen yet. Keep it neutral.',
      `- Written for: ${request.audience.replace(/_/g, ' and ')}`,
      `- Language: ${request.language}`,
      // Context only. The song is the member's decision and nothing here
      // changes it — it is in the prompt so the tone can match, no more.
      request.music && `- The member chose this song for the post: ${request.music}. Match its mood; do not mention or change it.`,
    ]),

    imageSection(request.imageAnalysis, request.hasImage),

    section('## What the reviewer flagged', [
      request.issue && `- The problem: ${request.issue}`,
      request.recommendation && `- What was recommended: ${request.recommendation}`,
    ]),

    section('## Your task', [TARGET_BRIEF[request.target]]),

    'Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemInstruction: IMPROVE_SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: buildImproveResponseSchema(request.target),
    // Higher than analysis (0.25) and lower than a cold generation: a second
    // press of Regenerate should offer a genuinely different line, but not a
    // different post.
    temperature: 0.7,
    version: IMPROVE_PROMPT_VERSION,
  };
}
