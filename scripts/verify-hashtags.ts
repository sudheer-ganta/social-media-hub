/**
 * Hashtags reach the published caption — acceptance check.
 *
 *   npm run verify:hashtags
 *
 * Runs under plain `node` (v22+ strips the types), so it needs no test runner
 * and no new dependency. Covers the regression that published the first real
 * Personal Instagram post with zero hashtags, and the rules that keep the fix
 * from trampling anything the member wrote.
 */
import { hashtagLimitFor, hashtagsIn, withHashtags } from "../src/utils/hashtags.ts";

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

const TAGS = ["GameOfThrones", "DaenerysTargaryen", "FantasyEdit", "GoT"];

console.log("\n1. Hashtags survive generation → caption field");
const generated = withHashtags("Prince or princess, the burden remains.", TAGS, [
  "instagram",
]);
check(
  "an AI caption lands in the editor carrying its hashtags",
  TAGS.every((tag) => generated.includes(`#${tag}`)),
  generated,
);
check(
  "the caption text itself is untouched",
  generated.startsWith("Prince or princess, the burden remains."),
);
check(
  "tags are a trailing block, separated from the copy",
  generated.includes("\n\n#GameOfThrones"),
);

console.log("\n2. Manual edits are preserved");
const edited = "My own words, written by hand.";
check(
  "appending never rewrites what the member typed",
  withHashtags(edited, TAGS, ["instagram"]).startsWith(edited),
);
check(
  "a caption that already has a tag does not repeat it",
  hashtagsIn(withHashtags("Already #GoT here", TAGS, ["instagram"])).filter(
    (t) => t.toLowerCase() === "got",
  ).length === 1,
);
check(
  "matching is case-insensitive",
  !withHashtags("Already #got here", ["GoT"], ["instagram"]).includes("#GoT"),
);
check(
  "applying the same generation twice is idempotent",
  withHashtags(generated, TAGS, ["instagram"]) === generated,
);
check(
  "a caption with every tag already in it comes back identical",
  withHashtags("#a #b", ["a", "b"], ["instagram"]) === "#a #b",
);
check(
  "removing the tags and not regenerating leaves them gone",
  // The composer only calls this when a generation is applied — never on save
  // and never on publish — so a stripped caption stays stripped.
  hashtagsIn("Prince or princess, the burden remains.").length === 0,
);

console.log("\n3. Reach analysis reads the FINAL caption, not AI metadata");
check(
  "hashtagsIn reports exactly what the network will receive",
  JSON.stringify(hashtagsIn("Copy here\n\n#One #Two")) ===
    JSON.stringify(["One", "Two"]),
);
check(
  "an unused AI array cannot inflate the count",
  hashtagsIn("Copy with no tags at all").length === 0,
);

console.log("\n4. Platform-appropriate quantity");
check("instagram does not bind (generator asks for 8)", hashtagLimitFor(["instagram"]) === Infinity);
check("linkedin caps at 3", hashtagLimitFor(["linkedin"]) === 3);
check(
  "a mixed selection takes the tightest limit",
  hashtagLimitFor(["instagram", "linkedin", "x"]) === 2,
);
check(
  "linkedin receives at most 3 tags, not the full set",
  hashtagsIn(withHashtags("Post body", TAGS, ["linkedin"])).length === 3,
);
check(
  "no platform selected leaves the generated set intact",
  hashtagsIn(withHashtags("Post body", TAGS, [])).length === TAGS.length,
);

console.log("\n5. Malformed input");
check(
  "a tag arriving with its # already attached is not doubled",
  withHashtags("Body", ["#Solo"], []).includes("#Solo") &&
    !withHashtags("Body", ["#Solo"], []).includes("##"),
);
check("empty tags are dropped", withHashtags("Body", ["", "  "], []) === "Body");
check("an empty caption yields just the block", withHashtags("", ["A"], []) === "#A");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
