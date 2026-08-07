import { linkedinConfig } from './config';

/**
 * Turning our text into LinkedIn's text.
 *
 * Pure functions only — no HTTP, no database, no Express. `publisher.ts` calls
 * these to build a request body and to describe the result; nothing else in the
 * codebase needs them, and nothing here needs anything else.
 *
 * The interesting problem is `commentary`. LinkedIn's Posts API does not accept
 * plain text: it accepts **little text format**, a markup in which a set of
 * characters are structural. A caption written by our AI is full of them —
 * parentheses, em-dash bullets, asterisks, hashtags, the occasional `@` — and
 * an unescaped one is not a cosmetic problem. It either mangles the rendered
 * post or gets the whole request rejected. See {@link escapeLittleText}.
 */

/**
 * The characters little text format reserves.
 *
 * From LinkedIn's grammar: every one of these must be backslash-escaped to be
 * treated as literal text, *even when it is not being used as markup*. That
 * last part is the trap — a caption containing "(and 3 more)" is not trying to
 * open a mention, but the parser does not know that.
 *
 * `\` is first on purpose: it has to be escaped before anything else, or the
 * backslashes this function adds would themselves get escaped on a later pass.
 */
const RESERVED_CHARACTERS = [
  '\\',
  '|',
  '{',
  '}',
  '@',
  '[',
  ']',
  '(',
  ')',
  '<',
  '>',
  '#',
  '*',
  '_',
  '~',
] as const;

/**
 * A hashtag as a member writes one: `#` followed by a run of word characters.
 *
 * Matched *before* escaping so these survive it. `#` is reserved, so escaping
 * blindly would turn every `#launch` into the literal text "#launch" — the post
 * would publish, look almost right, and silently lose every hashtag the AI
 * generated. That is precisely the class of bug that reaches production, so
 * hashtags are carved out and passed through as the hashtag elements they are.
 *
 * Unicode-aware: `\p{L}\p{N}` keeps non-English hashtags working, which matters
 * because caption generation takes a `language` setting.
 */
const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu;

/**
 * Escapes every reserved character in a run of plain text.
 *
 * Deliberately not exported: callers want {@link toCommentary}, which knows
 * about hashtags. This handles only the segments between them.
 */
function escapeSegment(text: string): string {
  let escaped = text;
  for (const character of RESERVED_CHARACTERS) {
    escaped = escaped.split(character).join(`\\${character}`);
  }
  return escaped;
}

/**
 * Escapes text for little text format, preserving hashtags as hashtags.
 *
 * Exported for the verification script, which asserts on the two behaviours
 * that are easy to regress: that structural characters come back escaped, and
 * that `#tag` does not.
 */
export function escapeLittleText(text: string): string {
  let result = '';
  let cursor = 0;

  // Reset: the pattern is module-level and `g`-flagged, so it carries
  // lastIndex between calls if we don't.
  HASHTAG_PATTERN.lastIndex = 0;

  for (const match of text.matchAll(HASHTAG_PATTERN)) {
    const start = match.index ?? 0;
    // Everything since the previous hashtag is ordinary text.
    result += escapeSegment(text.slice(cursor, start));
    // The hashtag itself passes through untouched — `#` unescaped is what
    // makes LinkedIn render it as a real, clickable hashtag.
    result += match[0];
    cursor = start + match[0].length;
  }

  return result + escapeSegment(text.slice(cursor));
}

/**
 * The final commentary string for a post body.
 *
 * Normalises Windows line endings on the way through: LinkedIn renders a
 * literal `\r` as a stray character rather than ignoring it, and a caption
 * pasted from Word or Outlook is full of them.
 */
export function toCommentary(caption: string): string {
  return escapeLittleText(caption.replace(/\r\n/g, '\n').replace(/\r/g, '\n'));
}

/**
 * The author URN for a member post.
 *
 * `providerAccountId` is the OpenID Connect `sub` claim we stored at connect
 * time — see `profile.ts`. For LinkedIn that value *is* the person id, so the
 * URN is a string concatenation and not a second API call.
 */
export function toPersonUrn(providerAccountId: string): string {
  return `urn:li:person:${providerAccountId}`;
}

/**
 * The body for a text-only member post on the versioned Posts API.
 *
 * `distribution` is required even though every field in it is a default —
 * LinkedIn answers a missing `distribution` with MISSING_FIELD rather than
 * assuming main-feed.
 */
export function buildTextPostBody(input: {
  authorUrn: string;
  caption: string;
}): Record<string, unknown> {
  return {
    author: input.authorUrn,
    commentary: toCommentary(input.caption),
    visibility: 'PUBLIC',
    distribution: {
      feedDistribution: 'MAIN_FEED',
      targetEntities: [],
      thirdPartyDistributionChannels: [],
    },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };
}

/**
 * The same post in the legacy `/v2/ugcPosts` shape.
 *
 * Only reached by the publisher's fallback path. Note it takes the caption
 * **raw**: the UGC API's `shareCommentary.text` is a plain string, not little
 * text, so escaping it here would publish visible backslashes.
 */
export function buildLegacyTextPostBody(input: {
  authorUrn: string;
  caption: string;
}): Record<string, unknown> {
  return {
    author: input.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: input.caption },
        shareMediaCategory: 'NONE',
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };
}

/**
 * The body for a post with media attached, on the versioned Posts API.
 *
 * `content.media` takes a single asset: `{ id, altText }`. A second image is
 * not "another entry in this object" — it is LinkedIn's separate MultiImage
 * content shape — which is why the validator caps media at one and this
 * function asserts rather than silently publishing the first of several.
 *
 * `altText` is omitted entirely when absent. Sending an empty string is not the
 * same thing to a screen reader: it marks the image as decorative, which a
 * photo a member chose to post is not.
 */
export function buildMediaPostBody(input: {
  authorUrn: string;
  caption: string;
  media: Array<{ urn: string; altText: string | null }>;
}): Record<string, unknown> {
  const [asset] = input.media;
  if (!asset) throw new Error('buildMediaPostBody called with no media');
  if (input.media.length > 1) {
    throw new Error(
      'buildMediaPostBody takes one asset; multiple images need content.multiImage',
    );
  }

  return {
    ...buildTextPostBody({ authorUrn: input.authorUrn, caption: input.caption }),
    content: {
      media: {
        id: asset.urn,
        ...(asset.altText ? { altText: asset.altText } : {}),
      },
    },
  };
}

/**
 * The same post in the legacy `/v2/ugcPosts` shape.
 *
 * Two differences from the versioned body beyond the obvious nesting. The
 * caption goes in **raw** — `shareCommentary.text` is a plain string, not
 * little text format, so escaping it here would publish visible backslashes.
 * And alt text has no field of its own: UGC has `description`, which LinkedIn
 * renders as a visible caption under the image rather than as accessibility
 * text. Passing generated alt text into it would put machine-written prose on
 * the member's post, so it is deliberately dropped on this path.
 */
export function buildLegacyMediaPostBody(input: {
  authorUrn: string;
  caption: string;
  media: Array<{ urn: string; altText: string | null }>;
}): Record<string, unknown> {
  if (input.media.length === 0) {
    throw new Error('buildLegacyMediaPostBody called with no media');
  }

  return {
    author: input.authorUrn,
    lifecycleState: 'PUBLISHED',
    specificContent: {
      'com.linkedin.ugc.ShareContent': {
        shareCommentary: { text: input.caption },
        shareMediaCategory: 'IMAGE',
        media: input.media.map((asset) => ({
          status: 'READY',
          media: asset.urn,
        })),
      },
    },
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };
}

/**
 * A permalink for a published share, or null when the URN is not one we can
 * build a URL from.
 *
 * LinkedIn returns only a URN on create — there is no URL in the response — so
 * "View on LinkedIn" is constructed rather than stored from an API field.
 * Returning null rather than a guessed URL keeps the UI honest: it hides the
 * link instead of offering one that 404s.
 */
export function toPostUrl(urn: string): string | null {
  if (!/^urn:li:(share|ugcPost):[\w-]+$/.test(urn)) return null;
  return `${linkedinConfig.feedUpdateUrl}${urn}/`;
}

export const linkedinFormatter = {
  escapeLittleText,
  toCommentary,
  toPersonUrn,
  buildTextPostBody,
  buildLegacyTextPostBody,
  buildMediaPostBody,
  buildLegacyMediaPostBody,
  toPostUrl,
};
