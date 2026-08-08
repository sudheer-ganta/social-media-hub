import { renderBrandSection } from '../brand/brand-profile';
import type { BrandProfile, CaptionRequest, ImageAnalysis } from '../types';

/**
 * Creative Intelligence: write the copy.
 *
 * Everything the model is told lives here — persona, what the image contains,
 * marketing framing, brand voice, audience register, platform rules, output
 * schema. The generator calls `buildCaptionPrompt` and passes the result to a
 * provider; no prompt text exists anywhere else in the backend.
 *
 * Why a builder rather than one template string: the same inputs (goal, funnel
 * stage, brand voice, audience, length, platform) recombine into every request,
 * and each has real marketing meaning attached to it. Keeping that meaning in
 * lookup tables makes it reviewable by someone who does not read TypeScript,
 * and makes "why did it write it that way" answerable.
 *
 * ─── What changed in v2 ──────────────────────────────────────────────────────
 * v1 told the model: *"the post has an image; write copy that complements a
 * visual rather than describing it, and never claim to know what the image
 * shows."* That sentence was doing real damage. Nothing was ever sending the
 * model the image — only its URL, as text — so "never claim to know" was the
 * honest instruction for a model that genuinely could not see. The result was a
 * caption written from the topic word alone: upload a shot of a candlelit stone
 * hall to a wedding brand and you got "Celebrate your wedding…".
 *
 * Now the image is fetched and analysed first (`generators/image-analysis`),
 * and this prompt receives what is actually in the frame. So the instruction
 * inverts: the model is told what is there and required to build from it. The
 * old wording survives only for the case it was always right about — a post
 * whose image could not be analysed.
 *
 * ─── What changed in v3 ──────────────────────────────────────────────────────
 * The brand block is no longer assembled here. It comes from Brand
 * Intelligence (`brand/brand-profile.ts`), which merges what the user typed
 * with what Vision saw and renders one `## Brand` section that this prompt and
 * the analysis prompt both use.
 *
 * That is not a tidy-up. The two prompts would otherwise have separate
 * renderers, so a caption could be written against one brand description and
 * scored against another — a discrepancy that never shows up as an error, only
 * as scores that feel slightly wrong. One renderer makes that unsayable. It
 * also brings three facts into this prompt that were sitting unused in the
 * request: what the brand sells, its USP, and who it competes with.
 */

/**
 * ─── What changed in v4 ──────────────────────────────────────────────────────
 * Audio became part of the brief. A post's song is half of what a reel *is* on
 * Instagram and TikTok, and the composer has always had the field — the prompt
 * just never saw it. Now it does, in one of two directions:
 *
 *   music chosen  → write copy that sits with that track. Suggest nothing.
 *   music empty   → suggest a few tracks that fit, each with a reason.
 *
 * The asymmetry is the point. A user who typed "Espresso — Sabrina Carpenter"
 * has decided; handing them alternatives is noise, and overwriting the field is
 * the one behaviour this assistant is forbidden.
 */

/** Bump when the prompt's shape changes, so `meta.promptVersion` stays honest. */
export const CAPTION_PROMPT_VERSION = 4;

/** How many audio ideas to ask for when the user has not picked one. */
const SONG_SUGGESTION_COUNT = 4;

/**
 * Whether this request should come back with audio ideas.
 *
 * Two conditions, and both are refusals rather than permissions: the caller has
 * to have asked (Brand never does, so its prompt is unchanged), and the Music /
 * Song field has to be empty (a chosen song is never offered alternatives).
 *
 * Shared by the schema and the instruction list so the two can never disagree —
 * a schema key the instructions do not mention is a key the model fills with
 * whatever it likes.
 */
export function wantsSongSuggestions(request: CaptionRequest): boolean {
  return request.suggestSongs && !request.music?.trim();
}

// ─── Persona ─────────────────────────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a senior social media copywriter, marketing strategist, and brand consultant. You write punchy, human copy that lands.

Rules you never break:
- Write copy a human would actually post. No filler, no AI clichés (e.g. "embracing the journey", "every step", "unwavering resolve", "vibes", "in today's fast-paced world").
- Banned openings and phrases: "Elevate", "Unlock", "Dive in", "In a world where", "Introducing", "Level up", "game-changer", "Look no further", "Say goodbye to", "Picture this", "Every epic journey", "look of unwavering resolve". If your first line could open any brand's post, it is the wrong first line.
- Content MUST be about THIS SPECIFIC IMAGE and post subject — incorporate visible details, setting, mood, characters, or pop-culture references from the image into the copy.
- Open with a hook that earns the second line.
- Match the requested language exactly, including hashtags.
- Return only the JSON object described in the request. No commentary, no markdown fences.`;

// ─── Marketing framing ───────────────────────────────────────────────────────

const GOAL_BRIEF: Record<string, string> = {
  brand_awareness:
    'Build recognition. Make it memorable and shareable rather than salesy.',
  lead_generation:
    'Capture attention and drive an enquiry or sign-up. Make the next step obvious.',
  website_traffic:
    'Create enough curiosity that clicking through is the natural next move.',
  sales: 'Persuade and convert. Lead with the value proposition.',
  bookings: 'Build desire and gentle urgency to book now.',
  product_launch: 'Generate excitement and anticipation for something new.',
  event_promotion: 'Create anticipation and a reason not to miss it.',
  newsletter: 'Demonstrate the value of subscribing before asking.',
  community_building:
    'Invite a response. Ask something worth answering in the comments.',
  customer_retention:
    'Speak to people who already bought. Reward them, do not re-pitch them.',
};

const FUNNEL_BRIEF: Record<string, string> = {
  TOFU: 'Cold audience who do not know this brand. Educate or entertain first; sell nothing.',
  MOFU: 'Warm audience comparing options. Build trust and lead with benefits.',
  BOFU: 'Ready to decide. Be direct, remove friction, close.',
  Retention:
    'Existing customers. Be relational and appreciative, not promotional.',
};

const LENGTH_BRIEF: Record<string, string> = {
  Short: 'Roughly 25–50 words. One idea, tightly written.',
  Medium: 'Roughly 60–110 words. A hook, a middle, a call to action.',
  Long: 'Roughly 130–220 words. Room for a short story or a few points.',
};

// ─── Audience register ───────────────────────────────────────────────────────

/**
 * How the sentences are built, as opposed to what they argue.
 *
 * This is the knob that decides whether a wedding brand sounds like a brochure
 * or like a friend with taste. It is separate from brand voice on purpose: the
 * brand does not change when the audience does, but every line of the copy
 * does.
 *
 * The generational briefs are written as *craft rules*, not as slang lists.
 * A model handed a vocabulary of "rizz / no cap / bestie" produces something
 * that reads as an adult impersonating a teenager, which is worse for a brand
 * than sounding plain — so each one names what to avoid as explicitly as what
 * to do.
 */
const AUDIENCE_BRIEF: Record<string, string> = {
  gen_z: `Write for Gen Z (roughly 18–27).
- Sound like a person typing, not a brand announcing. Sentence fragments are fine. Rhythm beats grammar.
- Short lines. Line breaks do the work punctuation used to.
- Dry, self-aware humour — slightly unserious even about serious things. Confidence without try-hard energy.
- Lead with the feeling or the tension, never the feature. Nobody is here for a spec sheet.
- Lowercase openings are acceptable if the brand's emoji and CTA style are relaxed.
- Do NOT use manufactured slang ("rizz", "no cap", "slay", "bestie", "it's giving", "main character energy", "understood the assignment") unless the brand voice explicitly asks for it. Borrowed slang reads as an ad pretending to be a friend.
- At most one emoji, and only if it adds meaning. Never a string of them.
- No exclamation-mark enthusiasm. No hype adjectives stacked together.
- The hook should read like the first line of a message someone actually sent.`,

  millennial: `Write for millennials (roughly 28–43).
- Warm, conversational, a little self-deprecating. Contractions always.
- Open on a small specific moment rather than a general claim — the specific is what makes it feel true.
- Complete sentences, relaxed rhythm. Room for one aside in parentheses.
- Light nostalgia works when it is earned. References from the 2000s and 2010s land; forced ones do not.
- Emoji sparingly and functionally — one or two, doing a job.
- Avoid both corporate polish and borrowed teen slang. This audience recognises both instantly.
- An honest, human sign-off beats a hard sell.`,

  gen_z_millennial: `Write for a Gen Z and millennial audience (roughly 20–40) — the register most of this platform's readers share.
- Hook like Gen Z: short, dry, a little unexpected. The first line has to survive a thumb moving at speed.
- Body like a millennial: warm, specific, a real thought rather than a slogan.
- Fragments and line breaks are welcome. Corporate cadence is not.
- Humour is understated and self-aware. Emotion is allowed to be direct, never saccharine.
- Do NOT use manufactured slang ("rizz", "no cap", "slay", "bestie", "it's giving") unless the brand voice explicitly asks. Do NOT stack hype adjectives.
- One emoji at most, only if it earns its place.
- Test every line against: would a real person send this to a friend, or does it read like an ad? If it reads like an ad, rewrite it.`,

  professional: `Write for a professional audience reading at work.
- Clear, credible and specific. Respect the reader's time in the first sentence.
- Insight or a concrete point of view, not enthusiasm.
- Short paragraphs. No jargon that a smart outsider would need to decode.
- No emoji unless the brand's style calls for them. No hype.`,

  broad: `Write for a broad general audience.
- Plain, warm and immediately understandable. Nothing that needs decoding.
- Concrete over abstract, short over long.
- Neutral on slang and light on emoji.`,
};

/**
 * Per-network writing rules. An unknown platform gets generic advice rather
 * than nothing — a new network in the catalogue should not need a change here
 * to produce a usable caption.
 */
const PLATFORM_BRIEF: Record<string, string> = {
  linkedin:
    'LinkedIn: professional but human. Short paragraphs with line breaks. 1–3 hashtags at the end. No hashtag walls. The first two lines show before "…see more", so front-load the hook.',
  instagram:
    'Instagram: warm and visual-first. Emoji are welcome if the brand allows them. Hashtags belong in a block at the end. The first 125 characters show before "more".',
  facebook:
    'Facebook: conversational and accessible. Keep it short and ask something that invites a reply. 0–2 hashtags.',
  x: 'X: under 280 characters including hashtags. One sharp idea, no preamble. At most 2 hashtags.',
  youtube:
    'YouTube: a description, not a caption. Lead with what the viewer gets, then context. Hashtags on their own final line.',
  tiktok:
    'TikTok: casual, fast and native to the platform. Very short. 3–5 trend-aware hashtags.',
  threads:
    'Threads: conversational and informal, like talking to peers. Under 500 characters. Hashtags are rare — use at most one.',
};

const DEFAULT_PLATFORM_BRIEF =
  'Keep it self-contained, lead with the hook, and place any hashtags at the end.';

// ─── Tone ladder ─────────────────────────────────────────────────────────────

/**
 * Which tones the variations are written in, in priority order. Asking for N
 * *named, distinct* tones is what stops a model handing back three paraphrases
 * of the same sentence — the usual failure mode of "give me 3 options".
 *
 * Paired with the angle requirement below, this is now doing half the job: the
 * tone controls the voice, the angle controls what the option is *about*. Two
 * captions in the same tone from different angles are genuinely different
 * options; two from the same angle never are, whatever you label them.
 *
 * The names are drawn from the frontend's `ContentTone` union so a variation
 * lands on a tone the studio UI already has a colour for. Adding one here
 * means adding it there too.
 */
const VARIATION_TONES = [
  'Storytelling',
  'Emotional',
  'Minimal',
  'Creative',
  'Professional',
];

// ─── Response schema ─────────────────────────────────────────────────────────

/**
 * The JSON Schema the provider enforces and the generator validates against.
 * Built per request so `platformCaptions` names the platforms actually asked
 * for; a model given an open-ended map invents keys.
 */
export function buildCaptionResponseSchema(
  request: CaptionRequest,
): Record<string, unknown> {
  const platformProperties = Object.fromEntries(
    request.platforms.map((platform) => [
      platform,
      { type: 'string', description: `The caption rewritten for ${platform}.` },
    ]),
  );

  return {
    type: 'object',
    properties: {
      // Asked for first, and used by the captions that follow. Making the model
      // commit to distinct directions *before* it writes is what stops three
      // options that are one option in three outfits.
      angles: {
        type: 'array',
        minItems: request.variationCount,
        maxItems: request.variationCount,
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Short label for this creative direction.',
            },
            premise: {
              type: 'string',
              description: 'The idea in one sentence.',
            },
            imageHook: {
              type: 'string',
              description:
                'What in the image this direction is built on. If there is no image, what in the brief it is built on.',
            },
          },
          required: ['name', 'premise', 'imageHook'],
        },
      },
      variations: {
        type: 'array',
        minItems: request.variationCount,
        maxItems: request.variationCount,
        items: {
          type: 'object',
          properties: {
            angle: {
              type: 'string',
              description: 'The name of the angle this option uses.',
            },
            tone: { type: 'string', description: 'The named tone used.' },
            caption: { type: 'string', description: 'The full caption text.' },
            hook: {
              type: 'string',
              description: 'The opening line of the caption, on its own.',
            },
            whyItWorks: {
              type: 'string',
              description:
                'One sentence on why this option should land with this audience.',
            },
          },
          required: ['tone', 'caption', 'hook'],
        },
      },
      hashtags: {
        type: 'array',
        maxItems: Math.max(request.hashtagCount, 1),
        items: { type: 'string', description: 'A hashtag without the # sign.' },
      },
      // Only asked for when the field is empty. A model given the key while the
      // user has already chosen a song will fill it, and a filled list in the
      // UI invites replacing a decision that was already made.
      ...(wantsSongSuggestions(request) && {
        songSuggestions: {
          type: 'array',
          maxItems: SONG_SUGGESTION_COUNT,
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'The track title.' },
              artist: { type: 'string', description: 'The performing artist.' },
              reason: {
                type: 'string',
                description:
                  'One sentence on why this track fits this post, referring to the actual content.',
              },
            },
            required: ['title', 'artist', 'reason'],
          },
        },
      }),
      ...(request.platforms.length > 0 && {
        platformCaptions: {
          type: 'object',
          properties: platformProperties,
          required: request.platforms,
        },
      }),
      ...(request.features?.seo && {
        seo: {
          type: 'object',
          properties: {
            primaryKeyword: { type: 'string', description: 'Main keyword targeted by this post.' },
            keywords: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  keyword: { type: 'string' },
                  relevanceScore: { type: 'number', description: '0 to 100' },
                  difficultyScore: { type: 'number', description: '0 to 100' },
                  intent: { type: 'string', enum: ['informational', 'commercial', 'transactional', 'navigational'] },
                },
                required: ['keyword', 'relevanceScore', 'difficultyScore', 'intent'],
              },
            },
            metaTitle: { type: 'string', description: 'SEO title tag.' },
            metaDescription: { type: 'string', description: 'Meta description tag.' },
            altText: { type: 'string', description: 'Image alt text.' },
            slug: { type: 'string', description: 'URL slug.' },
            readabilityScore: { type: 'number', description: '0 to 100' },
          },
          required: ['primaryKeyword', 'keywords', 'metaTitle', 'metaDescription', 'altText', 'slug', 'readabilityScore'],
        },
      }),
      ...(request.features?.campaign && {
        campaign: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Campaign name.' },
            bigIdea: { type: 'string', description: 'Core thematic angle.' },
            durationDays: { type: 'number', description: 'Campaign duration in days.' },
            beats: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  day: { type: 'number' },
                  channel: { type: 'string' },
                  angle: { type: 'string' },
                  contentIdea: { type: 'string' },
                },
                required: ['day', 'channel', 'angle', 'contentIdea'],
              },
            },
            kpis: { type: 'array', items: { type: 'string' } },
            budgetTier: { type: 'string', enum: ['organic', 'low', 'medium', 'high'] },
          },
          required: ['name', 'bigIdea', 'durationDays', 'beats', 'kpis', 'budgetTier'],
        },
      }),
      ...(request.features?.competitorAnalysis && {
        competitor: {
          type: 'object',
          properties: {
            brandName: { type: 'string' },
            positioning: { type: 'string' },
            toneObserved: { type: 'string' },
            contentThemes: { type: 'array', items: { type: 'string' } },
            postingFrequency: { type: 'string' },
            strengths: { type: 'array', items: { type: 'string' } },
            weaknesses: { type: 'array', items: { type: 'string' } },
            gaps: { type: 'array', items: { type: 'string' } },
            differentiationAdvice: { type: 'string' },
          },
          required: ['brandName', 'positioning', 'toneObserved', 'contentThemes', 'postingFrequency', 'strengths', 'weaknesses', 'gaps', 'differentiationAdvice'],
        },
      }),
    },
    required: ['angles', 'variations', 'hashtags'],
  };
}

// ─── Prompt assembly ─────────────────────────────────────────────────────────

/** Drops empty sections so the model never reads a heading with nothing under it. */
function section(heading: string, lines: Array<string | null | undefined>) {
  const body = lines.filter((line): line is string => Boolean(line?.trim()));
  return body.length > 0 ? `${heading}\n${body.join('\n')}` : null;
}

function list(label: string, values: string[] | undefined): string | null {
  return values?.length ? `- ${label}: ${values.join('; ')}` : null;
}

/**
 * What stage one saw, written out as fact.
 *
 * Split into two headings for the same reason stage one produced two blocks:
 * the model should know which lines it may treat as ground truth and which are
 * a strategist's read it is free to disagree with.
 *
 * `confidenceScore` is passed through as an instruction rather than a number.
 * A model told "confidence: 34" does nothing with it; a model told the read is
 * shaky and to lean on the brand instead actually changes what it writes.
 */
function imageSection(analysis: ImageAnalysis): string {
  const observation = section('## What the image actually shows (fact)', [
    analysis.primarySubject && `- Main subject: ${analysis.primarySubject}`,
    list('Also in frame', analysis.secondarySubjects),
    list('Objects', analysis.objects),
    analysis.sceneDescription && `- Scene: ${analysis.sceneDescription}`,
    analysis.setting && `- Setting: ${analysis.setting}`,
    analysis.composition && `- Composition: ${analysis.composition}`,
    analysis.lighting && `- Light: ${analysis.lighting}`,
    analysis.mood && `- Mood: ${analysis.mood}`,
    list('Dominant colours', analysis.colorPalette),
    analysis.brandStyle && `- Aesthetic: ${analysis.brandStyle}`,
    list('Text visible in the image', analysis.textInImage),
  ]);

  const reading = section('## What the image gives you to work with', [
    list('Emotions it can trigger', analysis.emotions),
    list('Themes it carries', analysis.themes),
    list('What its elements can symbolise', analysis.symbolism),
    list('Storytelling openings it offers', analysis.storyAngles),
    analysis.targetAudience &&
      `- It speaks to: ${analysis.targetAudience}`,
    analysis.suggestedBuyerPersona &&
      `- Persona it suits: ${analysis.suggestedBuyerPersona}`,
  ]);

  const confidence =
    analysis.confidenceScore >= 60
      ? 'This reading is reliable. Build the copy on it.'
      : 'This reading is uncertain — the image is ambiguous. Use only the parts you are confident about, and lean more on the brand and the subject than on visual detail.';

  return [observation, reading, `## How much to trust it\n${confidence}`]
    .filter(Boolean)
    .join('\n\n');
}

function platformSection(request: CaptionRequest): string | null {
  if (request.platforms.length === 0) return null;

  return section(
    '## Platform rules',
    request.platforms.map(
      (platform) =>
        `- ${PLATFORM_BRIEF[platform.toLowerCase()] ?? `${platform}: ${DEFAULT_PLATFORM_BRIEF}`}`,
    ),
  );
}

function competitorSection(request: CaptionRequest): string | null {
  const c = request.competitor;
  if (!c) return null;
  return section('## Competitor context', [
    c.brandName && `- Competitor Brand Name: ${c.brandName}`,
    c.website && `- Competitor Website: ${c.website}`,
    c.socialHandle && `- Competitor Handle: ${c.socialHandle}`,
  ]);
}

/**
 * The one place a regenerate differs from a first run: the previous caption is
 * shown to the model as something to move *away* from. Without it, "regenerate"
 * reliably returns the same caption with two words swapped.
 */
function regenerateSection(request: CaptionRequest): string | null {
  if (!request.previousCaption?.trim()) return null;

  return section('## Previous attempt', [
    'The user was not satisfied with this caption:',
    `"""${request.previousCaption.trim().slice(0, 1200)}"""`,
    'Take genuinely different angles — a different entry point into the same image and subject. Do not paraphrase it.',
  ]);
}

export interface BuiltPrompt {
  systemInstruction: string;
  prompt: string;
  responseSchema: Record<string, unknown>;
  /** Higher on a regenerate so a second run is not a near-copy of the first. */
  temperature: number;
  version: number;
}

export interface BuildCaptionPromptOptions {
  /** Stage one's read of the image, when there was an image and it worked. */
  imageAnalysis?: ImageAnalysis | null;
  /**
   * What Brand Intelligence resolved for this request. Required in practice —
   * the generator always resolves one, even when the caller sent no brand at
   * all, because an empty profile is still a renderable thing (it renders to
   * nothing) and an optional here would put a null check in the prompt body.
   */
  brand: BrandProfile;
}

export function buildCaptionPrompt(
  request: CaptionRequest,
  { imageAnalysis, brand }: BuildCaptionPromptOptions,
): BuiltPrompt {
  const tones = VARIATION_TONES.slice(0, request.variationCount);
  const count = request.variationCount;
  const plural = count === 1 ? 'option' : 'options';

  const prompt = [
    section('## The post', [
      `- Subject: ${request.topic}`,
      request.title && request.title !== request.topic
        ? `- Working title: ${request.title}`
        : null,
      !imageAnalysis && request.imageUrl
        ? '- The post has an accompanying image, but it could not be analysed. Write copy that complements a visual rather than describing it, and never claim to know what the image shows.'
        : null,
      request.music?.trim()
        ? `- Audio already chosen by the user: "${request.music.trim()}". The copy should sit naturally with that track's mood and pacing. Do not suggest a different song and do not tell the user to change it.`
        : null,
    ]),

    imageAnalysis ? imageSection(imageAnalysis) : null,

    section('## Marketing brief', [
      `- Objective: ${GOAL_BRIEF[request.goal] ?? GOAL_BRIEF.brand_awareness}`,
      `- Audience temperature: ${FUNNEL_BRIEF[request.funnelStage] ?? FUNNEL_BRIEF.TOFU}`,
      `- Length: ${LENGTH_BRIEF[request.captionLength] ?? LENGTH_BRIEF.Medium}`,
      `- Language: write everything in ${request.language}.`,
    ]),

    `## How to write\n${AUDIENCE_BRIEF[request.audience] ?? AUDIENCE_BRIEF.gen_z_millennial}`,

    renderBrandSection(brand),
    competitorSection(request),
    platformSection(request),
    regenerateSection(request),

    section('## What to produce', [
      imageAnalysis
        ? `1. First, choose ${count} genuinely different creative ${count === 1 ? 'direction' : 'directions'}. Each must sit where the image and the brand overlap: take something specific from the image — a theme, an emotion, a symbol, a detail of the light or the setting — and connect it to what this brand is selling. Different directions must start from different things in the image, not from the same thing said twice. For each, name it, state the premise in a sentence, and say which part of the image it is built on.`
        : `1. First, choose ${count} genuinely different creative ${count === 1 ? 'direction' : 'directions'} into this subject. For each, name it, state the premise in a sentence, and say what in the brief it is built on.`,
      `2. Then write one caption per direction, in this order of tones: ${tones.join(', ')}. Each caption must be recognisably the copy for its own direction — swapping two of them should be obviously wrong.`,
      '3. For each option, repeat its opening line as the "hook", name its "angle", and add one sentence on why it works for this audience.',
      request.hashtagCount > 0
        ? `4. ${request.hashtagCount} hashtags, without the # sign. Draw them from ${
            imageAnalysis
              ? 'what is actually in the image and the themes it carries'
              : 'the subject and audience'
          }, not just the brand name. Mix broad reach with specific niche tags. No spaces or punctuation inside a tag.`
        : '4. An empty hashtags array — the user does not want hashtags.',
      request.platforms.length > 0
        ? `5. The first caption option rewritten for each of: ${request.platforms.join(', ')}, obeying the platform rules above. Keep the angle, change the shape.`
        : null,
      wantsSongSuggestions(request)
        ? `6. ${SONG_SUGGESTION_COUNT} audio ideas in "songSuggestions": real, well-known released tracks that fit ${
            imageAnalysis
              ? 'the mood, pace and setting of the image'
              : 'the subject and mood of the post'
          }. Give the real title and artist — never invent a song. For each, one sentence on why it fits this specific post. Do not claim anything is currently trending; you have no live chart data.`
        : null,
      request.features?.seo
        ? '7. Include an `seo` object with targeted keywords (with relevance & difficulty scores, intent), metaTitle (50-60 chars), metaDescription (120-155 chars), altText, slug, and readabilityScore.'
        : null,
      request.features?.campaign
        ? '8. Include a `campaign` plan object with campaign name, bigIdea, durationDays, beats array (day, channel, angle, contentIdea), kpis array, and budgetTier.'
        : null,
      request.features?.competitorAnalysis
        ? '9. Include a `competitor` analysis object detailing positioning, toneObserved, contentThemes, postingFrequency, strengths, weaknesses, gaps, and differentiationAdvice.'
        : null,
    ]),

    'Return a single JSON object matching the provided schema. Nothing else.',
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    systemInstruction: SYSTEM_INSTRUCTION,
    prompt,
    responseSchema: buildCaptionResponseSchema(request),
    temperature: request.previousCaption?.trim() ? 1.0 : 0.85,
    version: CAPTION_PROMPT_VERSION,
  };
}
