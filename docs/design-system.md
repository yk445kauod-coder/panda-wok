# Panda Wok — design system

Short reference for the customer-facing UI. It documents what is actually in
`src/app/globals.css` and the components, so the next change starts from the
real tokens rather than inventing new ones.

## Principles

1. **Calm by default.** The brand is a cloud kitchen, not a theme park. Motion
   is decorative, never load-bearing: every animated element has a static final
   state that is correct on its own.
2. **One cook, one kitchen.** Warm rice-paper surfaces, ink text, plum and
   miso accents. No neon, no gradients used as a substitute for hierarchy.
3. **Arabic is first-class, not mirrored English.** Every string is translated
   and every layout uses logical properties so RTL works without a second
   stylesheet.
4. **Content is data.** Copy that staff might want to change lives in the
   database and falls back to the dictionary when the row is absent.

## Typography

| Role | Font | Where |
| --- | --- | --- |
| Display / headings | `--font-display` | `font-display` on section headings |
| Body | `--font-body` | inherited from `<body>` |
| Arabic display | `--font-arabic-display` (Noto Kufi Arabic) | applied when `lang="ar"` |
| Arabic body | `--font-arabic` (IBM Plex Sans Arabic) | applied when `lang="ar"` |

All four are loaded with `next/font/google` in `src/app/layout.tsx`, which
self-hosts them and removes a render-blocking request to Google.

Fluid sizes are defined once and used across pages, so headings scale without
breakpoint jumps:

- `.text-fluid-hero` — `clamp(2.25rem, 6vw + 0.5rem, 4.5rem)`
- `.text-fluid-h2` — `clamp(1.6rem, 3vw + 0.75rem, 2.6rem)`
- `.text-fluid-h3` — `clamp(1.25rem, 1.4vw + 0.9rem, 1.7rem)`

## Colour

Colours are Tailwind theme tokens (`--color-*`) mapped to semantic names, so a
component says what it means rather than which hue it is:

| Token family | Meaning |
| --- | --- |
| `rice-50…300` | Page and panel surfaces |
| `ink-700…900` | Text and rules |
| `plum-*` | Primary action, brand accent |
| `miso-*` | Focus rings, secondary highlight |
| `bamboo-*` | Success and nature accents |
| `chili-*` | Error and destructive |
| `jade-*` | Confirmation and status |

Prefer the semantic alias (`text-ink-900`, `bg-rice-50`) over a raw colour.

## Surfaces and elevation

- `.washi-panel` — the standard card: rice surface, hairline border, soft
  shadow. Use it for any grouped block (list rows, forms, empty states).
- `.shadow-washi` / `.shadow-washi-lg` — two elevation steps only.
- `.ink-rule` — the horizontal divider.

## Motion

Two utilities, both opt-in:

- `Reveal` (`src/components/ui/reveal.tsx`) fades and lifts children as they
  scroll into view. It renders `shown` on the server, so content is present and
  readable without JS; a layout effect demotes below-the-fold nodes to
  `pending` only when the user has not requested reduced motion. Use `as` for
  semantic elements and `delay` to stagger lists.
- `data-motion="decorative"` marks purely visual layers (hero ink washes). Such
  layers are hidden outright under `prefers-reduced-motion: reduce`.

Everything resolves to a static final state under reduced motion; there is a
global reduced-motion rule in `globals.css` that shortens all transitions.

## RTL

- `<html dir>` is set from the locale; Tailwind logical properties
  (`ms-`/`me-`, `ps-`/`pe-`, `start-`/`end-`, `text-end`) carry the layout.
- Directional icons flip with `rtl:rotate-180`.
- Never hardcode `left`/`right` in new components.

## Accessibility

- Status and error regions use `role="status"` / `role="alert"`.
- The assistant exposes a single labelled floating trigger; decorative sprites
  are `aria-hidden`.
- Focus rings come from the `miso` token and are never removed without a
  replacement.
