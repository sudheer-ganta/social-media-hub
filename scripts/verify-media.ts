/**
 * The multi-image composer — acceptance check.
 *
 *   npm run verify:media
 *
 * Runs under plain `node` (v22+ strips the types), so it needs no test runner
 * and no new dependency, exactly like `verify-crop.ts`.
 *
 * The properties proved here are the ones the composer promises and the
 * publish path depends on:
 *
 *   • reordering moves the *item*, so ids, urls and crops follow their picture;
 *   • a format applies to each image against its own dimensions;
 *   • Mix imposes nothing — every image keeps the ratio it was uploaded at;
 *   • what a network will take is computed, never assumed, and an over-limit
 *     post is reported as over-limit rather than silently trimmed.
 */
import {
  activeFormat,
  applyFormat,
  itemAspect,
  mediaFit,
  mediaFromImageUrl,
  renderedAspect,
  reorderMedia,
} from "../src/utils/media.ts";
import { isFullFrame, withCrop } from "../src/utils/crop.ts";
import type { PostMediaItem } from "../src/types/post.ts";

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

/** Roughly equal — crops are rounded to 4dp on the way in. */
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

const item = (
  id: string,
  width: number,
  height: number,
): PostMediaItem => ({
  id,
  url: `https://res.cloudinary.com/demo/image/upload/v1/${id}.jpg`,
  type: "image",
  width,
  height,
  crop: null,
});

/** A portrait, a square and a landscape — the case Mix exists for. */
const PORTRAIT = item("portrait", 800, 1000);
const SQUARE = item("square", 1200, 1200);
const LANDSCAPE = item("landscape", 1920, 1080);
const MIXED = [PORTRAIT, SQUARE, LANDSCAPE];

console.log("1. Reordering moves items, not their contents");
{
  const moved = reorderMedia(MIXED, 0, 2);
  check(
    "the moved item lands at its new index",
    moved[2].id === "portrait" && moved[0].id === "square",
  );
  check(
    "every item survives the move",
    moved.length === 3 && new Set(moved.map((i) => i.id)).size === 3,
  );
  check("the original array is untouched", MIXED[0].id === "portrait");

  const cropped = applyFormat(MIXED, "1:1");
  const afterMove = reorderMedia(cropped, 2, 0);
  check(
    "a crop follows its own picture through a reorder",
    afterMove[0].id === "landscape" &&
      afterMove[0].crop === cropped[2].crop &&
      afterMove[0].url === LANDSCAPE.url,
  );

  check("an out-of-range drag is a no-op", reorderMedia(MIXED, 0, 9) === MIXED);
  check("dropping an item on itself is a no-op", reorderMedia(MIXED, 1, 1) === MIXED);
}

console.log("\n2. A format applies per image, against its own dimensions");
{
  const square = applyFormat(MIXED, "1:1");
  check(
    "every image reports the chosen format",
    activeFormat(square) === "1:1",
  );
  check(
    "each renders square, whatever it started as",
    square.every((entry) => near(renderedAspect(entry), 1)),
    square.map((e) => renderedAspect(e).toFixed(3)).join(", "),
  );
  check(
    "the already-square image keeps the choice but loses no pixels",
    square[1].crop?.ratio === "1:1" && isFullFrame(square[1].crop),
  );
  check(
    "…and so publishes with no transformation at all",
    withCrop(SQUARE.url, square[1].crop) === SQUARE.url,
  );

  const portrait = applyFormat(MIXED, "4:5");
  check(
    "4:5 renders 4:5 for all three",
    portrait.every((entry) => near(renderedAspect(entry), 0.8)),
  );

  const landscape = applyFormat(MIXED, "1.91:1");
  check(
    "1.91:1 renders 1.91:1 for all three",
    landscape.every((entry) => near(renderedAspect(entry), 1.91)),
  );
}

console.log("\n3. Mix preserves each image's original ratio");
{
  const mixed = applyFormat(applyFormat(MIXED, "1:1"), "original");
  check("Mix is the reported format", activeFormat(mixed) === "original");
  check(
    "no crop is stored — nothing is transformed at publish time",
    mixed.every((entry) => entry.crop === null),
  );
  check(
    "the portrait stays portrait",
    near(renderedAspect(mixed[0]), itemAspect(PORTRAIT)) &&
      renderedAspect(mixed[0]) < 1,
  );
  check("the square stays square", near(renderedAspect(mixed[1]), 1));
  check(
    "the landscape stays landscape",
    near(renderedAspect(mixed[2]), itemAspect(LANDSCAPE)) &&
      renderedAspect(mixed[2]) > 1,
  );
  check(
    "Mix does not make them all the same shape",
    new Set(mixed.map((entry) => renderedAspect(entry).toFixed(2))).size === 3,
  );
}

console.log("\n4. Per-image framing is a real state, not an error");
{
  const oneCropped = [
    { ...PORTRAIT, crop: applyFormat([PORTRAIT], "1:1")[0].crop },
    SQUARE,
    LANDSCAPE,
  ];
  check(
    "no single format is claimed when they disagree",
    activeFormat(oneCropped) === null,
  );
  check("an empty list has no format", activeFormat([]) === null);
}

console.log("\n5. What a network takes is computed, never assumed");
{
  const carousel = mediaFit(4, { maxItems: 10, requiresMedia: true });
  check("a 4-image post fits a 10-image carousel", carousel.delivered === 4);
  check("and reports no overflow", carousel.overflow === 0);

  const overflowing = mediaFit(6, { maxItems: 4, requiresMedia: false });
  check("a 6-image post over a 4 ceiling reports 2 over", overflowing.overflow === 2);
  check(
    "and does not pretend the extras will publish",
    overflowing.delivered === 4,
  );

  const refuses = mediaFit(2, { maxItems: 0, requiresMedia: false });
  check("a network taking no media says so", refuses.refusesMedia);

  const needsOne = mediaFit(0, { maxItems: 10, requiresMedia: true });
  check("a network needing an image says so", needsOne.missingMedia);
  check(
    "a text post to a network that allows one is fine",
    !mediaFit(0, { maxItems: 10, requiresMedia: false }).missingMedia,
  );
}

console.log("\n6. A post from before the media column still opens");
{
  const rebuilt = mediaFromImageUrl(
    "https://res.cloudinary.com/demo/image/upload/v1/old.jpg",
  );
  check("its one image becomes one item", rebuilt.length === 1);
  check("unframed — its crops are still per network", rebuilt[0].crop === null);
  check("an empty image_url yields no media", mediaFromImageUrl("  ").length === 0);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
