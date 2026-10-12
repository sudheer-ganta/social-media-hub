import { describe, expect, it } from "vitest";
import { revealPrerenderedMarkup } from "./prerender-visibility.mjs";

describe("revealPrerenderedMarkup", () => {
  it("removes hidden opacity and entrance offsets", () => {
    const out = revealPrerenderedMarkup('<p style="opacity:0;transform:translateY(28px)">Hi</p>');
    expect(out).toBe("<p>Hi</p>");
  });

  it("removes the headline mask offset", () => {
    const out = revealPrerenderedMarkup('<span class="block" style="transform:translateY(112%)">Present</span>');
    expect(out).toBe('<span class="block">Present</span>');
  });

  it("handles x offsets and dimmed (non-zero) opacity", () => {
    expect(revealPrerenderedMarkup('<i style="opacity:0;transform:translateX(-10px)"></i>')).toBe("<i></i>");
    expect(revealPrerenderedMarkup('<i style="opacity:0.18;transform:translateY(10px)"></i>')).toBe("<i></i>");
  });

  it("keeps unrelated declarations", () => {
    const out = revealPrerenderedMarkup('<img style="object-position:50% 20%;opacity:0;transform:translateY(6px)" />');
    expect(out).toBe('<img style="object-position:50% 20%" />');
  });

  it("leaves non-hiding transforms (progress bars, positions) alone", () => {
    for (const s of ["transform:scaleX(0)", "transform:scaleX(1)", "transform:translateX(300px) translateY(420px)", "transform:translateY(-40px)"]) {
      expect(revealPrerenderedMarkup(`<b style="${s}"></b>`)).toBe(`<b style="${s}"></b>`);
    }
  });

  it("leaves composer-demo steps (scale + hidden opacity) as rendered", () => {
    const s = "opacity:0;transform:scale(0.85)";
    expect(revealPrerenderedMarkup(`<b style="${s}"></b>`)).toBe(`<b style="${s}"></b>`);
  });
});
