# Type System Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the app's 12 near-duplicate rendered font sizes into one role-named, single-decimal `rem` scale (6 tokens), remove the dead `body { 24px }` anchor, and pull every hardcoded off-scale size onto the scale — with zero intended visual change.

**Architecture:** A two-layer token system already exists (`src/lib/styles/tokens.css` primitives + component consumers). This pass rewrites the `--type-*` primitives, deletes dead base CSS, then repoints each hardcoded `rem` font-size to a token. The SVG tree labels are layout-coupled (`getBBox()` box-fitting), so they get a dedicated verification gate.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite. CSS custom properties. No test framework for CSS — validation is `npx tsc --noEmit`, `npx svelte-check`, and visual inspection via `/gallery.html` + live Daily/Explore (Playwright or manual).

## Global Constraints

- **Preserve the current look.** Current rendering is the source of truth; every new value must land within ~1px of what it renders today. This is a correctness/consistency pass, not a resize.
- **Root stays at the browser default (16px); all font sizes are `rem`.** Never set a `px` font-size on `html`/`:root`/`body`. `1rem = 16px` at standard zoom.
- **`--type-heading` = 1.2rem is a WCAG floor.** 1.2rem = 19.2px ≥ 14pt bold (18.66px) → qualifies for 3:1 large-text contrast, which the flooded chips depend on. NEVER lower it.
- **Single-decimal `rem` only** (0.8, 0.9, 1.0, 1.2, 1.4, 2.0). No binary or multi-decimal fractions.
- **`verbatimModuleSyntax` is ON** — not relevant here (no TS changes expected), but run `npx tsc --noEmit` regardless.
- **Delivery:** commit each task with a clear message; leave everything unpushed (the user pushes). Work on a branch, not `main`.
- **Working screenshots** go in the gitignored `screenshots/` folder and are cleared before committing.

## The normalized scale (target state of `tokens.css`)

```
--type-display  2rem     32px    h1 / wordmark, solved answer name
--type-title    1.4rem   22.4px  paper slips, active trail crumb
--type-heading  1.2rem   19.2px  headings, modal + placard titles, chips, crumbs  (WCAG-large floor)
--type-body     1rem     16px    default body text
--type-label    0.9rem   14.4px  field + node labels, captions
--type-meta     0.8rem   12.8px  credits, clade counts, off-spine context
```
(`--type-eyebrow` retired; `--type-h` renamed to `--type-heading`.)

---

## Task 1: Rewrite the `--type-*` tokens and delete the dead base

**Files:**
- Modify: `src/lib/styles/tokens.css` (the `--type-*` block, ~lines 95–101)
- Modify: `src/lib/styles/base.css` (`body` rule ~line 24; `.eyebrow` utility ~lines 60–63)

**Interfaces:**
- Produces: the token names `--type-display`, `--type-title`, `--type-heading`, `--type-body`, `--type-label`, `--type-meta`. Note `--type-h` is RENAMED to `--type-heading` and `--type-eyebrow` is REMOVED — later tasks repoint every consumer. After this task the app will briefly have broken references (old `--type-h`/`--type-eyebrow` resolve to nothing) until Tasks 2–6 land; that's expected and why this is a branch.

- [ ] **Step 1: Rewrite the type scale in `tokens.css`**

Replace the existing block (currently):
```css
  /* TYPE — base 24px, +50% scale (spec §2.2) */
  --type-display: 2rem;
  --type-h: 1.25rem;
  --type-body: 1.05rem;
  --type-label: 0.92rem;
  --type-meta: 0.78rem;
  --type-eyebrow: 0.72rem;
```
with:
```css
  /* TYPE — role-named scale, single-decimal rem. rem resolves against the 16px browser-default
     root (NOT a 24px base — that earlier claim was never implemented). Sizes are the delivered
     px at standard zoom. Normalized 2026-07-20; see specs/2026-07-20-type-system-normalization-design.md */
  --type-display: 2rem;     /* 32px   — h1 / wordmark, solved answer name */
  --type-title: 1.4rem;     /* 22.4px — paper slips, active trail crumb */
  --type-heading: 1.2rem;   /* 19.2px — headings, modal/placard titles, chips, crumbs.
                               WCAG-large floor: >= 14pt bold (18.66px) -> 3:1. DON'T lower — flooded chips depend on it. */
  --type-body: 1rem;        /* 16px   — default body text */
  --type-label: 0.9rem;     /* 14.4px — field + node labels, captions */
  --type-meta: 0.8rem;      /* 12.8px — credits, clade counts, off-spine context */
```

- [ ] **Step 2: Delete the dead 24px base in `base.css`**

In the `body { … }` rule, delete this line entirely:
```css
  font-size: 24px;            /* +50% base — spec §2.2 (locked) */
```
(Leave the rest of the `body` rule — `margin`, `color`, `font-family`, `line-height`, `font-variant-numeric`, font-smoothing — untouched. `body` now inherits the 16px root, which is what rem already assumed, so nothing that sets its own size changes.)

- [ ] **Step 3: Repoint the `.eyebrow` utility off the retired token**

In `base.css`, the `.eyebrow` rule currently reads:
```css
.eyebrow {
  font-size: var(--type-eyebrow); font-weight: var(--fw-bold);
  letter-spacing: .16em; text-transform: uppercase; color: var(--ink-mute);
}
```
Change `var(--type-eyebrow)` → `var(--type-meta)`:
```css
.eyebrow {
  font-size: var(--type-meta); font-weight: var(--fw-bold);
  letter-spacing: .16em; text-transform: uppercase; color: var(--ink-mute);
}
```

- [ ] **Step 4: Verify no source references the removed/renamed tokens**

Run: `rg -n 'type-h\b|type-eyebrow' src/`
Expected: matches ONLY in consumers we fix in later tasks — specifically `--type-h` in `Modal.svelte`, `SpecimenPlacard.svelte`, `App.svelte`, `Gallery.svelte`, and `--type-eyebrow`/`type-eyebrow` in `Gallery.svelte`. No matches in `tokens.css` or `base.css`. (This confirms Task 1 is self-consistent; the listed consumers are repointed in Tasks 2–6.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean (no output). CSS var changes don't affect TS, but this confirms nothing else broke.

- [ ] **Step 6: Commit**

```bash
git add src/lib/styles/tokens.css src/lib/styles/base.css
git commit -m "refactor(type): normalize --type-* scale; drop dead 24px base

Role-named single-decimal rem scale (6 tokens, was 6 but numbered as a real
scale now); --type-h -> --type-heading, --type-eyebrow retired. Delete the
body{font-size:24px} that nothing inherited (rem resolves against the 16px
root). Consumers repointed in follow-up commits."
```

---

## Task 2: Repoint the chip + trail + paper-slip components

**Files:**
- Modify: `src/lib/game/components/Chip.svelte:62` (`.chip` font-size)
- Modify: `src/lib/game/components/WarmestTrail.svelte:59` (`.crumb` narrow) and `:61` (`.crumb.active`)
- Modify: `src/lib/game/components/PaperSlip.svelte:19` (`.slip` font-size)

**Interfaces:**
- Consumes: `--type-heading` (1.2rem), `--type-title` (1.4rem) from Task 1.
- Produces: nothing new; these are leaf consumers.

- [ ] **Step 1: Chip → `--type-heading`**

In `Chip.svelte`, the `.chip` rule currently has:
```css
    font-size: 1.2rem; font-weight: var(--fw-regular);  /* ~14pt (19.2px) — the prominent chip size */
```
Change to:
```css
    font-size: var(--type-heading); font-weight: var(--fw-regular);  /* WCAG-large floor; see tokens.css */
```
(1.2rem === `--type-heading`; zero px change.)

- [ ] **Step 2: WarmestTrail crumb → `--type-heading`, active → `--type-title`**

In `WarmestTrail.svelte`, the narrow `.crumb` rule (~line 59) has `font-size: 1.2rem;` → change to `font-size: var(--type-heading);`.
The `.crumb.active` rule (~line 61) has `font-size: 1.35rem;` → change to `font-size: var(--type-title);` (+0.8px, intended merge).

- [ ] **Step 3: PaperSlip → `--type-title`**

In `PaperSlip.svelte:19`, `font-size: 1.35rem;` → `font-size: var(--type-title);` (+0.8px).

- [ ] **Step 4: Verify + typecheck**

Run: `rg -n 'font-size: 1\.(2|35)rem' src/lib/game/components/Chip.svelte src/lib/game/components/WarmestTrail.svelte src/lib/game/components/PaperSlip.svelte`
Expected: no matches (all three files' hardcoded values are now tokens).
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/Chip.svelte src/lib/game/components/WarmestTrail.svelte src/lib/game/components/PaperSlip.svelte
git commit -m "refactor(type): chips, trail crumbs, paper slips onto --type-heading/--type-title"
```

---

## Task 3: Repoint the `--type-h` consumers to `--type-heading`

**Files:**
- Modify: `src/lib/components/Modal.svelte:76` (`.modal-head h2`)
- Modify: `src/lib/game/components/SpecimenPlacard.svelte:58` (`.title`)
- Modify: `src/App.svelte` (any `--type-h` reference — verify via grep in Step 1)

**Interfaces:**
- Consumes: `--type-heading` from Task 1.

- [ ] **Step 1: Find every `--type-h` consumer**

Run: `rg -n 'var\(--type-h\)' src/`
Expected matches: `Modal.svelte:76`, `SpecimenPlacard.svelte:58`, and possibly `App.svelte`/`Gallery.svelte`. (Gallery is Task 6; App is handled here if present.) Note the exact list before editing.

- [ ] **Step 2: Replace `var(--type-h)` → `var(--type-heading)` in each app consumer**

For `Modal.svelte:76`, `SpecimenPlacard.svelte:58`, and any `App.svelte` hit: change `var(--type-h)` to `var(--type-heading)`. (1.25rem → 1.2rem, −0.8px, imperceptible; this merges the old heading step into the unified one.)

Do NOT edit `Gallery.svelte` here — it's Task 6.

- [ ] **Step 3: Verify + typecheck**

Run: `rg -n 'var\(--type-h\)' src/ | rg -v gallery`
Expected: no matches outside the gallery.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/Modal.svelte src/lib/game/components/SpecimenPlacard.svelte src/App.svelte
git commit -m "refactor(type): --type-h consumers -> --type-heading (headings, modal + placard titles)"
```

---

## Task 4: Repoint SearchBox

**Files:**
- Modify: `src/lib/game/components/SearchBox.svelte:63` (narrow-media `.searchbox input`)

**Interfaces:**
- Consumes: `--type-body` from Task 1. (SearchBox base at `:38`/`:59` already uses `var(--type-body)` — leave it.)

- [ ] **Step 1: Narrow SearchBox input → `--type-body`**

In `SearchBox.svelte:63`, the narrow media query has:
```css
    .searchbox input { font-size: 1.1rem; padding: var(--space-3) var(--space-4); }
```
Change `font-size: 1.1rem` → `font-size: var(--type-body)`:
```css
    .searchbox input { font-size: var(--type-body); padding: var(--space-3) var(--space-4); }
```
(1.1rem → 1rem, −1.6px — the largest single move; still comfortable at 16px. Verify visually in Task 7.)

- [ ] **Step 2: Verify + typecheck**

Run: `rg -n 'font-size: 1\.1rem' src/lib/game/components/SearchBox.svelte`
Expected: no matches.
Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/SearchBox.svelte
git commit -m "refactor(type): narrow SearchBox input onto --type-body"
```

---

## Task 5: Repoint the SVG tree labels (layout-coupled — verify gate)

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte` — `.lbl` (:492), `.node:not(.spine) .lbl` (:493), `.node.genus .lbl` (:494), `.count` (:503), and the zoom-button font-size (:530)

**Interfaces:**
- Consumes: `--type-label` (0.9rem), `--type-meta` (0.8rem), `--type-body` (1rem) from Task 1.

**Why this task is isolated:** these `<text>` sizes feed `LABEL_BASELINE_DY` and `getBBox()` box-fitting + warmth-ring alignment. All are within 0.32px of a scale value (sub-pixel geometry shift), but the render must be visually confirmed (Step 6) before trusting it.

- [ ] **Step 1: `.lbl` → `--type-label`**

`SpineTree.svelte:492`: `font-size: 0.9rem;` → `font-size: var(--type-label);` (0.9rem === label; 0 change).

- [ ] **Step 2: context label → `--type-meta`**

`:493` `.node:not(.spine) .lbl`: `font-size: 0.82rem;` → `font-size: var(--type-meta);` (−0.32px).

- [ ] **Step 3: genus label → `--type-body`**

`:494` `.node.genus .lbl`: `font-size: 1rem;` → `font-size: var(--type-body);` (1rem === body; 0 change).

- [ ] **Step 4: `.count` → `--type-meta`, zoom buttons → `--type-body`**

`:503` `.count`: `font-size: 0.78rem;` → `font-size: var(--type-meta);` (+0.32px).
`:530` zoom button (`font-size: 1rem;` on the −/⌂/+ controls): → `font-size: var(--type-body);` (0 change).

- [ ] **Step 5: Verify no raw rem font-sizes remain in the file + typecheck**

Run: `rg -n 'font-size: [0-9]' src/lib/game/components/SpineTree.svelte`
Expected: no matches (every font-size is now a token).
Run: `npx svelte-check --threshold error`
Expected: `0 ERRORS`.

- [ ] **Step 6: VISUAL VERIFY GATE — inspect the tree geometry**

Start the dev server if not running (`npm run dev`), then load `/gallery.html` and the live Explore tab. Confirm:
- Tree labels are still vertically centered in their rounded boxes (no baseline drift).
- The warmth ring around a node still fully encloses the label + count (not clipped/short).
- Genus vs clade vs context labels still read at their intended relative sizes.

If any label's box math visibly breaks, revert THAT ONE label's line back to its original hardcoded rem and add a comment: `/* off-scale: layout-coupled, see plan Task 5 */`. Then re-verify. (Fallback documented in the design doc §"SVG tree labels".)

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "refactor(type): SpineTree SVG labels onto --type-label/-meta/-body

Layout-coupled (getBBox box-fitting); shifts are sub-pixel and the tree
geometry was visually verified in the gallery + live Explore."
```

---

## Task 6: Repoint the gallery harness

**Files:**
- Modify: `src/gallery/Gallery.svelte` — the type-scale demo list (~line 60), `.eyebrow` usages are fine (they use the class, fixed in Task 1), and `.ramp-pct` (:264, uses `--type-eyebrow`), plus any `var(--type-h)` (:243/:247 use `--type-h`)

**Interfaces:**
- Consumes: the new token names. Gallery is a dev-only harness (not shipped), so exact sizes don't matter — just remove dangling references to retired/renamed tokens.

- [ ] **Step 1: Find dangling token refs in the gallery**

Run: `rg -n 'type-h\b|type-eyebrow' src/gallery/Gallery.svelte`
Expected: the type-scale demo array (~line 60, lists `["--type-eyebrow", "Eyebrow 0.72rem"]`), `.ramp-pct` (:264 `var(--type-eyebrow)`), and `section > h2` / `.g-head h1` (:243/:247 `var(--type-h)`).

- [ ] **Step 2: Update the type-scale demo array**

In the `const` array of `[token, label]` pairs (~line 60), replace the old scale entries with the new tokens so the gallery's "Type scale" panel documents reality:
```js
    ["--type-display", "Display 2rem / 32px"],
    ["--type-title", "Title 1.4rem / 22.4px"],
    ["--type-heading", "Heading 1.2rem / 19.2px"],
    ["--type-body", "Body 1rem / 16px"],
    ["--type-label", "Label 0.9rem / 14.4px"],
    ["--type-meta", "Meta 0.8rem / 12.8px"],
```
(Remove the old `--type-h` and `--type-eyebrow` rows; match the existing array's exact syntax/indentation.)

- [ ] **Step 3: Repoint gallery CSS refs**

`.ramp-pct` (:264): `var(--type-eyebrow)` → `var(--type-meta)`.
`section > h2` (:247) and `.g-head h1` (:243): `var(--type-h)` → `var(--type-heading)`.

- [ ] **Step 4: Verify NO dangling refs anywhere + build**

Run: `rg -n 'type-h\b|type-eyebrow' src/`
Expected: **no matches anywhere.**
Run: `npx svelte-check --threshold error`
Expected: `0 ERRORS`.

- [ ] **Step 5: Commit**

```bash
git add src/gallery/Gallery.svelte
git commit -m "refactor(type): update gallery type-scale panel + refs to normalized tokens"
```

---

## Task 7: Full visual verification pass

**Files:** none (verification only).

**Interfaces:** consumes the finished state of all prior tasks.

- [ ] **Step 1: Typecheck + build clean**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: clean, `0 ERRORS`.

- [ ] **Step 2: Gallery walk**

Load `/gallery.html`. Confirm each region reads correctly and nothing reflowed badly:
- Type-scale panel shows the 6 new tokens at their stated sizes.
- Chips (guess/hint/answer/crumb) — all the same 19.2px pill footprint, hints italic/light, guess/answer flooded.
- WarmestTrail (crumbs + active).
- Paper slips (specimen "coming soon"/missing).
- Modal & sharing (How-to-play spacing, share preview).

- [ ] **Step 3: Live Daily + Practice**

`npm run dev`, open the Daily tab. Confirm: header wordmark, "Moves remaining", guess list chips, specimen placard title/fields/credit, hint chips, end-state answer chip + glow. Play a few guesses to populate the list.

- [ ] **Step 4: Live Explore**

Explore tab. Confirm: search box (type a taxon — check the narrow input size on a resized window), recent crumbs, tree labels/geometry (the Task 5 gate again, in context), specimen placard.

- [ ] **Step 5: WCAG floor spot-check**

In devtools, inspect a guess chip's computed `font-size`. Expected: ≥ 19px (confirms `--type-heading` still clears the 14pt-bold large-text floor).

- [ ] **Step 6: Clean up + final note**

Remove any screenshots from `screenshots/` (or repo root) created during verification. No commit needed unless verification surfaced a fix — in which case commit it with a descriptive message.

---

## Self-Review Notes

- **Spec coverage:** anchor cleanup (Task 1), scale rewrite (Task 1), all ~10 hardcoded values (Tasks 2/4/5), `--type-h` merge (Task 3), eyebrow retirement (Tasks 1 + 6), SVG verify gate (Task 5 Step 6 + Task 7 Step 4), WCAG floor guard (Task 1 comment + Task 7 Step 5). All design-doc sections mapped.
- **No test framework:** intentional — CLAUDE.md validates Svelte via build + running; "tests" here are `tsc`/`svelte-check`/visual, stated explicitly per step.
- **Ordering:** Task 1 intentionally leaves dangling refs until Tasks 2–6 land; called out in Task 1 Interfaces. Safe because it's a branch and each task typechecks (dangling CSS vars resolve to `initial`, not a build error — svelte-check stays green; the fix is completeness, verified by the Task 6 Step 4 global grep).
