import sharp from 'sharp';

/**
 * Raster-level QA for the Gemini visual — the half of render validation the
 * LayoutPlan can't see. The plan validator proves FlowPost's own layer is
 * clean (bounds, overlaps, placeholders); this scans the generated pixels for
 * the one artifact that has actually shipped in dogfood: a fake transparency
 * checkerboard rendered as real pixels.
 */

const SCAN_WIDTH = 256;
/** Quantization step for grey levels — two tiles must differ by at least one step. */
const LEVEL_STEP = 12;
/** Checkerboard tiles are light grey/white: both levels must be at least this bright (0-255). */
const MIN_LEVEL = 130;
/** ...and differ by a visible-but-small amount, like alpha-grid greys do. */
const MIN_DIFF = 8;
const MAX_DIFF = 80;
const MIN_RUNS_PER_ROW = 8;
const MIN_RUN = 2;
const MAX_RUN = 40;

/**
 * Does one scan row look like alternating equal-width tiles of exactly two
 * light-grey levels? Real photos of grids (tiles, plaid) vary run width and
 * level along the row; an alpha checkerboard doesn't.
 */
function rowLooksCheckered(row: Uint8Array): boolean {
  // Run-length encode the quantized row.
  const runs: Array<{ level: number; length: number }> = [];
  for (const value of row) {
    const level = Math.round(value / LEVEL_STEP);
    const last = runs[runs.length - 1];
    if (last && last.level === level) last.length += 1;
    else runs.push({ level, length: 1 });
  }

  // Longest streak of alternating A/B runs with tile-like widths.
  let best = 0;
  for (let start = 0; start < runs.length; start++) {
    const a = runs[start].level;
    let b: number | null = null;
    let count = 0;
    let minLen = Infinity;
    let maxLen = 0;
    for (let i = start; i < runs.length; i++) {
      const run = runs[i];
      const expected = (i - start) % 2 === 0 ? a : b;
      if (expected === null) b = run.level;
      else if (run.level !== expected) break;
      // Interior runs must be tile-width; the streak's edge runs may be clipped.
      const interior = i > start && i < runs.length - 1;
      if (interior && (run.length < MIN_RUN || run.length > MAX_RUN)) break;
      if (interior) {
        minLen = Math.min(minLen, run.length);
        maxLen = Math.max(maxLen, run.length);
        if (maxLen / Math.max(1, minLen) > 2.2) break;
      }
      count += 1;
    }
    best = Math.max(best, count);
    if (b !== null) {
      const levelA = a * LEVEL_STEP;
      const levelB = b * LEVEL_STEP;
      const diff = Math.abs(levelA - levelB);
      if (
        best >= MIN_RUNS_PER_ROW &&
        Math.min(levelA, levelB) >= MIN_LEVEL &&
        diff >= MIN_DIFF &&
        diff <= MAX_DIFF
      ) {
        return true;
      }
    }
  }
  return false;
}

export interface CheckerboardScan {
  detected: boolean;
  /** Fraction of scanned rows that look like alpha-grid tiling. */
  coverage: number;
}

/**
 * Conservative detector: flags only when a meaningful band of the image
 * (>10% of rows) shows the two-tone equal-width tiling of a transparency
 * grid. A momo tray or a tiled floor photographed in perspective varies both
 * tile width and level enough to stay under the bar.
 */
export async function detectCheckerboard(image: Buffer): Promise<CheckerboardScan> {
  const { data, info } = await sharp(image)
    .resize(SCAN_WIDTH, undefined, { fit: 'inside' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let checkered = 0;
  for (let y = 0; y < info.height; y++) {
    const row = new Uint8Array(data.buffer, data.byteOffset + y * info.width, info.width);
    if (rowLooksCheckered(row)) checkered += 1;
  }
  const coverage = checkered / Math.max(1, info.height);
  return { detected: coverage > 0.1, coverage: Math.round(coverage * 1000) / 1000 };
}
