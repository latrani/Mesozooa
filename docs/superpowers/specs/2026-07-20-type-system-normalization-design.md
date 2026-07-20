# Type System Normalization

**Date:** 2026-07-20
**Status:** Approved, ready for implementation
**Supersedes:** the type scale in `2026-07-13-mesozooa-visual-design.md` §2.2 (that section now
points here).

## Problem

The app's font sizing had three tangled issues, surfaced while unifying the chip component:

1. **The anchor bug (root cause).** `base.css` set `body { font-size: 24px }` with a comment
   "+50% base — spec §2.2 (locked)". But `rem` resolves against the **`html` root (16px)**, not
   `body`. So every `--type-*` token (all `rem`) rendered at ~⅔ its apparent intent — e.g.
   `--type-body: 1.05rem` = 16.8px, never the 25.2px a "24px base" implies. Measured: **nothing
   in the app actually renders at 24px** — every text element sets its size explicitly, so the
   `body` rule was dead code inherited by nothing. The "24px base / +50% / locked" claim was never
   implemented and was never actually agreed to.

2. **Near-duplicate sizes.** 12 distinct rendered sizes, several perceptually identical
   (16.8 vs 16; 14.72 vs 14.4; 12.48 appearing twice). Noise, not a scale.

3. **~10 hardcoded off-scale `rem` values** bypassing the tokens (chips, trail, paper slips,
   search, and four in the SVG tree).

## Decisions

- **Preserve the current look.** Current rendering is the source of truth; this is a
  consistency/correctness pass, not a resize. Every new value lands within ~1px of what it
  renders today.
- **Root stays at the browser default (16px); all sizes are `rem`.** This is the
  accessibility-correct state (honors the user's base-size preference; `px` at the root would
  pin it — confirmed anti-pattern per MDN / Josh Comeau / CSS-Tricks research). Delete the dead
  `body { 24px }`.
- **Author in `rem`, verify in `px`, never write `pt`.** `pt` lives only in the WCAG spec. We do
  the pt→px conversion once (below) to learn the "large text" floor, then express it as a `rem`
  constant so no per-value math recurs.
- **Single-decimal `rem`** (0.8, 0.9, 1.0, 1.2, 1.4, 2.0) — no binary/multi-decimal fractions.
- **Role-named tokens**, so "is this 14pt?" confusion never returns — the name states the job,
  not the size.

## WCAG anchor (the one load-bearing size)

Per WCAG SC 1.4.3, "large text" = **18pt regular OR 14pt bold**, and large text only needs a
**3:1** contrast ratio (vs 4.5:1 for normal). The spec's own conversion: `1pt = 1.333px`, so
**14pt bold = 18.66px**. At the standard 16px root:

- `1.1rem` = 17.6px → **below** 18.66 → fails (would need 4.5:1)
- `1.2rem` = 19.2px → **above** 18.66 → qualifies for 3:1 ✓

So **`--type-heading` = 1.2rem is the smallest single-decimal step that clears 14pt bold.** The
flooded guess/answer chips (bold white-on-warmth) rely on the 3:1 allowance across the 0–90%
warmth ramp. **Do not lower `--type-heading`** — it would break the chips' contrast budget.
(Holds at the standard root; a user with a smaller base could drop below, but WCAG measures the
delivered/default size, so we're compliant as authored.)

## The normalized scale

```
--type-display  2rem     32px    h1 / wordmark, solved answer name
--type-title    1.4rem   22.4px  paper slips, active trail crumb (handwritten / emphasis)
--type-heading  1.2rem   19.2px  region/specimen headings, modal + placard titles, chips, crumbs
                                  — WCAG-large floor (3:1); don't lower.
--type-body     1rem     16px    default body text (workhorse)
--type-label    0.9rem   14.4px  readable-small: field labels, tree tip labels, captions
--type-meta     0.8rem   12.8px  skim-past: image credits, clade counts, off-spine context
```

6 steps, down from 12 rendered sizes.

- `--type-heading` **absorbs the old `--type-h`** (was 1.25rem/20px → 1.2rem/19.2px, −0.8px) and the
  proposed "lead" step — a heading vs a chip is distinguished by weight/context, not a 0.8px gap.
- `--type-label` **merges** old 0.92 & 0.9.
- `--type-meta` **merges** old 0.82 & 0.78.
- `--type-eyebrow` **retired** — unused in the app (only gallery chrome referenced it); its
  identity is uppercase + letter-spacing, not a distinct size. Eyebrows use `--type-meta`.
- **label vs meta stay distinct** (~11%, perceptible at small sizes): label = small text still
  meant to be read as content; meta = incidental/provenance meant to be skimmed. Usually also
  color-differentiated (`--ink` vs `--ink-mute`); size reinforces the tier.

## Migration map

**`tokens.css`** — replace the 6-token scale with the new 6; remove `--type-eyebrow`. Fix the
misleading "base 24px, +50%" comment to state the truth (rem resolves against the 16px root).

**`base.css`** — delete `body { font-size: 24px }` (dead code). Repoint the `.eyebrow` utility to
`--type-meta`.

| File | Current | → New token | Δpx |
|---|---|---|---|
| Chip.svelte | `--type-label` (0.9rem) | `--type-heading` | **+4.8** (intended — chips to 14pt-bold WCAG size per user direction; the "preserve look / ~1px" rule does NOT apply to the chip) |
| WarmestTrail crumb | 1.2rem | `--type-heading` | 0 |
| WarmestTrail active | 1.35rem | `--type-title` | +0.8 |
| PaperSlip | 1.35rem | `--type-title` | +0.8 |
| SearchBox base | `--type-body` | (unchanged) | 0 |
| SearchBox narrow | 1.1rem | `--type-body` | −1.6 |
| SpineTree `.lbl` | 0.9rem | `--type-label` | 0 |
| SpineTree context | 0.82rem | `--type-meta` | −0.32 |
| SpineTree genus | 1rem | `--type-body` | 0 |
| SpineTree `.count` | 0.78rem | `--type-meta` | +0.32 |
| SpineTree zoom btns | 1rem | `--type-body` | 0 |
| all `--type-h` consumers (Modal, SpecimenPlacard, App, Gallery) | 1.25rem | `--type-heading` | −0.8 |

Largest moves: SearchBox narrow −1.6px (still comfortable) and old `--type-h` −0.8px
(imperceptible). All others sub-pixel or zero.

## SVG tree labels — layout-coupled, tokenized with a verify gate

`SpineTree.svelte`'s four `<text>` sizes feed layout math (`LABEL_BASELINE_DY`, `getBBox()`
box-fitting, warmth-ring alignment). They're tokenized per the map above (all within 0.32px of a
scale value, so geometry shifts are sub-pixel). **Verification gate:** after the edits, view the
tree in the gallery + live Explore and confirm the baseline math still lands (labels centered in
boxes, ring not clipping the count). If a label's box math breaks, fall back to leaving *that*
label as a documented off-scale exception; the rest still tokenize.

## Verification

1. `npx tsc --noEmit` + `npx svelte-check` clean (no test surface — pure CSS).
2. Gallery walk: type-scale panel, chips, trail, paper slips, search.
3. Live Daily + Explore: tree labels/geometry, headings, specimen placard, modals.
4. Spot-check `--type-heading` renders ≥ 19px (WCAG floor intact).

## Non-goals

- Not growing the app to a 24px base (the "preserve current look" decision). A future
  intentional-scale-up pass could set `html { font-size: 150% }` so `1rem = 24px = 18pt`, but
  that's a separate, deliberate visual change — out of scope here.
- Not touching `--fw-*` weights, `--font-*` families, or `--space-*` (already consistent /
  separate concern).
