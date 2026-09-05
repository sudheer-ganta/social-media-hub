import { Resvg } from '@resvg/resvg-js';
import { fontFilePath } from '../typography/font-catalog';

/**
 * Rasterizes the text-overlay SVG using the REAL selected font files, instead
 * of letting sharp/librsvg fall back to whatever fonts happen to be installed
 * on the render host (the previous behaviour — see layout-plan.ts's old
 * FAMILY_STACKS comment). This is the fix for spec §6: an AI image model must
 * never be trusted to render exact text, and neither can a host-dependent
 * font fallback chain — both produce wrong glyphs. `@resvg/resvg-js` is
 * pointed at exactly the font files the typography engine selected
 * (font-selector.ts's `facesUsed`) with `loadSystemFonts: false`, so the same
 * creative renders identical text/typography on every machine.
 */
export function rasterizeTextOverlay(
  svg: string,
  facesUsed: Array<{ family: string; weight: number; style: 'normal' | 'italic' }>,
): Buffer {
  const fontFiles = [...new Set(facesUsed.map((f) => fontFilePath(f.family, f.weight, f.style)))];
  const resvg = new Resvg(svg, {
    font: {
      fontFiles,
      loadSystemFonts: false,
    },
  });
  const rendered = resvg.render();
  return rendered.asPng();
}
