---
name: flowpost-design
description: FlowPost's design contract — the Masthead direction. Tokens, typography, components, motion, page structure. Use whenever building or changing any UI in this repo (pages, components, styling, animation, empty/loading states, responsive work). Triggers on "redesign", "style this", "new page", "component", "layout", "animation", "empty state", "dark mode", "mobile", "composer".
---

# FlowPost design contract — Masthead

**Direction: Editorial × Modern Creator Studio.** Approved and permanent.
Not a newspaper website, not a dashboard, not an AI SaaS product.

FlowPost is one connected publishing system:

    CREATE → PLAN → SCHEDULE → PUBLISH → MONITOR → LEARN

## The contract — seven rules

1. **FlowPost is achromatic. Colour belongs to the networks.**
   Surfaces, type, actions and chrome are paper and ink. The only hue in the
   product comes from the user's connected platforms and from semantic state
   (failed / warning / published). FlowPost cannot drift purple because
   FlowPost has no colour of its own.

2. **Masthead, not sidebar.** Navigation is a horizontal bar across the top.
   No left rail. That width belongs to content, permanently.

3. **The Flow Rail is always present.** A thin pipeline strip under the
   masthead — Draft ▸ Scheduled ▸ Publishing ▸ Published — on every screen.
   The pipeline is a place, not a report.

4. **Rules, not card grids.** Structure comes from hairline rules, alignment
   and whitespace. Cards exist only where the content is physically a thing:
   media. A uniform grid of identical bordered boxes is the failure state.

5. **Asymmetric editorial grid.** Importance is size and position, never a
   coloured badge. The most important item on a screen is visibly the largest.

6. **Media at its natural aspect.** Never crop content into uniform squares
   for tidiness. 1:1, 4:5, 9:16 and 16:9 all render as themselves.

7. **Modern, not decorative.** Typography is a modern grotesque doing
   hierarchy through weight, size and tracking. One serif exists, used for
   exactly one element. Usability outranks aesthetics every time.

## The logo is fixed

`src/components/brand/Logo.tsx` is a supplied brand asset. **Never redesign,
replace, reinterpret, recolour, gradient-fill or regenerate it.** Render it,
size it, place it. Nothing else.

## Files

| File | Read it when |
| --- | --- |
| `design-system.md` | Colour, type, spacing, surfaces, elevation |
| `components.md` | Building or reusing a primitive |
| `motion.md` | Any animation, plus the Flow Rail and opening sequence |
| `pages.md` | A screen's structure and information architecture |
| `anti-patterns.md` | **Before shipping** — what disqualifies work |

## Non-negotiables

- No hardcoded hex or Tailwind palette colours (`bg-blue-500`). Semantic tokens
  only. The `platform-*` scale is the sole exception.
- No new UI dependencies. Stack is fixed: React 19, Tailwind, Radix,
  framer-motion, recharts, lucide, sonner, react-hook-form + zod.
- No second version of an existing primitive. Extend it.
- UI layer only. Services, repositories, providers, the Prisma schema, auth,
  OAuth, publishing and scheduling are not touched to make a design work.
