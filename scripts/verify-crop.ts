/**
 * Per-platform crop — acceptance check.
 *
 *   npm run verify:crop
 *
 * Runs under plain `node` (v22+ strips the types), so it needs no test runner
 * and no new dependency. The properties proved here are the ones the composer
 * promises: independent framing per network, one original, and no upscaling.
 */
import {
  applyCropToAll,
  computeCrop,
  focusOf,
  isFullFrame,
  isSoft,
  reconcileCrops,
  recommendedRatio,
  withCrop,
  type PlatformMedia,
} from "../src/utils/crop.ts";

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

const URL_ORIGINAL =
  "https://res.cloudinary.com/demo/image/upload/v1712345678/posts/shot.jpg";
/** A 3:2 landscape source, the common camera shape. */
const LANDSCAPE = 3 / 2;
/** A 4:5 portrait source. */
const PORTRAIT = 4 / 5;

console.log("\n1. One platform + one crop");
const ig = computeCrop("4:5", LANDSCAPE);
check("recommended ratio for instagram is 4:5", recommendedRatio("instagram") === "4:5");
check("crop is a 4:5 window on a 3:2 source", Math.abs((ig.w * LANDSCAPE) / ig.h - 0.8) < 0.001,
  `${ig.w}x${ig.h}`);
check("full height is used on a wider-than-target source", ig.h === 1);
check("the window sits inside the image", ig.x >= 0 && ig.x + ig.w <= 1.0001);
check("it is centred by default", Math.abs(focusOf(ig).x - 0.5) < 0.001);

console.log("\n2. Multiple platforms + independent crops");
let media: PlatformMedia = reconcileCrops({}, ["instagram", "linkedin", "facebook"], LANDSCAPE);
check("every selected platform gets its own entry", Object.keys(media).length === 3);
check("instagram defaults to 4:5", media.instagram.ratio === "4:5");
check("linkedin defaults to 1.91:1", media.linkedin.ratio === "1.91:1");
check("facebook defaults to 1.91:1", media.facebook.ratio === "1.91:1");

media = { ...media, instagram: computeCrop("1:1", LANDSCAPE, { focusX: 0.2 }) };
check("changing one platform leaves the others untouched", media.linkedin.ratio === "1.91:1");
check("the changed platform kept its new ratio", media.instagram.ratio === "1:1");

const reconciled = reconcileCrops(media, ["instagram", "linkedin", "facebook"], LANDSCAPE);
check(
  "reconciling preserves an adjusted crop rather than rebuilding it",
  reconciled.instagram.ratio === "1:1" && reconciled.instagram.x === media.instagram.x,
);
const dropped = reconcileCrops(media, ["instagram"], LANDSCAPE);
check("deselecting a platform drops its crop", Object.keys(dropped).length === 1);

console.log("\n3. Apply this crop to all");
const source = computeCrop("1:1", LANDSCAPE, { zoom: 1.5, focusX: 0.3, focusY: 0.4 });
const spread = applyCropToAll(source, ["instagram", "linkedin", "x"], LANDSCAPE, "instagram");
check("the source platform is unchanged", spread.instagram === source);
check(
  "the focal point travels to the others",
  Math.abs(focusOf(spread.linkedin).x - focusOf(source).x) < 0.06,
  `${focusOf(spread.linkedin).x} vs ${focusOf(source).x}`,
);
check("the zoom travels too", spread.x.zoom === source.zoom);
check(
  "a destination that cannot do the source ratio falls back to its own",
  // linkedin offers 1:1, so it keeps it; x does not offer 4:5.
  spread.linkedin.ratio === "1:1" &&
    applyCropToAll(computeCrop("4:5", LANDSCAPE), ["x"], LANDSCAPE, "instagram").x.ratio === "16:9",
);

console.log("\n4. The original asset is never modified");
check("no crop leaves the URL exactly as stored", withCrop(URL_ORIGINAL, null) === URL_ORIGINAL);
check(
  "a full-frame crop emits no transformation at all",
  withCrop(URL_ORIGINAL, computeCrop("1:1", 1)) === URL_ORIGINAL,
);
check(
  "a real crop derives a new URL and leaves the stored path beneath it",
  withCrop(URL_ORIGINAL, ig) ===
    `https://res.cloudinary.com/demo/image/upload/c_crop,w_${ig.w},h_${ig.h},x_${ig.x},y_${ig.y}/v1712345678/posts/shot.jpg`,
  withCrop(URL_ORIGINAL, ig),
);
check(
  "the original public id is still addressable underneath",
  withCrop(URL_ORIGINAL, ig).endsWith("/v1712345678/posts/shot.jpg"),
);
check("a non-Cloudinary host is passed through untouched",
  withCrop("https://example.com/a.jpg", ig) === "https://example.com/a.jpg");

console.log("\n5. No upscaling, ever");
const zoomed = computeCrop("1:1", LANDSCAPE, { zoom: 3 });
check("a crop never asks for more than the whole image", zoomed.w <= 1 && zoomed.h <= 1);
check("zoom is clamped rather than unbounded", computeCrop("1:1", LANDSCAPE, { zoom: 99 }).zoom === 3);
check(
  "every ratio on a portrait source still fits inside it",
  (["4:5", "1:1", "16:9", "9:16", "1.91:1"] as const).every((r) => {
    const c = computeCrop(r, PORTRAIT);
    return c.w <= 1.0001 && c.h <= 1.0001 && c.x >= 0 && c.y >= 0;
  }),
);
check(
  "a focus at the very edge still yields a valid window",
  (() => {
    const c = computeCrop("1:1", LANDSCAPE, { focusX: 0, focusY: 1 });
    return c.x >= 0 && c.y >= 0 && c.x + c.w <= 1.0001 && c.y + c.h <= 1.0001;
  })(),
);

console.log("\n6. Soft-image warning is honest, not silently fixed");
check(
  "a 429px source is flagged as soft",
  isSoft(computeCrop("4:5", 429 / 433), 429, 433),
);
check(
  "a 2000px source cropped lightly is not flagged",
  !isSoft(computeCrop("1:1", 1), 2000, 2000),
);
check(
  "zooming into a small source flags it",
  isSoft(computeCrop("1:1", 1, { zoom: 2 }), 1600, 1600),
);
check("unknown dimensions never raise a false warning", !isSoft(computeCrop("1:1", 1), 0, 0));

console.log("\n7. Full-frame detection");
check("a 1:1 crop of a square source is full frame", isFullFrame(computeCrop("1:1", 1)));
check("a 1:1 crop of a landscape source is not", !isFullFrame(computeCrop("1:1", LANDSCAPE)));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
