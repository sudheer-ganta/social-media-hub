# Foundations

Declared in `src/index.css`, wired in `tailwind.config.ts`. Change the palette
there and the product follows — never per-component.

## Colour

FlowPost's own palette is achromatic. Reach for a hue only when it is a
network's identity or a semantic state.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `background` | Paper `#F7F7F5` | Ink `#0F1011` | The page |
| `card` | Plate `#FFFFFF` | `#17181A` | Media plates, sheets, popovers |
| `secondary` | `#EEEEEB` | `#212325` | Recessed wells, active nav, toolbars |
| `muted` / `muted-foreground` | | | Quiet fills, tertiary type |
| `border` | Rule `#D8D8D4` | `#2A2C2E` | Every hairline |
| `foreground` | `#101112` | `#F2F2F0` | Primary ink |
| `primary` | Ink `#101112` | Paper `#F2F2F0` | **Actions.** A primary button is ink on paper, inverted in dark. There is no accent hue. |
| `destructive` | `#B3261E` | `#F2635B` | Failed publish, delete, disconnect |
| `success` | `#1F6D4A` | `#4CAF83` | Published, trend up |
| `warning` | `#8A5A00` | `#D9A44A` | Expiring token, missing media, trend down |
| `info` | `#2A4E6B` | `#7FA9C9` | Neutral notice only. Never decorative. |

Semantic colour is *not* an accent — it appears on state indicators, trend
arrows and error text, at small sizes, never as a surface fill.

### Platform colour

`platform-instagram | linkedin | facebook | x | youtube | threads`.

This is where all the hue in FlowPost lives. Allowed on: platform badges, the
cap or rail of a content card, the Flow Rail's travelling item, chart series,
account tiles. Never on page backgrounds, buttons or large fills. A screen
showing three networks shows exactly three colours.

## Typography

| Role | Family | Used for |
| --- | --- | --- |
| `font-display` | **Instrument Sans** 600/700, `tracking-[-0.02em]` | Page titles, section heads, big numerals, brand wordmark |
| `font-sans` | **Instrument Sans** 400/500 | All readable UI — body, labels, buttons, fields, captions |
| `font-lead` | **Instrument Serif** 400 | **One element only:** the Front Page lead headline on Today. Nowhere else, ever. |
| `font-mono` | **JetBrains Mono** 400/500 | Metadata via `.text-meta` — timestamps, counts, network names, publishing states |

Hierarchy is weight, size and tracking — not colour, not boxes. Scale:
lead headline `text-3xl`–`text-4xl` serif · page title `text-2xl` display ·
section head `text-sm` display uppercase · body `text-sm` · meta 11px mono.

User-written content (captions, post copy) is never set in display, serif or
mono. It is content, not chrome.

## Surfaces, spacing, elevation

- **Rules first.** Separate with `border-t`/`border-b` and space. A bordered
  rounded box is reserved for media plates and floating surfaces.
- 4px base. Page gutters `px-4 sm:px-6 lg:px-8`. Section rhythm `space-y-8`.
  Editorial layouts want more whitespace than a dashboard — use it.
- `--radius: 0.5rem`. Media plates `rounded-lg`, controls `rounded-md`,
  avatars and chips `rounded-full`.
- Elevation ladder: rule → `shadow-soft` (media plate on hover) →
  `shadow-elevated` (dialogs, sheets, drag). Nothing glows.

## Dark mode

Dark is neutral ink, not blue-black, and is authored beside light in
`index.css`. Every screen is checked in both. Contrast floor WCAG AA: 4.5:1
text, 3:1 for meaningful icons and borders. Because state is carried by colour
in places, every state also carries a word or a shape — never colour alone.
