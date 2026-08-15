import sharp from 'sharp';
import { describeLogoZone } from '../prompts/campaign-creative.prompt';

/**
 * The one place a brand logo ever reaches a finished creative.
 *
 * The campaign pass designs everything else, but it is never asked to draw the
 * mark: an image model approximates a logo, and an approximated logo is a
 * wrong logo. The member's actual uploaded file is composited here at real
 * pixels, into the zone the campaign prompt reserved for it.
 */

/** Fraction of the canvas's short edge the mark may occupy, and the margin it keeps from the edges. */
const LOGO_SCALE = 0.13;
const MARGIN_SCALE = 0.05;

export interface LogoPlacement {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Turns the layout's placement prose into a real rect. The same
 * {@link describeLogoZone} vocabulary the prompt reserved space with, so the
 * mark lands where the design was told to stay clean — the placement varies
 * per concept rather than defaulting to one fixed corner.
 */
export function resolveLogoPlacement(
  placement: string,
  canvas: { width: number; height: number },
  logo: { width: number; height: number },
): LogoPlacement {
  const short = Math.min(canvas.width, canvas.height);
  const margin = Math.round(short * MARGIN_SCALE);
  const box = Math.round(short * LOGO_SCALE);

  // Fit inside the box without enlarging past the file's own resolution —
  // an upscaled logo is a blurry logo.
  const scale = Math.min(box / logo.width, box / logo.height, 1);
  const width = Math.max(1, Math.round(logo.width * scale));
  const height = Math.max(1, Math.round(logo.height * scale));

  const [vertical, horizontal] = describeLogoZone(placement).split('-');
  const top =
    vertical === 'top'
      ? margin
      : vertical === 'middle'
        ? Math.round((canvas.height - height) / 2)
        : canvas.height - height - margin;
  const left =
    horizontal === 'left'
      ? margin
      : horizontal === 'centre'
        ? Math.round((canvas.width - width) / 2)
        : canvas.width - width - margin;

  return {
    left: Math.max(0, Math.min(left, canvas.width - width)),
    top: Math.max(0, Math.min(top, canvas.height - height)),
    width,
    height,
  };
}

export interface CompositeLogoOptions {
  /** The finished campaign creative, as the image model returned it. */
  image: Buffer;
  /** The member's real logo file. */
  logo: Buffer;
  /** Placement prose from the layout direction, e.g. "bottom-right corner, small". */
  placement: string;
}

/**
 * Composites the real logo onto the campaign creative. Returns PNG bytes.
 *
 * Throws only if the base image itself is unreadable — a broken logo file is
 * not worth losing a good creative over, so the caller treats a failure here
 * as "no logo this time" rather than a failed generation.
 */
export async function compositeLogo({ image, logo, placement }: CompositeLogoOptions): Promise<Buffer> {
  const base = sharp(image);
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error('campaign image has no readable dimensions');

  const short = Math.min(meta.width, meta.height);
  const box = Math.round(short * LOGO_SCALE);
  const resized = await sharp(logo)
    .resize(box, box, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
  const resizedMeta = await sharp(resized).metadata();

  const spot = resolveLogoPlacement(
    placement,
    { width: meta.width, height: meta.height },
    { width: resizedMeta.width ?? box, height: resizedMeta.height ?? box },
  );

  return base
    .composite([{ input: resized, top: spot.top, left: spot.left }])
    .png()
    .toBuffer();
}
