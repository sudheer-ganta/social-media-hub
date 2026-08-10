# Motion

framer-motion only — already a dependency.

Motion reports **state, hierarchy and continuity**. If an animation does not
answer "what just changed?", delete it. Modern means confident and quick, not
abundant.

## Constants

- Easing `[0.32, 0.72, 0, 1]` for entrances and layout; `[0.4, 0, 0.2, 1]`
  otherwise.
- Durations: micro 120–160ms · enter/exit 200–260ms · layout/route 300–380ms ·
  opening sequence ≤1200ms.
- Shared position uses `layoutId`, never a fade: the masthead underline, the
  mobile nav marker, the Flow Rail item.
- Springs only when the user is moving something: `{ type: "spring",
  bounce: 0.18, duration: 0.4 }`.

## The signature — Flow Rail

The one interaction people should remember.

The rail is a persistent strip under the masthead: **Draft ▸ Scheduled ▸
Publishing ▸ Published**, with live counts. When a post changes stage — you
schedule from the Composer, a publish succeeds, a retry fires — its thumbnail
appears at the old stage and travels along the rail to the new one over ~600ms,
the source count ticks down and the destination ticks up.

- The rail is ink. Only the travelling thumbnail carries platform colour.
- One item travels at a time; a queue drains sequentially.
- `layoutId` on the thumbnail, so it flies from the Composer's canvas into the
  rail when scheduled.
- Reduced motion: counts update instantly, nothing travels.

## Opening sequence — 1.2s, once per session

Scattered content fragments → settle into columns → columns draw into a single
rail → rail collapses to the FlowPost mark → masthead rule draws across →
workspace. Communicates "all your social workflows, one flow."

Non-blocking cover: the app mounts and fetches underneath. `sessionStorage`
gates repeats. Under `prefers-reduced-motion` it does not render at all — the
workspace is simply there.

## Elsewhere

| Surface | Motion |
| --- | --- |
| Masthead | Ink underline slides between sections (`layoutId`). |
| Mobile nav | Marker slides; compose button `active:scale-95`. |
| Composer mode switch | The canvas **resizes between aspect ratios** — 1:1/4:5 → 9:16 — as a single spring. The reframe *is* the mode change. Mode-specific controls cross-fade. |
| Media | Hover lift 2px + `shadow-soft`. Nothing scales past 1.02. |
| Calendar | Items animate to new slots; drop target grows a hairline. |
| Charts | Series draw over 400ms on first paint, 40ms stagger. Never on re-render. |
| Sheets / dialogs | Slide 8px + fade; dialogs scale from 0.98. |
| Buttons | `active:scale-[0.98]`, 120ms. |

## Rules

- Honour `prefers-reduced-motion` via `useReducedMotion()`. Reduced motion is
  *no* animation and the end state — never a faster version.
- Animate `transform` and `opacity` only. Never `width`/`height`/`top` in lists.
- Nothing animates twice for one event. Nothing loops except a true
  in-progress indicator.
- Mobile gets the same motion at the same durations, or none.
