# Components

Primitives in `src/components/ui` (Radix + CVA), product pieces in
`src/components/shared` and `src/components/layout`. **Extend, never fork.**

## Shell

**Masthead** (`layout/Masthead.tsx`) — the only navigation on desktop. Logo
left (untouched brand asset), sections centre-left as a rule-separated row,
account and compose action right. Active section is marked by an ink underline
that slides between items, not a filled pill. Sticky. 56px.

**FlowRail** (`layout/FlowRail.tsx`) — 32px strip directly under the masthead
on every screen. Four stages with live counts from `useAllPosts`:
Draft ▸ Scheduled ▸ Publishing ▸ Published. Clicking a stage filters the
Library to it. When a post changes stage, its thumbnail travels the rail.

**MobileNav** (`layout/MobileNav.tsx`) — bottom bar, five slots, compose in the
centre as a filled ink circle. Safe-area inset. The masthead collapses to
wordmark + current section + overflow on small screens.

## Existing primitives — use these

`ui/`: avatar, badge, button, card, dialog, dropdown-menu, input, label,
popover, select, separator, skeleton, sonner, switch, textarea, tooltip.

`shared/`: `EmptyState`, `PlatformIcon`, `StatusBadge`, `Pagination`,
`AiErrorBanner`, `SupabaseNotice`.

Add a CVA variant rather than a file. New primitives (Tabs, Sheet, MediaTile)
only when genuinely absent.

## Product components

**PlatformBadge** — glyph + name in `.text-meta`, tinted with the matching
`platform-*` token. Surface stays neutral.

**StatusBadge** — the pipeline vocabulary, the only words used for it anywhere:

| Status | Treatment |
| --- | --- |
| `draft` | Ink outline, muted text — "Draft" |
| `scheduled` | Ink outline + time — "Scheduled 18:00" |
| `queued` | Same as scheduled, "Queued" |
| `publishing` | Filled ink, animated dot — "Publishing" |
| `published` | `success` dot + text — "Published" |
| `failed` | `destructive` dot + text — "Failed" |

Colour never carries the state alone; the word is always present.

**MediaTile** — the atom. **Natural aspect ratio**, `rounded-lg`,
`overflow-hidden`, hairline border, `object-cover` only inside its true frame.
Metadata overlays the bottom edge on a scrim. Hover: `-translate-y-0.5` +
`shadow-soft`.

**PostCard** — media at its own aspect, caption clamped to 2–3 lines, then a
meta row: `PlatformBadge` · time · `StatusBadge`. A 3px platform-coloured cap
on the media edge when single-platform. Never a table row.

**ContentPreview** — renders a post as its network would: correct aspect,
caption truncation and chrome per platform. The Composer's hero; it is large.

**AnalyticsChart** — recharts. Primary series is ink; comparison series use
`platform-*`. Faint grid, emphasized endpoint, single flat area fill at 8%
opacity. **Always led by a sentence** that says what happened — "Engagement is
rising" — with the number secondary. Analytics must stay legible: label axes,
use `tabular-nums`, never rely on hue alone to distinguish two series.

**EmptyState** — icon, a written line, one action. Never "No data found".
"Your week is wide open." / "Nothing published yet — the first one is the hard one."

**Skeleton** — shaped like what it replaces: masthead + rail + lead block,
calendar grid, chart frame, media grid, composer canvas. Never a full-screen
spinner.
