/**
 * Hashtags, and getting them into the caption that actually ships.
 *
 * ─── Why this exists ─────────────────────────────────────────────────────────
 * A generation returns its hashtags in `result.hashtags`, beside the caption
 * rather than inside it. The publisher sends `post.caption` and nothing else —
 * so for as long as the two were separate, a caption the member accepted
 * without pressing "Add to caption" published with zero hashtags. That is
 * exactly what happened to the first real Personal Instagram post.
 *
 * The caption field is the single source of truth for what gets published, so
 * the tags have to live in it. Everything here is in service of putting them
 * there once, without ever overwriting what somebody typed.
 *
 * Deliberately dependency-free and pure so `verify-hashtags.ts` can run it
 * under plain `node`.
 */

/**
 * How many tags each network can carry before it reads as stuffing.
 *
 * Instagram's own ceiling is 30 and the generator asks for 8, so Instagram is
 * absent on purpose — it never binds, and an entry here would only be a number
 * to keep in sync with the backend. The others are real limits of taste rather
 * than of the API: three hashtags on LinkedIn is convention, thirty is spam.
 */
const PLATFORM_HASHTAG_LIMIT: Record<string, number> = {
  linkedin: 3,
  x: 2,
  threads: 1,
  facebook: 2,
};

/** The tightest limit across the selected networks. Unlimited when none bind. */
export function hashtagLimitFor(platforms: readonly string[]): number {
  const limits = platforms
    .map((platform) => PLATFORM_HASHTAG_LIMIT[platform])
    .filter((limit): limit is number => limit !== undefined);
  return limits.length > 0 ? Math.min(...limits) : Number.POSITIVE_INFINITY;
}

/**
 * The hashtags already written in a caption, without their `#`.
 *
 * The one reader of hashtag state anywhere in the composer: what the analyser
 * scores and what the deduplication below checks are the same text the network
 * will receive, because there is nowhere else for them to disagree.
 */
export function hashtagsIn(caption: string): string[] {
  return [...caption.matchAll(/#([\p{L}\p{N}_]+)/gu)].map((match) => match[1]);
}

/**
 * Appends hashtags to a caption, skipping any it already carries.
 *
 * Never rewrites, reorders or removes a single character of `caption` — it can
 * only add a trailing block, which is what makes it safe to run over text a
 * member has edited. A caption that already contains every suggested tag comes
 * back unchanged, so this is idempotent: applying the same generation twice
 * cannot double the tags.
 *
 * Respecting deletion falls out of the same rule. If someone removes the tags
 * and edits nothing else, nothing re-adds them: this runs when a generation is
 * applied, never on save and never on publish.
 */
export function withHashtags(
  caption: string,
  hashtags: readonly string[],
  platforms: readonly string[] = [],
): string {
  const present = new Set(hashtagsIn(caption).map((tag) => tag.toLowerCase()));

  const additions = hashtags
    .map((tag) => tag.replace(/^#+/, "").trim())
    .filter((tag) => tag.length > 0)
    .filter((tag) => {
      const key = tag.toLowerCase();
      if (present.has(key)) return false;
      // Guards against a duplicate inside `hashtags` itself, not just against
      // one already in the caption.
      present.add(key);
      return true;
    })
    .slice(0, hashtagLimitFor(platforms));

  if (additions.length === 0) return caption;

  const block = additions.map((tag) => `#${tag}`).join(" ");
  const body = caption.trimEnd();
  return body ? `${body}\n\n${block}` : block;
}
