# Ring-position Unification Plan (deep-unify)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans or inline with checkpoints. Steps use checkbox (`- [ ]`).

**Goal:** Stop the focus ring "wheeling" during an Explore relayout by putting the ring's POSITION on the same master clock as the node FLIP + scroll. Ring SIZE (dot↔bloom morph) and paint stay as-is.

**Architecture:** Un-bundle slice-1's `ringTween<RingGeom>` (which animated position AND size together on its own private clock). Position → derived off the shared `flipProgressTween` via `flipProgress(_, FLIP_FRACTION)`, lerping the ringed node's center-from→center-to (pixels). Size → a small scalar morph tween (0=dot, 1=bloom) the phase machine drives; the rendered rect is `lerp(dotGeom(centerNow), bloomGeom(centerNow), morph)`. Because `centerNow` (shared clock) appears linearly in both dot- and bloom-geometry, the ring's on-screen center is `centerNow − scroll(t)` on ONE shared curve → provably no wheel.

**Tech Stack:** Svelte 5 runes, `Tween`, TS (`verbatimModuleSyntax`), Vitest.

## Global Constraints
- `verbatimModuleSyntax` ON. Run `tsc --noEmit` + `svelte-check --threshold error` before commit.
- Reduced motion + first mount stay instant.
- Phase machine stays `ringId`-keyed and `untrack`s layout (slice-1 discipline). Only the ring's POSITION SOURCE changes.
- Skate (focus change, no relayout) preserved; rapid-nav interrupt preserved.
- No change to scroll driver, node FLIP, edges/stubs.
- Commits ref `#52`, no "Closes". Unpushed.

**Spec:** `docs/superpowers/specs/2026-07-21-relayout-flip-design.md` § "The ring position must ride the shared clock".

---

### Task 1: Pure helper — `lerpRingGeom`

**Files:** `src/lib/game/ring-glide.ts` (+ `.test.ts`)

Add `export function lerpRingGeom(a: RingGeom, b: RingGeom, t: number): RingGeom` — lerp each of x/y/width/height/radius. Pure, trivial, TDD'd (t=0→a, t=1→b, t=0.5→midpoint).

- [ ] RED test, GREEN impl, `tsc`, commit.

### Task 2: Coordinated trigger + ring center-from/to snapshot

**Files:** `SpineTree.svelte`

- Introduce `ringCenterFrom`/`ringCenterTo` (`$state<Point|null>`). Snapshot in a single effect that tracks BOTH `ringId` and `layout` (the coordinated trigger): on any transition, `ringCenterFrom` = the ring's CURRENT rendered center (mid-glide interrupt), `ringCenterTo` = new ringed-node center (pixels, `ringCenter(ringId)`). Reuse the existing `flipProgressTween` restart already in the FLIP effect — merge the ring snapshot into it, and make the effect also track `ringId` (so a focus-only skate restarts the shared progress too).
- Guard: focus-only change with no prior center (first mount) → instant (progress=1, dur 0), matching slice-1 `firstPlace`.

- [ ] Wire; `tsc`+`svelte-check`.

### Task 3: Ring center + morph derivations, retire position role of `ringTween`

**Files:** `SpineTree.svelte`

- `ringCenterNow` = `$derived` `lerpPos(ringCenterFrom, ringCenterTo, flipProgress(flipProgressTween.current, FLIP_FRACTION))` (fall back to `ringCenterTo` if from is null).
- Replace `ringTween<RingGeom>` with `morphTween` (`Tween<number>`, 0=dot→1=bloom), driven by the phase machine: focus change → `morphTween.set(0, {duration:0})` then the skate lets position glide while morph goes 0; settle → `morphTween.set(1, {duration: GLIDE_MS})`. (Reduced-motion/first: set(1,0).) Keep the settle-timer logic.
- Render rect = `lerpRingGeom(ringGeom("dot", ringCenterNow, labelBox, RING_H, RING_PAD_X, dotRadiusFor(ringId)), ringGeom("bloom", ...same center...), morphTween.current)`.
- `fill-opacity`/`opacity` now key off `morphTween.current` (e.g. bloom when morph>~0.5, or lerp) rather than discrete `glidePhase` — keep it simple: opacity = `lerp(PUCK_TRAVEL_OPACITY, 1, morph)`, fill-opacity = `lerp(1, 0.18, morph)`. (This also smooths the paint, a bonus.)

- [ ] Wire; `tsc`+`svelte-check`; full `vitest`.

### Task 4: Live verify

- [ ] Reproduce Eusaurischia→Saurischia: measure ring on-screen center vs its node's on-screen center per frame — **divergence ≈ 0** (was wheeling). 
- [ ] Skate still works (game arrow-nav: dot collapses, travels, blooms).
- [ ] Rapid-nav interrupt: no stutter.
- [ ] Reduced-motion: instant.
- [ ] Remove any temp debug; commit.

## Self-Review
- Wheel killed by construction (center on shared curve). ✓
- Skate/morph/interrupt/reduced-motion preserved. ✓
- Phase machine stays ringId-only + untrack. ✓
- Pure helper TDD'd. ✓
