import { renderBrandSection } from '../brand/brand-profile';
import { platformLabel } from '../analysis/platform-rules';
import { SPAM_TAGS, type HashtagBudget } from '../hashtags/rules';
import type { BrandProfile, CaptionMode, ImageAnalysis } from '../types';

/**
 * Every word the hashtag model is told.
 *
 * ─── Why hashtags have their own call ────────────────────────────────────────
 * They used to be a field on the caption response, and that is where they went
 * wrong: a model in the middle of writing three caption variations treats the
 * tag list as an afterthought, and what comes back is the topic restated with
 * hashes in front of it. Asking separately means the tags are chosen against the
 * *finished* caption — including one the member wrote or edited themselves,
 * which the caption call never sees.
 *
 * It also means tags can be regenerated without regenerating the copy, which is
 * the thing members actually want.
 *
 * ─── What the model is and is not asked ──────────────────────────────────────
 * It is asked for **relevance**, and nothing else. Cleaning, deduplication, the
 * spam filter and the platform ceiling are all arithmetic and string work, and
 * they run in `hashtags/rules.ts` after this returns — so a model that ignores
 * the count or slips a banned tag through cannot produce a bad result, only a
 * trimmed one. The same division of labour `ai/analysis` keeps.
 */

export const HASHTAG_PROMPT_VERSION = 1;

const SYSTEM_INSTRUCTION = `You choose hashtags for social posts. You are not a keyword tool.

Rules you do not break:
- Every tag must be about THIS post — its image, its subject, its words. A tag that would fit any post in the category is not a tag, it is filler.
- Prefer specific over popular. A niche tag with a real community beats a broad one with a hundred million posts.
- Returning NO hashtags is a correct answer when tags would make the post read as marketing. Say so in the note and return empty lists.
- Never invent a branded or campaign tag the account has not used. If you have not been shown it, it does not exist.
- Never claim a tag will get reach. You have no reach data and are not being asked for one.
- Output JSON only.`;

/**
 * Which registers suit which network.
 *
 * Deliberately about *behaviour* rather than counts — the counts arrive
 * separately from `hashtags/rules.ts`, which reads them from the same table the
 * analyser scores against, so there is no number here to drift.
 */
const PLATFORM_HABIT: Record<string, string> = {
  instagram:
    'Instagram: discovery genuinely runs on tags. Niche and community tags work; a wall of broad ones does not.',
  linkedin:
    'LinkedIn: a very small number of professional, topical tags. Anything playful or hash-stuffed reads as spam here.',
  facebook:
    'Facebook: tags do almost nothing for reach. Include one only when it is a real campaign or event tag.',
  x: 'X: at most a couple, and only when the tag is genuinely how a conversation is being followed.',
  threads:
    'Threads: one topic tag at most — the platform surfaces a single topic per post.',
};

function platformSection(platforms: readonly string[]): string {
  if (platforms.length === 0) return '';

  const habits = platforms
    .map((platform) => PLATFORM_HABIT[platform.toLowerCase()])
    .filter((habit): habit is string => Boolean(habit));

  return [
    `## Where this is going`,
    `Networks: ${platforms.map(platformLabel).join(', ')}`,
    ...habits.map((habit) => `- ${habit}`),
  ].join('\n');
}

/**
 * The count, and what to do when the networks disagree about it.
 *
 * A conflict is not smoothed over. Instagram wants at least three tags and X
 * tolerates at most two, so there is no single count that suits a post going to
 * both — and the useful instruction in that case is to choose the few that carry
 * the post everywhere and leave the rest to `secondary`, rather than to split the
 * difference and be wrong on one network.
 */
function budgetSection(budget: HashtagBudget): string {
  if (budget.max === 0) {
    return [
      '## How many',
      'Zero. Return empty lists and say in the note that this post does not want tags.',
    ].join('\n');
  }

  const lines = [
    '## How many',
    `- primary: at most ${budget.max}. These go in the caption on every selected network, so they must suit all of them.`,
    '- secondary: up to 5 more, offered to the member and not published automatically. Genuinely relevant only — this is not the overflow bin.',
    `- Fewer than ${budget.max} is fine. ${budget.max} weak tags is worse than two strong ones.`,
  ];

  if (budget.conflict) {
    lines.push(
      `- The selected networks disagree about hashtag count: one of them wants more than another tolerates. ${budget.max} is the tighter ceiling and it binds. Put the tags that work everywhere in primary.`,
    );
  }

  return lines.join('\n');
}

function imageSection(analysis: ImageAnalysis | null): string {
  if (!analysis) return '';

  const lines = [
    '## What the picture actually shows',
    analysis.primarySubject && `- Subject: ${analysis.primarySubject}`,
    analysis.sceneDescription && `- Scene: ${analysis.sceneDescription}`,
    analysis.setting && `- Setting: ${analysis.setting}`,
    analysis.mood && `- Mood: ${analysis.mood}`,
    analysis.themes.length > 0 && `- Themes: ${analysis.themes.join(', ')}`,
    analysis.objects.length > 0 && `- In frame: ${analysis.objects.slice(0, 8).join(', ')}`,
    analysis.textInImage.length > 0 &&
      `- Words legible in the image: ${analysis.textInImage.join(', ')}`,
    analysis.productCategory && `- Product category: ${analysis.productCategory}`,
    // The honesty valve. A shaky read must not become confident tags.
    analysis.confidenceScore < 40 &&
      '- This read of the image is uncertain. Lean on the caption and the topic instead of the picture.',
  ].filter((line): line is string => typeof line === 'string' && line.length > 0);

  return lines.join('\n');
}

/**
 * The register a personal account's tags sit in.
 *
 * A different job from a brand's, not a smaller one. A person's tags are
 * contextual and often a joke; a brand's are discovery. Handing a personal post
 * the brand instruction set produces the tag block that makes somebody's holiday
 * photo look like an ad, which is the specific failure this branch exists to
 * avoid.
 */
const PERSONAL_BRIEF = `## This is a personal post, not a brand's
- Fewer tags. Two or three that mean something, or none.
- Contextual and specific beats discoverable. Where they are, what it is, the in-joke.
- No industry tags, no audience tags, no campaign tags. There is no campaign.
- If the post reads better bare — and personal posts usually do — return nothing and say so.`;

const BRAND_BRIEF = `## This is a brand's post
Draw from, in this order of usefulness:
- the specific thing shown or sold
- the niche or community it belongs to
- the audience it is for
- the industry, only if it is not already covered
- a place, event or season, only where genuinely relevant
Do not include the brand's own name as a tag unless the account has demonstrably used it as one.`;

export interface HashtagPromptContext {
  mode: CaptionMode;
  platforms: string[];
  /** The caption as it stands — the member's edits included. */
  caption: string;
  topic: string;
  budget: HashtagBudget;
  imageAnalysis?: ImageAnalysis | null;
  brand?: BrandProfile | null;
  /** The rendered record from `ai/learning/hashtag-history.ts`. */
  historySection?: string | null;
  language: string;
}

export interface BuiltHashtagPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  temperature: number;
}

/**
 * The response contract.
 *
 * `note` is required so the model always has somewhere to put "this post is
 * better without tags" — an optional field there would be omitted exactly when
 * it matters, leaving an empty list with no explanation for the member.
 */
export function buildHashtagResponseSchema(
  budget: HashtagBudget,
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      primary: {
        type: 'array',
        description:
          'Tags to publish, without the # — may be empty when the post is better without any.',
        items: { type: 'string' },
        maxItems: Math.max(budget.max, 1),
      },
      secondary: {
        type: 'array',
        description: 'Relevant extras, offered to the member. May be empty.',
        items: { type: 'string' },
        maxItems: 5,
      },
      note: {
        type: 'string',
        description:
          'One short line for the member on why these — or why none. No reach claims.',
      },
    },
    required: ['primary', 'secondary', 'note'],
  };
}

export function buildHashtagPrompt(
  context: HashtagPromptContext,
): BuiltHashtagPrompt {
  const personal = context.mode === 'personal';

  const sections = [
    personal ? PERSONAL_BRIEF : BRAND_BRIEF,

    context.topic && `## What the post is about\n${context.topic}`,

    context.caption.trim() &&
      `## The caption as it will publish\nChoose tags for THIS text, not for the topic in the abstract.\n"""\n${context.caption.trim()}\n"""`,

    imageSection(context.imageAnalysis ?? null),

    // Only for a brand: a personal post has no positioning to draw tags from,
    // and handing one a brand block is how a person's post grows an industry tag.
    // `?? ''` because an empty brand profile renders to null, and the filter
    // below measures length rather than truthiness.
    !personal && context.brand ? (renderBrandSection(context.brand) ?? '') : '',

    context.historySection ?? '',

    platformSection(context.platforms),

    budgetSection(context.budget),

    // Named explicitly rather than left to "avoid generic tags". A model told to
    // be specific still reaches for #viral; a model shown the list does not.
    `## Never return these\n${[...SPAM_TAGS].slice(0, 24).map((tag) => `#${tag}`).join(' ')}\nand anything like them — reach-farming tags that describe no post in particular. The one exception is a tag this account's own record above shows it genuinely uses.`,

    context.language && context.language.toLowerCase() !== 'english'
      ? `## Language\nThe caption is in ${context.language}. Tags may be in ${context.language}, in English, or both — whichever a real user of this network would search.`
      : '',

    '## Output\nJSON only: {"primary": [...], "secondary": [...], "note": "..."}\nTags without the leading #. No duplicates between the two lists.',
  ].filter((section) => section.length > 0);

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt: sections.join('\n\n'),
    responseSchema: buildHashtagResponseSchema(context.budget),
    // Lower than caption writing. Tag selection is a judgement about relevance,
    // and temperature buys nothing but drift.
    temperature: 0.5,
  };
}
