# Anti-patterns

Run before shipping any UI. Two questions decide it:

> **Would this look like a generic AI-generated SaaS template?**
> **Would this look like a newspaper website?**

Either yes — redesign it.

## Never

| Don't | Do instead |
| --- | --- |
| Purple, indigo, violet, blue-violet gradients | Nothing. FlowPost is achromatic |
| Warm cream + terracotta/vermilion | Paper and ink |
| An accent hue of any kind for FlowPost itself | Ink actions; hue only from networks and state |
| A left sidebar | The masthead |
| Four KPI cards across the top | Lead block + above-the-fold + week + performance |
| A uniform grid of identical bordered cards | Rules, alignment, whitespace; cards only for media |
| Cropping media to uniform squares | Natural aspect ratios |
| Drop caps, hairline column rules, all-serif body, broadsheet pastiche | Modern grotesque; the serif appears once, on the Today lead headline |
| Database rows for content | Media-first cards |
| Full-screen spinners | Content-shaped skeletons |
| "No data found." | A written line and one next action |
| Hardcoded `bg-blue-500` or hex | Semantic tokens |
| A new Button/Card/Input for one page | Extend the primitive |
| Sparkles, wands, "magic", ✨, "Powered by AI" | Say what happens: "Publishing to Instagram" |
| Emoji as iconography | lucide icons |
| Glassmorphism as decoration | Hairline on a solid surface; `.glass` is the sticky masthead only |
| Animation because it looked nice | Animation that reports a state change |
| State carried by colour alone | Colour **and** a word or shape |

## The logo

Never redesign, replace, reinterpret, recolour, gradient-fill or regenerate
`src/components/brand/Logo.tsx`. It is a supplied brand asset. Render it as-is.

## Also never

- Shrinking desktop and calling it mobile.
- Sacrificing usability for editorial effect — if a layout is beautiful and
  hard to scan, it is wrong.
- Making analytics decorative at the cost of being readable.
- Changing backend logic, APIs, auth, OAuth, publishing or scheduling to make a
  layout work. If the architecture blocks a good UI, say so and stop.
- Adding a dependency the repo does not already have.
- Inventing placeholder content instead of the real `Post` / integration shapes.
- Animating without a `prefers-reduced-motion` path.
- Shipping a screen checked in only one theme.

## Known debt

`src/components/marketing/*` still hardcodes violet/sky/indigo from the
previous identity — the last non-conforming surface. Port to semantic and
`platform-*` tokens.
