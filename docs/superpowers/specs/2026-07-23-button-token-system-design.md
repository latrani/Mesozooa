# Mesozooa — Button token system (opaque surface+ink pairs)

*Design for #64: map controls disappear on hover over the placard.*
Date: 2026-07-23

Fixes the map-control hover-invisibility bug (#64) by replacing the ghost secondary-button
model — whose visibility depended on whatever was painted behind it — with a real, self-contained
button token system. Scope is deliberately broad: the user wants the button styling brought in
line with an actual design system, not a symptom patch.

## 1. Root cause (verified)

Two compounding defects:

1. **`.btn-secondary` is applied to a container.** `SpineTree.svelte`'s `.zoom-controls` div
   carries `class="zoom-controls btn-secondary"` and wraps the three zoom buttons. Hovering *any*
   child button also hovers the container, firing `.btn-secondary:hover`, which **replaces the
   container's opaque `background: var(--bg-surface)` with `color-mix(ink 12%, transparent)`**.
   Over the tall specimen placard, that translucent tint lets the dark terracotta show through and
   the dark mahogany ink goes dark-on-dark → invisible (still clickable). This is the #64 symptom.

2. **Ghost fill borrows the ground.** `.btn-secondary` is `background: transparent` + colored
   border/text via `--btn-secondary-ink`, and hover mixes ink into `transparent`. The button is
   only visible because the surface behind it happens to be painted correctly; on dark grounds it
   is re-pointed to cream by ad-hoc `--btn-secondary-ink: var(--cream)` overrides. This is
   structurally a ground-dependent-visibility bug waiting to happen — and it happened. The
   original visual spec (§6) specced a mahogany **outline** button; the transparent-fill-borrowing
   behavior was an unflagged implementation detail on top of that.

## 2. The model

Every button role is an **opaque `{surface, ink}` token pair**:

- The class paints `surface` as `background` and `ink` as border + text.
- Hover = mix a small amount of `ink` into `surface`. Because `surface` is **always opaque**, the
  hover result is deterministic on any ground — it never depends on what is painted behind.
- **`.btn-secondary` is only ever applied to real `<button>`/action elements — never a container.**

This one rule (opaque base + no container-borrowing) fixes the bug at the root, not the symptom.

### Locked principle (project standard)

> **No ghost / transparent-fill interactive controls.** Buttons and button-like controls carry an
> opaque `surface` and an `ink` (border/text) as a token pair. Adapt to a dark ground by *swapping
> the pair* (an `-inverse` class), never by leaving the fill transparent and relying on the ground
> behind it. A control's legibility must not depend on what is painted behind it.

Added to the visual design spec §2 and saved as a feedback memory so it is not silently reintroduced.

## 3. Token rename (consistency)

`--action-primary-*` and `--btn-secondary-*` both describe buttons but use different prefixes.
Unify under `--btn-*`, so token↔class is 1:1 with `.btn-primary` / `.btn-secondary`:

| Old | New |
|---|---|
| `--action-primary` | `--btn-primary-surface` |
| `--action-primary-hi` | `--btn-primary-hi` |
| `--action-primary-text` | `--btn-primary-ink` |
| `--action-primary-edge` | `--btn-primary-edge` |
| `--btn-secondary-ink` | `--btn-secondary-ink` *(unchanged)* |
| *(new)* | `--btn-secondary-surface` |

The `--action-primary-*` names in tokens.css §semantic and in visual-spec §2.5 are updated.

## 4. Secondary becomes filled, with an inverse

```css
.btn-secondary {
  --btn-secondary-surface: var(--bg-page);    /* opaque light chip */
  --btn-secondary-ink: var(--mahogany);
  background: var(--btn-secondary-surface);
  color: var(--btn-secondary-ink);
  border: 2px solid var(--btn-secondary-ink);
}
.btn-secondary-inverse {
  --btn-secondary-surface: var(--placard-dp); /* opaque dark chip */
  --btn-secondary-ink: var(--cream);
}
.btn-secondary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--btn-secondary-ink) 12%, var(--btn-secondary-surface));
}
```

The inverse class *only swaps the pair* — the paint rules never change. Exact chip hexes are the
user's to retune in the visual pass; these are sensible defaults that keep the existing 2px
mahogany outline on the light ground.

**Visual consequences (accepted):**
- **Light grounds** (Share/Stats/New round/Hint/Forfeit in the cluster; zoom over the tree): nearly
  identical to today — the mahogany outline already framed them; only the fill becomes opaque.
- **Dark grounds** (header links How-to-play/Stats; anything in the sheet): the ad-hoc
  `--btn-secondary-ink: cream` overrides are replaced by `.btn-secondary-inverse`. These buttons
  become **filled dark pills** instead of near-borderless cream ghosts — more visually present.
  Accepted: they are buttons and should read as clickable. This is the one spot where "consistent
  system" trades against the current header texture; the trade is taken deliberately.

## 5. Structural fix — split the zoom controls

`.zoom-controls` stops being a `.btn-secondary`. It becomes **pure geometry** — the composite
frame — and each of its three buttons becomes its own `.btn-secondary`:

- `.zoom-controls`: opaque `background`, outer `border`, `--radius-pill`, `overflow: hidden`,
  `display: flex`. It carries the seam dividers between segments. No `:hover` rule.
- Each `<button class="btn-secondary">`: opaque fill + its own `:hover`. Scoped overrides
  neutralize each button's own border-radius and outer border so the three butt into one seamless
  pill (the frame supplies the rounded outer edge; `button + button` supplies the hairline seam).

Result: hovering one segment lights only that segment, and each segment is legible over the tall
placard because its fill is opaque. Fixes both the #64 symptom and the a11y-fighting "all three
light up together" behavior called out in the issue.

## 6. Cleanup surfaced by the rename

Audit every reader/overrider of the renamed tokens and migrate or drop:

- **Non-button borrowers of `--btn-secondary-ink`** (GuessList `+N more` link at
  `GuessList.svelte:113`, Explorer link color at `Explorer.svelte:143`, GameBoard `.budget` at
  `:192`): these use the token only as a *text color*, not a button. Keep them reading
  `--btn-secondary-ink` (still valid) — verify each still resolves to an intended color after the
  filled-secondary change. They are not `.btn-secondary` elements, so the fill change does not
  touch them.
- **Cream re-pointers** (`SpecimenPlacard.svelte:66`, `BottomSheet.svelte:214`): these set
  `--btn-secondary-ink: var(--cream)` for buttons that used to live on those dark grounds. After
  #63 moved the end-actions out of the sheet, check whether any `.btn-secondary` still renders
  inside these scopes. If none, **drop the dead override**. If some remain, replace the scope-level
  override with `.btn-secondary-inverse` on the actual buttons.
- **Header links** (`HowToPlay.svelte:34`, `StatsPanel.svelte:15`): replace the
  `--btn-secondary-ink: cream` override + `:hover { color: cream }` with the `.btn-secondary-inverse`
  class. Remove the commented-out dead CSS block in HowToPlay while there.
- **Commented dead code:** the `/* background: none; */` etc. block in `HowToPlay.svelte` is
  removed.

## 7. Spec + docs updates

- **Visual design spec §2:** add the locked "no ghost controls" principle (§2.5 token block gets
  the `--btn-*` rename; a new short principle line states the opaque-pair rule).
- **Visual design spec §6:** update the input-row bullet — Hint/secondary buttons are **filled**
  mahogany chips (opaque), not outline-only; note the inverse for dark grounds.
- **CLAUDE.md visual system note:** no change needed (it points at this spec).

## 8. Verification

- **Type/build:** `npx tsc --noEmit` + `npx svelte-check` clean.
- **Bug repro (in-browser, desktop, tall placard):** hover each zoom segment while it overlaps the
  placard; confirm each stays legible and only the hovered segment changes. This is the #64
  acceptance test.
- **Every secondary surface stays legible:** walk the gallery (`/gallery.html`) — cluster actions,
  zoom, header links, sheet — on both light and dark grounds; confirm no button relies on the
  ground behind it (each has an opaque fill).
- **Hover determinism:** confirm hover no longer produces a translucent result anywhere.

## 9. Out of scope

- Retuning the exact chip hexes / the 12% hover-mix ratio — a visual-pass decision.
- Any change to `.btn-primary` appearance (only its tokens are renamed).
- Touch/focus-ring restyling beyond what the class already provides.
