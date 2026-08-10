# Screens

Routes in `src/App.tsx`. Data shapes in `src/types/post.ts` (`Post`,
`PostStatus`, `Platform`, `PostMediaItem`) and `src/constants/integrations.ts`.
**Design against those types.** A screen that only looks good with invented
placeholder content is not finished.

Every screen sits under the masthead and the Flow Rail.

## Today (`/`) — the Front Page

Answers: what is happening now · what needs me · what publishes next · how is
content performing. Never a KPI card row.

Asymmetric grid, two columns on desktop (≈1.7 / 1):

- **Lead block** — the single most urgent item at full column width: normally
  the next publish (real media, large, natural aspect), or a failed post the
  moment one fails. Headline set in `font-lead` — the one serif in the product.
  Platform badges and time beneath.
- **Above the fold** (right rail) — failures, expiring tokens, drafts with no
  schedule. Each a rule-separated row with its exact next action.
- **This week** — scheduled count, draft count, and the actual next few
  thumbnails inline.
- **Performance** — two or three findings as sentences, number secondary.

The page recomposes when the urgent item changes.

## Composer (`/posts/new`, `/posts/:id/edit`) — the flagship

A creator studio, not a form. Desktop: **canvas left at ~60% width**, controls
in a quiet right column separated by rules — no nested cards, no accordions
hiding the essentials.

**Post / Reel / Story are creative modes, not tabs on one form.** Switching
reframes the canvas as a spring (1:1 or 4:5 → 9:16) and swaps the mode's own
controls:

- **Post** — carousel strip under the canvas, per-image framing, caption,
  hashtags, link/CTA.
- **Reel** — vertical canvas is the centre of gravity: media, **cover frame
  picker**, caption, music/credit field, platform, schedule.
- **Story** — a horizontal **filmstrip of frames** above the vertical canvas;
  each frame is its own media plus text. Never the Post form at 9:16.

Account selection is platform-coloured chips. The primary action states the
outcome — "Schedule for 18:00", "Publish now" — and on success the canvas
thumbnail flies into the Flow Rail.

Mobile: canvas first and full-bleed, mode switch as a segmented control beneath
it, controls in a bottom sheet, primary action pinned above the nav.

## Plan (`/calendar`)

"What am I publishing this week?" Week view default. Each slot carries a real
thumbnail, platform badge and status. Drag to reschedule where the existing
handler allows; drop target grows a hairline, item springs home.

## Library (`/posts`)

A creative archive. Media-first, natural aspects, grouped Drafts / Scheduled /
Published / Failed / Archived, filtered by chips using the status vocabulary.
A dense row view is a secondary toggle, never the default.

## Insights (`/analytics`)

Tells a story and stays readable. Each block leads with the finding as a
sentence, number second: growth, reach, engagement, platform comparison,
best-performing content. Charts are labelled, `tabular-nums`, legible without
colour. No ledger tables.

## Accounts (`/integrations`)

"Your social world is connected here." Networks shown as one system feeding
FlowPost. Connection state unmissable — connected / needs reconnect /
disconnected — each with its exact next action. An expiring token is never
subtle grey.

## Settings (`/settings`)

Quiet on purpose. One column, labelled sections separated by rules: Account,
Workspace, Social connections, Publishing, Notifications, Appearance,
Security. No competing cards.

## Every screen

- Loading → skeleton shaped like the real content.
- Empty → `EmptyState`, written line, one action.
- Error → inline and in place, with retry. Never a blank page.
- Mobile → rethought: bottom nav, thumb-reachable primary action, sheets
  instead of side panels, full-bleed media.
