import sharp from 'sharp';

/**
 * Reads the generated visual BEFORE any type is placed on it, and answers the
 * three questions a designer asks while holding a photograph:
 *
 *   - where is the subject — the mass a viewer would actually name?
 *   - where is it quiet enough to set type?
 *   - how light, how dark, how uneven is it under a given box?
 *
 * Deterministic and model-free: one downscale to a coarse grid, then summed-area
 * tables so scoring any candidate rectangle is O(1) regardless of how many are
 * tried. This is the "saliency-aware text region proposal" stage of the layout
 * literature done with arithmetic instead of a network — about a millisecond per
 * creative, identical every time, and no API call.
 *
 * It replaces guesswork the renderer previously had no way to avoid: the only
 * thing any stage could measure was the mean brightness of one fixed band, which
 * cannot tell "an even dark field" (set light type straight onto it) apart from
 * "a bright face against a dark wall" (do not put type here at all).
 */

export interface FieldRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ToneReading {
  /** 0..1 mean relative luminance under the rect. */
  meanLuminance: number;
  /** 0..1 standard deviation of luminance — how uneven the backdrop is. */
  stdDev: number;
  /**
   * 'light'/'dark' mean the backdrop is even enough that one flat ink colour
   * works. 'mixed' means no flat colour can stay legible across the whole box —
   * the only condition under which a scrim is justified.
   */
  verdict: 'light' | 'dark' | 'mixed';
}

export interface QuietRect extends FieldRect {
  /** 0..1 — 1 is perfectly flat, featureless space. */
  quietness: number;
  tone: ToneReading;
}

export interface ImageField {
  grid: { cols: number; rows: number; luminance: Float32Array; energy: Float32Array };
  /**
   * The dominant high-detail mass, in normalized canvas coordinates. This is what
   * type must not cover unless the art director asked it to — as distinct from
   * the IMAGE, which type may freely cross.
   */
  subjectBox: FieldRect;
  /** Energy-weighted centre of the picture — where the eye lands first. */
  focalCentroid: { x: number; y: number };
  /** Candidate regions for type, best first. */
  quietRects: QuietRect[];
  toneAt(rect: FieldRect): ToneReading;
  /** 0..1 share of `subjectBox` that `rect` covers. */
  occlusionOf(rect: FieldRect): number;
  /** 0..1 mean detail energy under the rect — high means type will fight the picture. */
  busynessAt(rect: FieldRect): number;
}

/** Coarse enough to be fast, fine enough to separate a subject from its ground. */
const COLS = 32;
const ROWS = 32;

/**
 * Past this much unevenness the brighter and darker halves of a box want
 * opposite ink colours, so no single flat colour is legible across it.
 */
const MIXED_STDDEV = 0.14;

/** sRGB channel -> linear, for the relative-luminance sum the contrast maths expects. */
const toLinear = (channel: number): number => {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

/**
 * Summed-area table over the grid, so the sum of any sub-rectangle is four
 * lookups. Built one row and column larger than the grid and zero-padded, which
 * removes every boundary special case from the query.
 */
class SummedArea {
  private readonly table: Float64Array;

  constructor(values: ArrayLike<number>, private readonly cols: number, rows: number) {
    this.table = new Float64Array((cols + 1) * (rows + 1));
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.table[(y + 1) * (cols + 1) + (x + 1)] =
          values[y * cols + x] +
          this.table[y * (cols + 1) + (x + 1)] +
          this.table[(y + 1) * (cols + 1) + x] -
          this.table[y * (cols + 1) + x];
      }
    }
  }

  /** Sum over the half-open tile range [x0,x1) by [y0,y1). */
  sum(x0: number, y0: number, x1: number, y1: number): number {
    const w = this.cols + 1;
    return this.table[y1 * w + x1] - this.table[y0 * w + x1] - this.table[y1 * w + x0] + this.table[y0 * w + x0];
  }
}

/** Normalized rect -> the half-open tile range covering it, always at least one tile. */
function tileRange(rect: FieldRect, cols: number, rows: number) {
  const clamp01 = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
  const left = clamp01(rect.x);
  const top = clamp01(rect.y);
  const right = clamp01(rect.x + Math.max(0, rect.width));
  const bottom = clamp01(rect.y + Math.max(0, rect.height));
  const x0 = Math.min(cols - 1, Math.floor(left * cols));
  const y0 = Math.min(rows - 1, Math.floor(top * rows));
  const x1 = Math.max(x0 + 1, Math.min(cols, Math.ceil(right * cols)));
  const y1 = Math.max(y0 + 1, Math.min(rows, Math.ceil(bottom * rows)));
  return { x0, y0, x1, y1, tiles: (x1 - x0) * (y1 - y0) };
}

function intersectionArea(a: FieldRect, b: FieldRect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Detail energy per tile: how much a tile differs from its right and lower
 * neighbours. A flat wall scores ~0; an eye, a label on a packet, a leaf edge
 * scores high. That is what "busy" means for the purpose of setting type — a
 * smooth gradient is not busy even though it is not uniform, which is why this
 * measures local difference rather than variance over the whole region.
 */
function detailEnergy(luminance: Float32Array, cols: number, rows: number): Float32Array {
  const energy = new Float32Array(cols * rows);
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const i = y * cols + x;
      const here = luminance[i];
      const dx = x + 1 < cols ? Math.abs(luminance[i + 1] - here) : 0;
      const dy = y + 1 < rows ? Math.abs(luminance[i + cols] - here) : 0;
      energy[i] = Math.min(1, Math.hypot(dx, dy) * 2);
    }
  }
  return energy;
}

/**
 * Per-tile saliency: how much a tile stands out from the picture's ground.
 *
 * Edge energy alone is not enough, and getting this wrong is the difference
 * between finding a subject and finding its outline. A solid dark object on a
 * pale wall has edges only along its perimeter — its interior is as flat as the
 * wall — so an energy-only detector traces a hollow ring and concludes the
 * middle of the object is free space to set type on.
 *
 * So saliency combines two things a subject always has:
 *
 *   - tone deviation from the ground (estimated as the median of the border
 *     tiles, since the frame edge is usually ground rather than subject), which
 *     fills in the object's interior, and
 *   - detail energy, which catches a textured subject sitting at the same
 *     overall brightness as its background.
 *
 * Both are normalized against their own maximum in this image, so the measure is
 * exposure-independent: a low-contrast photograph is judged on its own range
 * rather than against an absolute that only suits bright studio work.
 */
function computeSaliency(luminance: Float32Array, energy: Float32Array, cols: number, rows: number): Float32Array {
  const border: number[] = [];
  for (let x = 0; x < cols; x++) {
    border.push(luminance[x], luminance[(rows - 1) * cols + x]);
  }
  for (let y = 0; y < rows; y++) {
    border.push(luminance[y * cols], luminance[y * cols + cols - 1]);
  }
  border.sort((a, b) => a - b);
  const ground = border[Math.floor(border.length / 2)];

  const deviation = Float32Array.from(luminance, (v) => Math.abs(v - ground));
  let maxDeviation = 0;
  let maxEnergy = 0;
  for (let i = 0; i < deviation.length; i++) {
    if (deviation[i] > maxDeviation) maxDeviation = deviation[i];
    if (energy[i] > maxEnergy) maxEnergy = energy[i];
  }

  // Nothing stands out from anything: a flat or near-flat field has no subject.
  if (maxDeviation < 0.04 && maxEnergy < 0.04) return new Float32Array(cols * rows);

  const saliency = new Float32Array(cols * rows);
  for (let i = 0; i < saliency.length; i++) {
    const tone = maxDeviation > 0 ? deviation[i] / maxDeviation : 0;
    const detail = maxEnergy > 0 ? energy[i] / maxEnergy : 0;
    saliency[i] = Math.min(1, tone * 0.6 + detail * 0.4);
  }
  return saliency;
}

/**
 * The subject is the largest connected mass of salient tiles, not every salient
 * tile: a picture with a person on the left and a bright speckle in the far
 * corner has one subject, and a box drawn around both would cover the canvas and
 * forbid type everywhere.
 */
function findSubjectBox(saliency: Float32Array, cols: number, rows: number): FieldRect {
  let peak = 0;
  for (const v of saliency) if (v > peak) peak = v;
  // A flat field has no subject at all — say so rather than inventing one.
  if (peak < 0.2) return { x: 0, y: 0, width: 0, height: 0 };
  const threshold = peak * 0.45;

  const seen = new Uint8Array(cols * rows);
  let best: { weight: number; minX: number; minY: number; maxX: number; maxY: number } | null = null;

  for (let start = 0; start < saliency.length; start++) {
    if (seen[start] || saliency[start] < threshold) continue;
    const stack = [start];
    seen[start] = 1;
    let weight = 0;
    let minX = cols;
    let minY = rows;
    let maxX = -1;
    let maxY = -1;

    while (stack.length) {
      const i = stack.pop() as number;
      const x = i % cols;
      const y = (i - x) / cols;
      // Centre-weighted: a mass in the middle of the frame is likelier to be the
      // subject than one clinging to an edge, which is usually ground or crop.
      weight += 1 - Math.hypot(x / cols - 0.5, y / rows - 0.5);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;

      const neighbours = [
        x > 0 ? i - 1 : -1,
        x + 1 < cols ? i + 1 : -1,
        y > 0 ? i - cols : -1,
        y + 1 < rows ? i + cols : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && !seen[n] && saliency[n] >= threshold) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }

    if (!best || weight > best.weight) best = { weight, minX, minY, maxX, maxY };
  }

  if (!best || best.maxX < 0) return { x: 0, y: 0, width: 0, height: 0 };
  return {
    x: best.minX / cols,
    y: best.minY / rows,
    width: (best.maxX - best.minX + 1) / cols,
    height: (best.maxY - best.minY + 1) / rows,
  };
}

/**
 * Proposes type regions by scoring a lattice of candidates. Every candidate is a
 * band or block a designer would actually consider — full-width strips,
 * half-width columns, tall side panels — rather than arbitrary boxes, because a
 * placement nobody would choose is not worth ranking.
 */
function proposeQuietRects(
  subjectBox: FieldRect,
  busynessAt: (rect: FieldRect) => number,
  toneAt: (rect: FieldRect) => ToneReading,
): QuietRect[] {
  const spans: Array<{ width: number; height: number }> = [
    { width: 1, height: 0.22 },
    { width: 1, height: 0.3 },
    { width: 0.52, height: 0.28 },
    { width: 0.52, height: 0.42 },
    { width: 0.44, height: 0.6 },
    { width: 0.86, height: 0.18 },
  ];
  const subjectArea = subjectBox.width * subjectBox.height;
  const candidates: QuietRect[] = [];

  for (const span of spans) {
    const xSteps = span.width >= 1 ? [0] : [0, (1 - span.width) / 2, 1 - span.width];
    const ySteps = span.height >= 1 ? [0] : [0, (1 - span.height) / 2, 1 - span.height];
    for (const x of xSteps) {
      for (const y of ySteps) {
        const rect: FieldRect = { x, y, width: span.width, height: span.height };
        const tone = toneAt(rect);
        const occlusion = subjectArea > 0 ? intersectionArea(rect, subjectBox) / subjectArea : 0;
        // Evenness counts as much as calm: type reads on a flat dark field and
        // fails on a field that is half bright, even when both are "quiet".
        const quietness = Math.max(0, 1 - busynessAt(rect)) * (1 - Math.min(1, tone.stdDev * 1.6));
        candidates.push({ ...rect, quietness: quietness - occlusion * 0.75, tone });
      }
    }
  }

  return candidates.sort((a, b) => b.quietness - a.quietness).slice(0, 8);
}

/**
 * Measures the visual. Never throws: an unreadable buffer yields a neutral field
 * in which nothing is occluded and every region scores alike, so every caller
 * downstream behaves exactly as it did before this stage existed.
 */
export async function analyzeImageField(png: Buffer): Promise<ImageField> {
  let luminance: Float32Array;
  try {
    const { data } = await sharp(png)
      .removeAlpha()
      .resize(COLS, ROWS, { fit: 'fill' })
      .raw()
      .toBuffer({ resolveWithObject: true });
    luminance = new Float32Array(COLS * ROWS);
    for (let i = 0; i < COLS * ROWS; i++) {
      const o = i * 3;
      luminance[i] = 0.2126 * toLinear(data[o]) + 0.7152 * toLinear(data[o + 1]) + 0.0722 * toLinear(data[o + 2]);
    }
  } catch {
    luminance = new Float32Array(COLS * ROWS).fill(0.5);
  }

  const energy = detailEnergy(luminance, COLS, ROWS);
  const lumSum = new SummedArea(luminance, COLS, ROWS);
  const sqSum = new SummedArea(Float32Array.from(luminance, (v) => v * v), COLS, ROWS);
  const energySum = new SummedArea(energy, COLS, ROWS);

  const busynessAt = (rect: FieldRect): number => {
    const { x0, y0, x1, y1, tiles } = tileRange(rect, COLS, ROWS);
    return energySum.sum(x0, y0, x1, y1) / tiles;
  };

  const toneAt = (rect: FieldRect): ToneReading => {
    const { x0, y0, x1, y1, tiles } = tileRange(rect, COLS, ROWS);
    const mean = lumSum.sum(x0, y0, x1, y1) / tiles;
    const variance = Math.max(0, sqSum.sum(x0, y0, x1, y1) / tiles - mean * mean);
    const stdDev = Math.sqrt(variance);
    const verdict: ToneReading['verdict'] = stdDev > MIXED_STDDEV ? 'mixed' : mean > 0.45 ? 'light' : 'dark';
    return { meanLuminance: mean, stdDev, verdict };
  };

  const saliency = computeSaliency(luminance, energy, COLS, ROWS);
  const subjectBox = findSubjectBox(saliency, COLS, ROWS);
  const subjectArea = subjectBox.width * subjectBox.height;

  let weighted = 0;
  let cx = 0;
  let cy = 0;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const s = saliency[y * COLS + x];
      weighted += s;
      cx += (s * (x + 0.5)) / COLS;
      cy += (s * (y + 0.5)) / ROWS;
    }
  }
  const focalCentroid = weighted > 0 ? { x: cx / weighted, y: cy / weighted } : { x: 0.5, y: 0.5 };

  return {
    grid: { cols: COLS, rows: ROWS, luminance, energy },
    subjectBox,
    focalCentroid,
    quietRects: proposeQuietRects(subjectBox, busynessAt, toneAt),
    toneAt,
    busynessAt,
    occlusionOf: (rect) => (subjectArea > 0 ? intersectionArea(rect, subjectBox) / subjectArea : 0),
  };
}
