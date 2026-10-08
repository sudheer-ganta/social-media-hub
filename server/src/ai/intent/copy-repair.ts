/**
 * Deterministic repairs for the two ways copy can fail a creative before a
 * critic has seen it.
 *
 * Every function here is pure and dependency-free on purpose: it is imported
 * from the copy sanitizer, the intent extractor and the composer, and those
 * modules already import each other through `claim-match`. Keeping this one
 * free of repo imports means it cannot close a cycle.
 *
 * Nothing here knows what any campaign is about. It works on the words that are
 * present, never on an occasion, an industry or a category.
 */

export interface RepairableLine {
  role: string;
  text: string;
}

const FILLER = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'for', 'to', 'in', 'on', 'at', 'with', 'by', 'from',
  'your', 'our', 'is', 'are', 'this', 'that', 'its', 'it', 'be',
]);

/** Lowercased content words. `%` is kept, so "30% off" and "30 items" stay different. */
export function contentTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/(\d+)\s*%/g, '$1%')
    .replace(/[^\p{L}\p{N}%]+/gu, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 0 && !FILLER.has(token))
    // Plain plural folding, so "shoes" and "shoe" are the same word here.
    .map((token) => (token.length > 3 && token.endsWith('s') && !token.endsWith('ss') ? token.slice(0, -1) : token));
}

function overlap(superset: string[], subset: string[]): { shared: number; numbersCovered: boolean } {
  const have = new Set(superset);
  const shared = subset.filter((token) => have.has(token)).length;
  // A number, price or time the other line lacks is a fact, not a repeat.
  const numbersCovered = subset.filter((token) => /\d/.test(token)).every((token) => have.has(token));
  return { shared, numbersCovered };
}

/** How much of a line another line must already say before the line counts as a repeat. */
function coverageNeeded(tokenCount: number): number {
  // A long line can vary by a word ("Save 30% on running shoes" beside "30% off
  // all running shoes"); a short one must be said in full to count as repeated.
  return tokenCount >= 4 ? 0.75 : 1;
}

/**
 * Drops items that only repeat what another item already says. Of two items that
 * say the same, the earlier one survives, so the result never depends on sort
 * order and two lines can never remove each other.
 *
 * A model files "30% off" as the offer, "30% off all running shoes" as the
 * headline and "Save 30% on running shoes" as support, and the critic then
 * rejects the creative for saying one thing three times. The exact-duplicate
 * filter upstream cannot see that; this can.
 */
export function collapseSubsumed<T extends RepairableLine>(
  items: T[],
  /** Items that must survive even when another item repeats them. */
  protect: (item: T) => boolean = () => false,
): T[] {
  const tokens = items.map((item) => contentTokens(item.text));
  return items.filter((item, i) => {
    const mine = tokens[i]!;
    if (protect(item) || mine.length === 0) return true;
    return !items.some((_, j) => {
      if (j === i) return false;
      const other = tokens[j]!;
      const { shared, numbersCovered } = overlap(other, mine);
      if (!numbersCovered || shared / mine.length < coverageNeeded(mine.length)) return false;
      return other.length > mine.length || (other.length === mine.length && j < i);
    });
  });
}

/**
 * Required claims with the redundant ones removed: "rooftop cafe" adds nothing
 * once "new rooftop cafe" is required. Fewer, non-overlapping requirements are
 * easier to carry in a few text blocks, and nothing the member asked for is
 * lost, because any copy that carries the longer claim carries the shorter.
 */
export function dropSubsumedClaims(claims: string[]): string[] {
  const items = claims.map((text) => ({ role: 'CLAIM', text }));
  return collapseSubsumed(items).map((item) => item.text);
}

const ARTIFACT = /[{}[\]]|```/;

/**
 * Puts required claims that the authored copy never carried back into it.
 *
 * The event and offer go where a reader expects them (a badge, an offer device).
 * Anything else is folded into the existing detail line, or becomes one, rather
 * than being dropped: a member who wrote "Launch party" in their request must
 * see "Launch party" on the creative, and failing the whole render because the
 * writing model never used the words helps nobody.
 */
export function restoreMissingClaims<T extends RepairableLine>(
  lines: T[],
  missing: string[],
  intent: { event?: string; offer?: string } | undefined,
  make: (role: string, text: string) => T,
): T[] {
  const usable = missing.map((claim) => claim.trim()).filter((claim) => claim && !ARTIFACT.test(claim));
  if (usable.length === 0) return lines;

  let out = [...lines];
  const rest: string[] = [];
  const same = (a?: string, b?: string) => Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());

  for (const claim of usable) {
    if (same(claim, intent?.event) && !out.some((line) => line.role === 'EVENT_BADGE')) {
      out = [...out, make('EVENT_BADGE', claim)];
    } else if (same(claim, intent?.offer) && !out.some((line) => line.role === 'OFFER')) {
      out = [...out, make('OFFER', claim)];
    } else {
      rest.push(claim);
    }
  }

  if (rest.length > 0) {
    const joined = rest.join(', ');
    const index = out.findIndex((line) => line.role === 'DETAIL');
    out = index >= 0
      ? out.map((line, i) => (i === index ? ({ ...line, text: `${line.text}, ${joined}` } as T) : line))
      : [...out, make('DETAIL', joined)];
  }
  return out;
}
