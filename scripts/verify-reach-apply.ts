/**
 * Applying a Reach & Visibility recommendation cannot lose the member's work —
 * acceptance check.
 *
 *   npm run verify:reach
 *
 * Runs under plain `node` (v22+ strips the types), same as verify-hashtags.
 * Covers the two things the Apply buttons do to a caption the member wrote:
 * append suggested tags, and append one conversation starter.
 */
import { withHashtags } from "../src/utils/hashtags.ts";
import { withLine } from "../src/utils/caption.ts";
import { applyAll, outstanding, statusFor } from "../src/ai/reach-fixes.ts";
import type { CaptionAnalysis, Improvement } from "../src/ai/analysis.ts";

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const WRITTEN = "She walked into the fire and came out a queen.\n\n#TVDrama #FantasySeries";
const QUESTION = "Who do you think deserves the throne? 👑";

console.log("\n1. Apply a suggested line");
const once = withLine(WRITTEN, QUESTION);
check("the member's caption survives verbatim", once.includes("She walked into the fire and came out a queen."), once);
check("their existing hashtags survive", once.includes("#TVDrama") && once.includes("#FantasySeries"));
check("the line is added", once.includes(QUESTION));
check(
  "it lands above the trailing tag block, not under it",
  once.indexOf(QUESTION) < once.indexOf("#TVDrama"),
  once,
);

console.log("\n2. Applying twice changes nothing");
check("withLine is idempotent", withLine(once, QUESTION) === once);
check(
  "and tolerates whitespace drift",
  withLine(once, `  ${QUESTION}  `) === once,
);

console.log("\n3. Edge cases");
check("an empty caption takes the line alone", withLine("", QUESTION) === QUESTION);
check("an empty suggestion is a no-op", withLine(WRITTEN, "   ") === WRITTEN);
check(
  "a caption with no tag block appends at the end",
  withLine("Just a thought.", QUESTION) === `Just a thought.\n\n${QUESTION}`,
);

console.log("\n4. Apply suggested hashtags");
const tagged = withHashtags(WRITTEN, ["GameOfThrones", "tvdrama", "Targaryen"], ["instagram"]);
check("new tags are added", tagged.includes("#GameOfThrones") && tagged.includes("#Targaryen"));
check("a tag already present is not repeated", tagged.match(/#tvdrama/gi)?.length === 1, tagged);
check("applying the same tags twice is a no-op", withHashtags(tagged, ["GameOfThrones", "Targaryen"], ["instagram"]) === tagged);
check(
  "platform limits still bind — LinkedIn takes three",
  (withHashtags("A post.", ["one", "two", "three", "four", "five"], ["linkedin"]).match(/#/g) ?? []).length === 3,
);

// Apply All fixes the order — line first, then tags — because `withHashtags`
// appends its block at the very end, so tags applied last are the ones that end
// up last. The reverse leaves the question stranded under a tag block.
console.log("\n5. Apply all — the line first, then the tags");
const all = withHashtags(withLine(WRITTEN, QUESTION), ["Targaryen"], ["instagram"]);
check("the question sits in the copy", all.indexOf(QUESTION) < all.indexOf("#TVDrama"), all);
check("the new tag is last", all.trimEnd().endsWith("#Targaryen"), all);
check("applying all twice is a no-op", withHashtags(withLine(all, QUESTION), ["Targaryen"], ["instagram"]) === all);

// ─────────────────────────────────────────────────────────────────────────────
// The closed loop.
//
// Everything below runs the *same* derivation the panel renders from
// (`statusFor`), against hand-built analyses, so the journey can be proved
// without a browser, a login or a model call. The last section is the one that
// matters most: it proves the panel reads the caption rather than remembering
// that somebody once pressed Apply.
// ─────────────────────────────────────────────────────────────────────────────

const HOOK_LINE = "She was born in exile. She died a conqueror.";

/** A minimal analysis — only the fields `statusFor` reads. */
function analysisWith(
  scores: Partial<Record<string, number>>,
  improvements: Array<Partial<Improvement> & { dimension: Improvement["dimension"] }>,
): CaptionAnalysis {
  return {
    reachScore: 67,
    scores: Object.fromEntries(
      Object.entries(scores).map(([dimension, score]) => [
        dimension,
        { score: score as number, confidence: "Medium", reason: `${dimension} reason` },
      ]),
    ),
    improvements: improvements.map((item) => ({
      issue: `${item.dimension} issue`,
      suggestion: `${item.dimension} suggestion`,
      estimatedGain: 8,
      ...item,
    })) as Improvement[],
  } as CaptionAnalysis;
}

/** The four rows of the journey, as the panel would show them. */
const statuses = (analysis: CaptionAnalysis, caption: string) =>
  (["hook", "readability", "cta", "hashtags"] as const)
    .map((dimension) => {
      const verdict = statusFor(analysis, dimension, caption, ["instagram"]);
      return `${verdict.ok ? "✓" : "⚠"} ${dimension}`;
    })
    .join(", ");

// Weak hook, weak caption, weak engagement, healthy tags.
const first = analysisWith(
  { hook: 4, readability: 5, cta: 3, hashtags: 8 },
  [
    { dimension: "hook", suggestedLine: HOOK_LINE },
    { dimension: "readability" },
    { dimension: "cta", suggestedLine: QUESTION },
  ],
);

console.log("\n6. The journey — analyse → fix → verify");
let post = WRITTEN;
check(
  "initial: ⚠ hook, ⚠ caption, ⚠ engagement, ✓ discoverability",
  statuses(first, post) === "⚠ hook, ⚠ readability, ⚠ cta, ✓ hashtags",
  statuses(first, post),
);

post = applyAll([first.improvements[0]!], post, ["instagram"]);
check(
  "after applying the hook fix: ✓ hook, the rest unchanged",
  statuses(first, post) === "✓ hook, ⚠ readability, ⚠ cta, ✓ hashtags",
  statuses(first, post),
);
check("the member's original opening survives below it", post.includes("She walked into the fire"));

post = applyAll([first.improvements[2]!], post, ["instagram"]);
check(
  "after applying the engagement fix: ✓ hook, ⚠ caption, ✓ engagement",
  statuses(first, post) === "✓ hook, ⚠ readability, ✓ cta, ✓ hashtags",
  statuses(first, post),
);

// The caption fix has no applyable form — the member rewrites it themselves and
// presses Check again, which is a new analysis of the new text.
const rechecked = analysisWith(
  { hook: 8, readability: 8, cta: 8, hashtags: 8 },
  [],
);
check(
  "after rewriting the caption and checking again: all four clear",
  statuses(rechecked, post) === "✓ hook, ✓ readability, ✓ cta, ✓ hashtags",
  statuses(rechecked, post),
);

console.log("\n7. Removing a fix un-verifies it — no memory of the click");
// Same analysis object as step 6, deliberately: nothing is re-run. The member
// deletes the hook line they applied, and the row has to go back to a warning
// on the strength of the caption alone.
const without = post.replace(`${HOOK_LINE}\n\n`, "");
check("the hook line is gone from the caption", !without.includes(HOOK_LINE));
check(
  "the hook row returns to ⚠ with no re-analysis",
  statuses(first, without) === "⚠ hook, ⚠ readability, ✓ cta, ✓ hashtags",
  statuses(first, without),
);
check(
  "and the engagement fix it still carries stays ✓",
  statusFor(first, "cta", without, ["instagram"]).ok,
);

console.log("\n8. Outstanding work is derived, never remembered");
check("nothing outstanding once both fixes are in", outstanding(first, post, ["instagram"]).length === 0);
check("the hook is outstanding again once removed", outstanding(first, without, ["instagram"]).length === 1);
check(
  "a strong score is never re-opened by a leftover recommendation",
  statusFor(
    analysisWith({ hook: 9 }, [{ dimension: "hook", suggestedLine: HOOK_LINE }]),
    "hook",
    WRITTEN,
    ["instagram"],
  ).ok,
);

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
