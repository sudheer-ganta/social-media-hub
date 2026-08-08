/**
 * Adding a line to a caption somebody else wrote.
 *
 * The sibling of `withHashtags`, and it obeys the same rule for the same
 * reason: the caption field is what gets published, so a suggestion is only
 * safe to apply if applying it cannot lose a word of what is already there.
 * This appends and nothing else — it never rewrites, reorders or removes.
 *
 * Deliberately dependency-free and pure so `verify-reach-apply.ts` can run it
 * under plain `node`.
 */

/** Whitespace- and case-insensitive, so a re-apply recognises its own work. */
const normalise = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();

/** A paragraph that is nothing but hashtags — the block `withHashtags` writes. */
const isTagBlock = (block: string) =>
  /^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(block.trim());

/**
 * Puts one line in front of a caption, once.
 *
 * An addition like every other in this file: a suggested opening line goes
 * *above* what is there, so the first line somebody wrote becomes the second
 * line rather than being replaced. Nothing here can overwrite a hook — it can
 * only offer a different one in front of it, which the member can delete.
 */
export function withLead(caption: string, line: string): string {
  const addition = line.trim();
  if (!addition) return caption;
  if (normalise(caption).includes(normalise(addition))) return caption;

  const body = caption.trim();
  return body ? `${addition}\n\n${body}` : addition;
}

/**
 * Appends one line to a caption, once.
 *
 * A caption that already carries the line comes back unchanged, so applying
 * the same suggestion twice is a no-op rather than a duplicate sentence. That
 * property is load-bearing beyond tidiness: it is how the panel *verifies* a
 * fix without remembering anything. "Would applying this change the caption?"
 * answers "is the fix in the caption?" exactly, against whatever is on screen
 * right now — so deleting the line afterwards un-verifies it on its own.
 *
 * The line lands *before* a trailing hashtag block rather than after it: tags
 * belong at the end, and a question stranded under them reads as an
 * afterthought — which is the opposite of what a conversation starter is for.
 */
export function withLine(caption: string, line: string): string {
  const addition = line.trim();
  if (!addition) return caption;
  if (normalise(caption).includes(normalise(addition))) return caption;

  const body = caption.trimEnd();
  if (!body) return addition;

  const blocks = body.split(/\n{2,}/);
  const last = blocks[blocks.length - 1] ?? "";

  return blocks.length > 1 && isTagBlock(last)
    ? [...blocks.slice(0, -1), addition, last].join("\n\n")
    : `${body}\n\n${addition}`;
}
