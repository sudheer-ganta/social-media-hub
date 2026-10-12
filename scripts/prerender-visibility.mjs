/**
 * Progressive enhancement for prerendered pages.
 *
 * The entrance animations (framer-motion `initial`) are server-rendered as inline
 * styles such as `opacity:0;transform:translateY(28px)` or `transform:translateY(112%)`.
 * Left in the static HTML, the hero headline, copy and CTA are invisible to anyone
 * (or any crawler) that does not run JavaScript.
 *
 * This strips only those *hidden starting states* from the generated markup, so the
 * static page starts fully visible. Once the client bundle hydrates, framer-motion
 * owns the elements again and plays its entrance animations from `initial`, so
 * nothing is hidden before client-side animation setup has run. `prefers-reduced-motion`
 * is already handled client-side (`initial={false}`), so those visitors get no hide step.
 *
 * Left untouched on purpose: styles that carry `scale(` together with a hidden
 * opacity. Those are the internal steps of the hero's composer demo (chips and
 * thumbnails that appear one by one), which are decoration, not page content.
 */

const STYLE_ATTR = /\sstyle="([^"]*)"/g;

/** True for `translate*` / `rotate` values only, i.e. a pure entrance offset. */
const OFFSET_ONLY = /^(?:\s*(?:translate[XYZ]?|rotate)\([^)]*\))+\s*$/;

function cleanDeclarations(style) {
  const decls = style
    .split(";")
    .map((d) => d.trim())
    .filter(Boolean);
  const map = new Map(decls.map((d) => [d.slice(0, d.indexOf(":")).trim(), d.slice(d.indexOf(":") + 1).trim()]));

  const opacity = map.get("opacity");
  const transform = map.get("transform");
  const hiddenOpacity = opacity !== undefined && Number(opacity) < 1;
  const demoStep = transform !== undefined && /scale\(/.test(transform) && hiddenOpacity;
  if (demoStep) return style;

  if (hiddenOpacity) map.delete("opacity");
  if (transform !== undefined && OFFSET_ONLY.test(transform) && (hiddenOpacity || /(?:^|\s)translate[XY]?\(\s*-?\d+(?:\.\d+)?%/.test(transform))) {
    // Only offsets that belong to an entrance (paired with a hidden opacity, or a
    // percentage mask offset like translateY(112%)) are removed.
    map.delete("transform");
  }
  return [...map].map(([k, v]) => `${k}:${v}`).join(";");
}

/** Remove entrance-animation hiding from server-rendered markup. */
export function revealPrerenderedMarkup(html) {
  return html.replace(STYLE_ATTR, (_m, style) => {
    const next = cleanDeclarations(style);
    return next ? ` style="${next}"` : "";
  });
}
