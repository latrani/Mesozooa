# Image gate for playability + pins override all gates (#50)

**2026-07-20. Status: DESIGN, approved for implementation.**

## Problem

11% of the playable pool (89 of 799 genera) has no image, so those games show the `???` placeholder
card instead of a picture — the pool feels less vibrant, and it's padded with obscure taxa (a large
Mesozoic-bird-stem tail plus egg oogenera like *Spheroolithus*). #50: prune imageless genera out of
the playable pool so every playable dino has an image.

Measured (2026-07-20): of the 89 imageless playable genera, **48 are under Avialae** (the bird stem —
the "birdgatory" tail), **41 are non-bird** (sauropods, ankylosaurs, oviraptorosaurs, and ~5 egg
oogenera). None of the current pins (Tawa, Suskityrannus) or daily-calendar dinos is imageless, so the
gate has no conflict with today's curated entries.

## Decisions

- **Hard rule: a genus is playable only if it has an image.** Not a soft cap-tiebreak — an imageless
  genus is excluded from the playable pool.
- **Gate runs BEFORE the notability cap.** The image check joins the existing clue + degenerate-clade
  filters in `prunePlayable`'s candidate-building loop, so imageless genera are dropped *before* the
  per-clade cap trims. This lets the cap refill freed slots with image-having genera rather than
  letting an imageless genus consume a slot and vanish. Measured pool impact: **799 → 727** (vs. the
  naive 710 — gate-before-cap keeps ~17 more by not wasting cap slots).
- **Pins override ALL gates. Pin runs last, pin wins — no exceptions.** This **narrows/replaces the
  #46 pin contract**, which was "cap-only" (skip+warn on no-article / no-clue / degenerate-clade). New
  contract: a pinned genus is forced playable regardless of image, clue, article, or degenerate-clade
  status. The only thing that can't be pinned is a name that doesn't resolve to a genus at all.
  Rationale (user, 2026-07-20): "Pins override gates. Period. Pin is the last thing that happens. It's
  on me not to pin something stupid." The warmth math already guards the degenerate case
  (`warmth.ts:20`, `denom = Math.max(1, terminalBranchDepth)`), so a pinned degenerate-clade target
  yields flat/degraded warmth, never a crash.

## Changes

### 1. Image gate in `prunePlayable` (`src/lib/tree/playable.ts`)

The candidate loop currently drops a node for: not base-playable, no clue, degenerate clade. Add the
image check as a fourth filter in the same loop — but the pin set must still bypass it (pins override
everything). Since pinned nodes already sort to the top and are never trimmed, the cleanest form is:
**apply the image filter only to non-pinned nodes** in the candidate loop (mirroring how the cap trim
already skips pins). An imageless pinned node stays; an imageless non-pinned node is dropped.

`prunePlayable` needs the image fact per node — `TreeNode.imageUrl` is already on the node, so no new
parameter: the loop checks `!n.imageUrl` alongside the existing gates, guarded by `!pinned.has(n.id)`.

Precise gate order in the candidate loop (all pre-cap):
1. `!n.playable` → skip (base: genus + article, from `markPlayable`)
2. `!hasClue(...)` → skip
3. degenerate `branchDepth <= 1` → skip
4. **NEW:** `!n.imageUrl && !pinned.has(n.id)` → skip (imageless, unless pinned)

(Gates 2 and 3 do NOT yet exempt pins — that's change #2 below, which moves the pin bypass earlier so
it covers all gates uniformly.)

### 2. Pins override all gates (reverses #46 cap-only)

Two places encode the old cap-only pin contract; both change so a pin bypasses every gate:

**a. `prunePlayable` candidate loop** — a pinned node must skip gates 2, 3, and 4 (clue, degenerate,
image), not just the cap. Simplest: at the top of the per-node loop, if `pinned.has(n.id)`, add it to
its clade's candidate list unconditionally (still subject only to being a genus with base playability
— actually pins bypass base too; see build note). The non-pinned path keeps all four gates.

**b. build-tree pin resolution loop** (`scripts/build-tree.ts`) — currently skips+warns a pinned name
on no-article / no-clue / degenerate. New behavior: **force the pin regardless**, but still *report*
the override so it's visible. The report line becomes e.g. `✓ "X" (id): pinned (no image)` /
`(no paleo-data)` / `(degenerate clade)` / `(rescued from cap)` / `(redundant)`. The ONLY remaining
hard skip is `unknown / not a genus` (nothing to pin). A pinned genus with no article means the build
must still emit it as playable — so the build adds pinned ids to the pool even if `markPlayable` left
them false.

**Note on base playability + pins:** since a pin now overrides the article gate too, the build can no
longer assume a pinned node is base-playable. The pin must set `n.playable = true` for its node before
(or as part of) the prune, so `prunePlayable`'s first gate (`!n.playable`) doesn't drop it. Implement
by having the build mark pinned nodes playable up front, or by `prunePlayable` treating `pinned.has(id)`
as base-playable. Either keeps the invariant: **a pinned genus is always in the pool.**

### 3. Reconcile the #46 spec + report wording

Update `docs/superpowers/specs/2026-07-20-always-playable-list-design.md`: the pin is no longer
"cap-only." State the new contract (overrides all gates; pin is last) and that an imageless/clue-less/
degenerate pinned genus is honored + reported, not skipped. Keeps the two specs from contradicting.

## Out of scope

- **Recovering images for imageless genera** (e.g. pulling species-entity images like we did articles
  in the species-cluster work). A separate enhancement; this spec *excludes* them from play, doesn't
  try to *give* them images. They remain visible in Explore with their paleo-data (the decouple).
- **Birdgatory-specific trimming.** The hard image rule subsumes it (48 of the 89 are bird-stem);
  no Avialae-specific logic.
- **Cap dial retuning** (#45, decided: keep 3–7).

## Success criteria

- After `build:data`, every genus in `genera-index.json` has a non-empty `imageUrl` in `tree.json`,
  EXCEPT any that are pinned (`ALWAYS_PLAYABLE`) — a pinned imageless genus stays playable.
- Pool drops from 799 to ~727 (image-having genera refill freed cap slots).
- The 48 imageless Avialae genera and the imageless egg oogenera are no longer playable.
- Pins still work and now override everything: a test/build confirms a pinned imageless genus is
  playable; the pin report labels the override reason.
- `dailyAnswer` / calendar unaffected (no calendar dino is imageless); daily still resolves.
- `npx tsc --noEmit`, `npx vitest run` (incl. new `prunePlayable` image-gate + pin-override tests),
  `npx svelte-check` clean. GUARD 2 (regression) — the ~72-genus drop is INTENTIONAL, so if GUARD 2
  trips on the playable-count drop, override with `ALLOW_DATA_REGRESSION=1` for this build (documented
  in the commit).

## Verification

- Pure `prunePlayable` tests (TDD): (a) an imageless non-pinned genus is excluded; (b) an imageless
  PINNED genus is kept; (c) image-having genera refill a clade's cap slots freed by imageless drops;
  (d) existing clue/degenerate/cap tests still pass.
- Build: pool ~727; `genera-index.json` ∩ imageless = only pinned genera; the pin report shows
  override labels.
- Note: this is the first feature that INTENTIONALLY shrinks the pool >10%, so GUARD 2 needs the
  documented `ALLOW_DATA_REGRESSION=1` override on the landing build.
