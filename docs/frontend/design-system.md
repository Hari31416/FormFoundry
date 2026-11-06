# Design System — "Administrative Dossier"

FormFoundry's interface follows an **administrative dossier** aesthetic: warm paper ground, deep pine ink, marigold accent, and IBM Plex typography. It is intentionally not a generic SaaS look; the app should read like a precise, official document room — appropriate for government case intake.

## Type

Self-hosted (vendored in `src/assets/fonts/`, no CDN dependency), chosen for a multilingual app:

- **Display / headings:** IBM Plex Serif (`font-serif`), weights 500–700.
- **Body:** IBM Plex Sans (`font-sans`), weights 400–700. Devanagari covered by IBM Plex Sans Devanagari; Tamil/Telugu by Noto Sans Tamil/Telugu.
- **Data / micro-labels:** IBM Plex Mono (`font-mono`), weights 400–600 — used for case IDs, field paths, artifact codes, percentages, timestamps, and uppercase micro-labels.
- **Indic scripts:** Devanagari headings fall back to Noto Serif Devanagari; Tamil/Telugu headings to Noto Serif Tamil/Telugu. `unicode-range` is set on all Indic `@font-face` blocks so Latin pages never download Indic fonts.

## Colour tokens

Defined in `src/index.css` as CSS custom properties and exposed via `@theme inline`:

| Token                              | Value                             | Use                                  |
| ---------------------------------- | --------------------------------- | ------------------------------------ |
| `paper`                            | `#f4f2ea`                         | App ground (dot-grid texture)        |
| `card-warm`                        | `#fdfdfa`                         | Card surfaces                        |
| `ink` / `ink-soft` / `ink-faint`   | `#1f2a28` / `#46534f` / `#7d8880` | Text hierarchy                       |
| `line` / `line-strong`             | `#e0ded0` / `#cfccc0`             | Hairline dividers                    |
| `pine` / `pine-deep` / `pine-soft` | `#123f33` / `#0c2b23` / `#e4ece6` | Primary brand, solid CTAs, mastheads |
| `marigold` (`-bright` / `-soft`)   | `#b45309` / `#d97706` / `#f7ead1` | Awaiting/attention accent            |
| `leaf` / `leaf-soft`               | `#2f6f4f` / `#e2ece2`             | Confirmed / approved                 |
| `terracotta` / `terracotta-soft`   | `#b3412f` / `#f6e2dc`             | Destructive / blocking               |
| `inkblue` / `inkblue-soft`         | `#1d4e6b` / `#e1e9ee`             | Proposed / in-progress               |

Semantic status mapping: **proposed → inkblue**, **confirmed/approved → leaf**, **awaiting/needs attention → marigold**, **missing/neutral → ink-faint**, **rejected/blocking → terracotta**.

## Rules

- Radii: `rounded-md` / `rounded-lg`. `rounded-full` only for status dots and avatars.
- Micro-labels floor at **11px**. `10px` is reserved for ASCII mono IDs. Never track or uppercase Devanagari/Tamil/Telugu text (`html:lang(hi|ta|te)` rules neutralize `letter-spacing`/`text-transform`; mono falls back to Plex Sans under Indic langs).
- Semantic hues (pine/marigold/leaf/terracotta/inkblue) are reserved for status and actions — never for decoration. Domain tiles, cards, and chrome are neutral pine.
- Primary approval CTA is always solid `leaf`. Reject is terracotta ghost. Required markers are neutral, not terracotta.
- Headings use `font-serif`; section eyebrows are `font-mono text-[9–10px] uppercase tracking-[0.16em–0.22em] text-ink-faint`.
- Weights: prefer `font-semibold`/`font-bold` over `font-black` (Plex is already heavy).
- Cards: `.card-ledger` (warm white + hairline border + soft shadow). Page ground: solid `bg-paper`.
- Primary action: solid `bg-pine text-primary-foreground` (hover `bg-pine-deep`). On the dark pine masthead, the primary action inverts to `bg-primary-foreground text-pine-deep`.
- Tabular numerals / codes use `font-mono`.
- Focus visibility: global `:focus-visible` pine outline — do not remove.
- Dark mode tokens exist (`.dark`) but the app does not currently ship a theme toggle.

## Per-screen notes

- **Intake Hub masthead:** pine-deep bar (case workspace) / paper bar with serif wordmark (home). View toggles are segmented controls; status is a mono chip.
- **Template cards:** ledger-style — neutral pine icon tile, serif title, mono artifact/meta chips, recent cases as divider rows with a status dot (no nested cards).
- **Case workspace (chat):** assistant messages are memo-style cards; the active question card carries a marigold left border; user bubble is solid pine; TTS player is a paper chip. No ambient pulse/bounce animations — only pending spinners may animate.
- **Case workspace (detailed / verification):** field rows are tight ledger rows — leaf left border when confirmed, certainty meter as a single-hue inkblue ramp on a paper track, terracotta blockers; source provenance is collapsed by default behind a toggle; right rail is the "Intake Intelligence" panel with a pine AI tile.
- **Template builder:** drafting-console chrome — ledger underline tabs with mono labels, per-section icon tiles, `pine-deep` JSON editor.
- **Reduce shouting:** no gradients-on-text, no drop shadows except subtle ledger elevation, no indigo/slate defaults.
