import type { StyleDNA } from './style-dna';
import type { CreativeDirection } from '../types';

/**
 * Deterministic checks of what a generation stage actually produced against
 * the member's explicitly selected Style DNA — never an AI "does this look
 * like X" score. Every check here reads structured fields Style DNA already
 * declares (color.saturation, color.brightness, ...) and structured fields
 * the stage under check already returns; nothing is inferred from free text.
 */

export function hexSatLight(hex: string): { sat: number; light: number } | undefined {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return undefined;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(match[1].slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  return { sat, light };
}

export const saturationBucket = (sat: number): StyleDNA['color']['saturation'] =>
  sat < 0.22 ? 'muted' : sat < 0.55 ? 'balanced' : 'vibrant';

export const brightnessBucket = (light: number): StyleDNA['color']['brightness'] =>
  light < 0.3 ? 'dark' : light < 0.75 ? 'balanced' : 'bright';

/**
 * Checks a set of hex colours against the selected style's declared
 * saturation/brightness. Deliberately conservative — only flags a violation
 * when EVERY colour clearly disagrees with a non-"balanced" requirement, so
 * ordinary creative variation within the style's own described range never
 * trips a false positive. Style DNA intentionally avoids fixed hex swatches
 * ("vary within X, do not copy fixed swatches mechanically" — style-dna.ts),
 * so this checks the *character* of the palette, never specific hex values.
 * Shared by the creative-direction stage (checking the model's proposed
 * palette) and the renderer stage (checking the final resolved ink/paper/
 * accent) — same rule, different point in the pipeline.
 */
export function paletteComplianceViolations(hexColors: string[], style: StyleDNA, label = 'the palette'): string[] {
  const readings = hexColors.map(hexSatLight).filter((r): r is { sat: number; light: number } => Boolean(r));
  if (readings.length === 0) return [];

  const violations: string[] = [];
  const familyHint = style.color.paletteFamilies.map((family) => family.join('/')).join(' or ');

  if (style.color.saturation !== 'balanced') {
    const allWrong = readings.every((r) => saturationBucket(r.sat) !== style.color.saturation);
    if (allWrong) {
      violations.push(
        `${label} (${hexColors.join(', ')}) reads as ${saturationBucket(readings[0].sat)}, but the selected style "${style.name}" requires a ${style.color.saturation} palette — choose hex values whose saturation matches, in the spirit of: ${familyHint}.`,
      );
    }
  }
  if (style.color.brightness !== 'balanced') {
    const allWrong = readings.every((r) => brightnessBucket(r.light) !== style.color.brightness);
    if (allWrong) {
      violations.push(
        `${label} (${hexColors.join(', ')}) reads as ${brightnessBucket(readings[0].light)}, but the selected style "${style.name}" requires a ${style.color.brightness} palette — choose hex values whose brightness matches, in the spirit of: ${familyHint}.`,
      );
    }
  }
  return violations;
}

/**
 * Checks the palette the creative-direction stage returned against the
 * selected style. See {@link paletteComplianceViolations} for the rule.
 */
export function styleDirectionViolations(direction: Pick<CreativeDirection, 'palette'>, style?: StyleDNA): string[] {
  if (!style || direction.palette.length === 0) return [];
  return paletteComplianceViolations(direction.palette, style);
}
