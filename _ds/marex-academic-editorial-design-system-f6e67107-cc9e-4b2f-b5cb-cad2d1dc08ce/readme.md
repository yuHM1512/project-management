# Marex Academic Editorial — Design System

> _The Digital Curator._ A corporate e-learning surface treated like a
> premium publication. Tonal architecture, editorial typography,
> architectural breathing room — and the rare 1px line.

---

## What this is

Marex Academy is an LMS that refuses to look like one. Where most
e-learning products lean on data-dump dashboards and gridded card decks,
this system uses **tonal layering**, **extreme whitespace**, and a
**sophisticated type ramp** to coach a learner into a state of focused
calm.

The "Creative North Star" is the editorial curator: instead of teaching
through volume, teach through pacing.

### Sources

- `/projects/.../design/DESIGN.md` (attached) — the canonical spec,
  authored as *"The Academic Editorial — Golden Idea."* All colors,
  type, spacing, radii, and component rules in this system trace back
  to that document.
- No codebase, Figma, or asset library was attached beyond the spec.
  Logos, icons, and imagery are originals built to the brief
  (`assets/`). Fonts are loaded from Google Fonts. If you have
  licensed Manrope/Inter binaries, drop them in `assets/fonts/` and
  swap the `@font-face` `src:` in `tokens/fonts.css`.

---

## Index

```
styles.css                         entry stylesheet — only @imports
tokens/
  fonts.css                        Google Fonts @import (Manrope + Inter + JBM)
  colors.css                       surfaces, primary, secondary, semantic, gradients
  typography.css                   font families + type ramp + .t-* utilities
  spacing.css                      space scale + intent-named gaps
  radii.css                        xs / sm / md / lg / xl / pill
  elevation.css                    cloud shadows + focus ring tokens
  motion.css                       durations + easings
  base.css                         reset + global element defaults
assets/
  logo-marex.svg                   wordmark with stacked-layer mark
  mark-marex.svg                   square mark
  hero-gradient.svg                hero-pane background
components/
  core/      Button, IconButton, Card, Badge, Avatar
  forms/     Input, Switch, Checkbox
  feedback/  ProgressBar
  navigation/Tabs
  learning/  CourseCard, ProgressFloat, KnowledgeCheck
ui_kits/
  academy/   Click-through LMS prototype (sign-in → browse → course → lesson)
guidelines/
  cards/     13 foundation specimen cards (rendered in the Design System tab)
SKILL.md                            Agent-Skill manifest (cross-compat with Claude Code)
```

---

## Content fundamentals

The Marex voice is **quiet, deliberate, editorial**. The reader is
addressed directly, but the tone is curatorial — closer to a magazine's
masthead voice than a SaaS dashboard.

- **POV.** Second-person ("Pick up where you left off"), occasional
  first-person plural in editorial copy ("We treat content like a
  publication"). Never marketing-speak; never "Get started in
  seconds."
- **Casing.** Sentence case for everything — headlines, buttons, nav,
  labels. Title case is reserved for proper nouns (Module, Path,
  Certificate) and trademark-style product names.
- **Sentence length.** Short. A 12-word headline is too long; cut.
  Long-form body copy is welcome, but it earns its length by *reading
  like an essay*, not by listing features.
- **Numerals.** Spell out one through nine in prose. Use digits in UI
  ("3 of 12 modules", "42 min"). Always pair with a unit; never
  "42 m."
- **Eyebrows + headlines.** Almost every section opens with an
  all-caps overline (`Issue 47 · Spring`, `Module 03 — Foundations`)
  in `Inter 600/11/0.16em`, set against a much larger Manrope
  headline. The eyebrow is editorial signage, not branding.
- **Buttons.** Verb-first, no period. "Continue lesson", "Resume from
  Module 03", "Request access". Avoid "Click here" and avoid emoji.
- **Emoji.** Not used. Anywhere. Iconography is line-art SVG.
- **Em-dashes** are welcome and on-brand; en-dashes for ranges.
- **Hyphens and the Oxford comma** are both used.

**Examples that pass.**

> _Welcome back to focused calm._
>
> _Twelve new modules dropped this week. Your queue is waiting where
> you left it._

> _Learning, treated like a publication._
>
> _Curated paths for product teams who care about craft. New issue
> every Tuesday._

**Examples that fail.**

> ~~Unlock your full potential with our world-class learning platform!~~
>
> ~~Get started in just 60 seconds 🚀~~
>
> ~~Click here to begin your journey~~

---

## Visual foundations

### Colors

A high-trust, low-volume palette of **professional blues** sitting on a
**warm-cool neutral grey** canvas (`surface: #f8f9fa`). The primary
brand color is `#002b73` — deep, navy, near-corporate — paired with a
slightly brighter `#0056d2` for accents. The two are nearly always
combined into the **signature 135° gradient** which is used for primary
CTAs, hero backgrounds, progress fills, and any moment of true brand
emphasis.

Three small accent families surround the blues:

- **Secondary** (`#9cb4fe` container) — used for *success* and
  *knowledge-check correct* states. Soft, encouraging.
- **Tertiary** (`#822803` container with `#ffdbd0` fixed) — warm clay.
  Used sparingly, mostly for editorial decoration; never for status.
- **Error** (`#ffdad6` container) — soft coral. Never the harsh red.

### Typography

**Manrope** (display, 400–800) paired with **Inter** (body/UI, 400–700)
and **JetBrains Mono** for numerics and tokens. Headlines are tight
(letter-spacing `-0.02em`); body copy is loose (line-height `1.6`).

The ramp is generous: Display LG is 56px. Below 22px, switch to Inter
for legibility.

### Backgrounds, imagery, and motifs

- **No background imagery** in the literal sense — no photography, no
  hand-drawn illustrations, no repeating textures.
- The signature "image" is the **primary gradient** itself, used as a
  full-bleed surface for sign-in, course covers, and section heroes.
- A radial highlight (`radial-gradient(ellipse at 25% 90%, …b2c5ff…)`)
  is overlaid on the gradient for warmth and depth.
- **No emoji.** **No drop-shadows on cards.** Both are anti-patterns.

### Animation

Calm, deliberate, editorial pacing. No springs, no bounces.

- Durations: `120ms` (fast), `200ms` (base), `320ms` (slow),
  `500ms` (page).
- The signature ease is `--ease-editorial: cubic-bezier(0.16, 1, 0.3, 1)` —
  a gentle decel that "settles" rather than overshoots.
- Hover-in is faster than hover-out (don't make the UI flinch).
- No infinite-loop decorations.

### Hover, press, and focus

- **Primary buttons** brighten 6% on hover (`filter: brightness(1.06)`)
  and translate 0.5px down on press. No color shift.
- **Tertiary buttons** reveal a `surface-container-low` pill on hover.
- **Ghost buttons** step from `low` → `container` on hover.
- **Focus** is a 1px primary ghost ring at 30% opacity + a 4px outer
  glow at 10%. Never a bright outline.
- Press shrink is `transform: translateY(0.5px)`, never a `scale`.

### Borders, dividers, and the No-Line Rule

**Designers are prohibited from using 1px solid borders for sectioning
or layout containment.** Boundaries are defined by background color
shifts ("tonal architecture"). The edge *is* the color change.

Narrow exceptions:

1. **Inputs.** When focused, a primary ghost border at 30% opacity
   (and 10% outer glow) tells the user where the field is.
2. **Tabs.** The underline indicator is functional, not decorative.

Otherwise: use surface tiers (`surface` → `surface-container-low` →
`surface-container-lowest`).

### Shadows

Reserved for truly floating elements (modals, popovers, the signature
Progress Float). The "cloud shadow" formula is a 5%-opacity tint of
`on_surface`, blurred wide: `0px 20px 40px rgba(25, 28, 29, 0.05)`. No
black shadows. No layered drop shadows.

### Transparency and blur

Glassmorphism is the **only** acceptable form of overlay. Used for:

- The top navigation (semi-transparent `surface` @ 92% + 24px blur).
- The Progress Float (signature glassmorphic lesson chrome).
- Hover overlays on hero gradient.

Outside those three patterns, prefer opaque surfaces.

### Radii

Stick to `md` (12px) for buttons and most cards. `lg` (16px) for
content cards and modules. `xl` (24px) for hero panels. `pill` for
avatars, progress tracks, badges, and "info" chips. No sharp 0px
corners.

### Layout rules

- Major sections breathe at `--space-16` (5.5rem) of vertical rhythm.
- Reading content caps at `72ch`; product chrome at `1200px`.
- Use **asymmetric padding**: align headlines to the left, but place
  metadata in staggered, non-traditional positions (top-right of hero,
  bottom-right of footer).
- **No center-aligned bodies of text.** Center alignment is reserved
  for hero CTAs and sign-in.

### Cards

`surface-container-lowest` body, optional `surface-variant` footer
strip. Radius `lg`. No border, no shadow at rest. On hover, lift
0.5–2px with `cloud-md`. No "rounded corners + left-border accent
color" cards — that's an anti-pattern.

---

## Iconography

No icon font, sprite, or asset library was shipped with the source
spec. The system uses **inline SVG line-art icons** drawn at a
**2px stroke, round caps, round joins** — matching Lucide's defaults.

When you need an icon:

- Use Lucide via CDN: `<script src="https://unpkg.com/lucide@latest"></script>`
  then `lucide.createIcons()`. Lucide's stroke geometry matches the
  brand and ships ~1,500 glyphs.
- Or write inline SVG with `stroke-width="2"` `stroke-linecap="round"`
  `stroke-linejoin="round"`, viewBox `0 0 24 24`. Inputs should size
  to 16–18px; standalone icons 20–24px.
- Color icons via `stroke: currentColor`. Never fill.

**Flagged substitution:** Lucide is the closest match for the
unspecified icon system in the brand. Confirm with the brand owner
before shipping.

**Emoji:** never used as iconography.

**Unicode characters:** the **·** middot is the brand's preferred
separator between metadata items. The **—** em-dash separates eyebrows
from titles. Avoid arrows; use SVG line-art instead.

**Imagery / illustrations:** none required by the brand. Course covers
are built from the gradient palette (see `BrowseScreen.jsx` for
examples). If real photography is added later, treat it as cool-toned,
high-contrast, with a `mix-blend-mode: multiply` blue overlay so it
slots into the gradient family.

---

## Components

| Component       | Group       | Notes                                                            |
|-----------------|-------------|------------------------------------------------------------------|
| `Button`        | core        | Gradient primary; soft secondary; ghost; tertiary text; danger.  |
| `IconButton`    | core        | Square with required `ariaLabel`. Has a `glass` variant.         |
| `Card`          | core        | Tone-shift surface. `tone="raised" \| "flat" \| "sunken" \| "glass"`. |
| `Badge`         | core        | Soft pills; supports `dot`. Six variants.                        |
| `Avatar`        | core        | Photo or initials. Three tones.                                  |
| `Input`         | forms       | Surface fill, primary ghost-border on focus.                     |
| `Switch`        | forms       | Pill toggle, gradient when on.                                   |
| `Checkbox`      | forms       | Soft fill; primary container when checked.                       |
| `ProgressBar`   | feedback    | Pill track + gradient fill.                                      |
| `Tabs`          | navigation  | Underline with gradient indicator + optional count.              |
| `CourseCard`    | learning    | Workhorse content tile.                                          |
| `ProgressFloat` | learning    | **Signature.** Glassmorphic sticky lesson chrome.                |
| `KnowledgeCheck`| learning    | Soft-state quiz block.                                           |

---

## UI kits

- **`ui_kits/academy/`** — Marex Academy LMS. Click-through prototype
  with sign-in → browse → course detail → lesson. Open `index.html`.
  Toggle `signedIn` in `index.html` to land on the editorial sign-in
  pane.

---

## Starting points

Starting points indexed for the consuming-project picker:

- **Buttons** — `components/core/Button.d.ts`
- **Surfaces** — `components/core/Card.d.ts`
- **Forms** — `components/forms/Input.d.ts`
- **Learning · CourseCard** — `components/learning/CourseCard.d.ts`
- **Learning · KnowledgeCheck** — `components/learning/KnowledgeCheck.d.ts`
- **LMS** — `ui_kits/academy/index.html`

---

## Do / Don't (quick reference)

| ✅ Do                                                        | ❌ Don't                                              |
|--------------------------------------------------------------|-------------------------------------------------------|
| Use `surface-container-*` tiers to separate content.         | Draw 1px borders between sections.                    |
| Use the primary gradient for true brand emphasis.            | Use flat `#0056d2` blocks as backgrounds.             |
| Use Manrope for headlines, Inter for body.                   | Mix font families within a single hierarchy level.    |
| Use asymmetric padding and staggered metadata.               | Center large blocks of editorial copy.                |
| Pair eyebrow + headline + body in that order.                | Open a section with a bare headline.                  |
| Spell colors in `oklch()` or token names.                    | Hard-code raw hex outside `tokens/colors.css`.        |
| Use cloud shadows on floating elements only.                 | Add drop shadows to cards at rest.                    |
| Use emoji-free, sentence-case copy.                          | Use emoji for status (use `Badge dot` instead).       |
