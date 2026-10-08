import sharp from 'sharp';

/**
 * The stand-in logo for a member who has not uploaded one: their name, set in
 * white on a dark plate.
 *
 * It replaces a bare white wordmark on a transparent 600x160 canvas that had two
 * faults. A name longer than about thirteen letters ran off both edges, which the
 * design critic read as "truncated" and rejected, and white text with nothing
 * behind it vanished on any light picture, which the critic read as "missing".
 * Each rejected attempt costs another image generation.
 *
 * The plate makes the mark legible on any picture, and the text is measured
 * rather than guessed, so it is scaled to fit whatever the name and the font turn
 * out to be.
 */

const FONT_SIZE = 52;
const MIN_FONT_SIZE = 14;
const MAX_TEXT_WIDTH = 544;
const PAD_X = 28;
const PAD_Y = 20;
const MAX_NAME_LENGTH = 30;
const PLATE_FILL = '#111111';
const PLATE_OPACITY = 0.78;

/** Letters, digits, spaces, dots and hyphens only, so the name can never break the SVG. */
export function wordmarkText(name: string): string {
  const cleaned = name.replace(/[^\w\s.-]/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  if (cleaned.length <= MAX_NAME_LENGTH) return cleaned || 'BRAND';
  // Cut at a word boundary where there is one, so a long name is shortened, not mangled.
  const cut = cleaned.slice(0, MAX_NAME_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > 12 ? cut.slice(0, lastSpace) : cut).trim() || 'BRAND';
}

async function renderText(text: string, size: number): Promise<{ data: Buffer; width: number; height: number }> {
  const spacing = (4 * size) / FONT_SIZE;
  // A canvas far wider than any name, so measuring never clips what it measures.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="${Math.ceil(size * 2)}">
    <text x="40" y="${Math.ceil(size * 1.3)}" font-family="sans-serif" font-weight="800" font-size="${size}" fill="#FFFFFF" letter-spacing="${spacing}">${text}</text>
  </svg>`;
  const { data, info } = await sharp(Buffer.from(svg)).png().trim().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

export async function buildFallbackWordmark(name: string): Promise<{ mimeType: 'image/png'; data: string }> {
  const text = wordmarkText(name);

  let size = FONT_SIZE;
  let measured = await renderText(text, size);
  // Width does not scale exactly with size (letter-spacing, hinting), so step down
  // and measure again until the text really fits.
  for (let guard = 0; measured.width > MAX_TEXT_WIDTH && size > MIN_FONT_SIZE && guard < 12; guard += 1) {
    size = Math.max(MIN_FONT_SIZE, Math.min(size - 1, Math.floor((size * MAX_TEXT_WIDTH) / measured.width)));
    measured = await renderText(text, size);
  }

  const width = measured.width + PAD_X * 2;
  const height = measured.height + PAD_Y * 2;
  const plate = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect width="${width}" height="${height}" rx="${Math.round(height / 4)}" fill="${PLATE_FILL}" fill-opacity="${PLATE_OPACITY}"/>
  </svg>`;

  const png = await sharp(Buffer.from(plate))
    .composite([{ input: measured.data, left: PAD_X, top: PAD_Y }])
    .png()
    .toBuffer();
  return { mimeType: 'image/png', data: png.toString('base64') };
}
