/**
 * Hex → plain words, for anything that ends up inside an image prompt.
 *
 * A hex code anywhere in a prompt has been observed rendered INTO the image
 * as literal text — "#2563EEb" written across a prop. The model needs the
 * feeling of a colour, never its code. Lives here rather than in the service
 * because both the visual prompt and the campaign prompt need it, and a
 * prompt module importing the service would close an import cycle.
 */

const HUE_NAMES: Array<[number, string]> = [
  [15, 'red'], [40, 'orange'], [65, 'amber'], [95, 'yellow-green'], [150, 'green'],
  [185, 'teal'], [215, 'blue'], [255, 'indigo'], [290, 'violet'], [330, 'magenta'], [360, 'red'],
];

export function describePaletteColor(raw: string): string {
  const hex = raw.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) return raw;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));

  if (sat < 0.12) {
    return light > 0.9 ? 'white' : light > 0.7 ? 'light grey' : light > 0.4 ? 'grey' : light > 0.15 ? 'charcoal' : 'black';
  }
  let hue = 0;
  if (max === r) hue = ((g - b) / (max - min)) % 6;
  else if (max === g) hue = (b - r) / (max - min) + 2;
  else hue = (r - g) / (max - min) + 4;
  hue = (hue * 60 + 360) % 360;
  const name = HUE_NAMES.find(([limit]) => hue <= limit)?.[1] ?? 'red';
  const prefix = light > 0.82 ? 'pale ' : light > 0.62 ? 'soft ' : light < 0.28 ? 'deep ' : '';
  const muted = sat < 0.35 ? 'muted ' : '';
  return `${prefix}${muted}${name}`;
}
