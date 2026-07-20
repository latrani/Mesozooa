# Always-playable list (#46)

**2026-07-20. Status: DESIGN, approved for implementation.**

## Problem

The notability cap (`prunePlayable`, `src/lib/tree/playable.ts`) keeps only the top-N most-notable
genera per terminal clade. That's correct for pool balance, but it drops specific genera we want
guaranteed-playable regardless of rank — most urgently **Tawa** (Ghost Ranch; needed playable for camp
week), which sits at the cap-7 boundary of the Theropoda-direct clade and will be bumped when the
rank-override work (#43) promotes **Eodromaeus** (sl=19) into that same bucket.

We need a curated "always-playable" list: name a genus, and it's guaranteed into the playable pool
past the cap — with the app degrading gracefully if a listed name is wrong.

## Scope of the override: cap only

`prunePlayable` excludes a genus for three reasons; the pin overrides **only the third**:

1. **No clue** (age/location missing) — a pinned genus WITHOUT this is NOT rescued. Paleo-data is the
   game's terminal feedback; a clueless answer is functionally thin. Warn and skip.
2. **Degenerate terminal clade** (`branchDepth ≤ 1`) — breaks the two-phase warmth ramp (spec 3.3). A
   pinned genus in such a clade is NOT rescued. Warn and skip.
3. **Cap overflow** (lost the per-clade notability competition) — **this is what the pin overrides.**

So a pin can rescue a genus that *would be playable if the pool were bigger*, but can never
manufacture a structurally-broken game. Tawa qualifies (it has a clue, non-degenerate clade, and only
lost on cap).

## Format: a list of names, resolved at build

A committed source list of genus **names** (human-readable, matches the "define by name" intent of #46
and #44):

```ts
// src/lib/tree/always-playable.ts
// Genera guaranteed into the playable pool past the notability cap. By NAME (resolved to Q-ids at
// build). A name that doesn't resolve to a clued, non-degenerate genus is WARNED and skipped —
// never force a broken game. See docs/superpowers/specs/2026-07-20-always-playable-list-design.md.
export const ALWAYS_PLAYABLE: string[] = [
  "Tawa", // Ghost Ranch coelophysoid; camp week. Bumped from Theropoda-direct cap by Eodromaeus (#43).
];
```

Names are matched against resolved tree-node names (the same `node.name` the PBDB join uses), at build
time in `build-tree.ts`.

## Mechanism: pins sort to the top of their clade, inside `prunePlayable`

A pure after-prune pass can set `playable = true` but cannot cleanly decide *who to demote* to hold
the cap. So the pin is threaded INTO the cap loop:

- `prunePlayable` gains a parameter: the resolved set of pinned genus ids (`Set<string>`).
- The clue gate (line 77) and degenerate gate (line 84) run **unchanged and first** — a pinned genus
  with no clue or a degenerate clade falls out here, exactly like any other (and is reported, below).
  Pins do NOT bypass these.
- In the per-clade sort (line 93), **pinned genera sort ahead of all non-pinned** (before the
  sitelinks comparison). The existing trim-to-cap (line 95) then keeps the pins and evicts the
  lowest-ranked *non-pinned* winner.
- Net for Tawa: it sorts to the top of Theropoda-direct → survives the cap-7 trim → the lowest normal
  winner (Siats, sl=19) is evicted instead. Clade stays at cap size; pins consume slots rather than
  expanding the pool.

Sort comparator change (conceptual):

```ts
members.sort((x, y) => {
  const px = pinned.has(x.id) ? 1 : 0, py = pinned.has(y.id) ? 1 : 0;
  if (px !== py) return py - px;                              // pinned first
  return y.sitelinks - x.sitelinks || (x.id < y.id ? -1 : 1); // then existing rule
});
```

If a clade's pin count exceeds its cap (not a concern at current list size), pins fill the cap and the
excess pins are still trimmed — acceptable and reported; revisit only if it ever happens.

## Graceful failure + build report

Resolution and all warnings happen at **build time** (`build:data`), printed in the data-quality
report — a bad pin is caught before shipping; the app never receives an invalid pin. Three outcomes
per listed name, each reported:

- **Re-added OK** — name resolved to a clued, non-degenerate genus that was cap-bumped; now pinned.
  (Report: `always-playable: pinned N`.)
- **No-op** — name resolved to a genus that was *already* playable (didn't need the pin). Not an
  error; report it so a redundant entry is visible (`already playable, pin redundant`).
- **Skipped with warning** — name didn't resolve to a genus at all (`unknown / not a genus`), OR
  resolved but has no clue / degenerate clade (`can't pin: no paleo-data` / `can't pin: degenerate
  clade`). The build continues (does NOT fail closed — a bad pin is a curation typo, not data
  corruption), but the warning is loud in the report.

This realizes #46's "assumes dino exists; if it doesn't, the app warns but keeps running" — moved to
build time, which is strictly better (caught before ship, not in a player's console).

## Downstream

`playableGenera()` and `dailyAnswer()` are unchanged — they read `node.playable`, which the pin sets
during the build. So a pinned genus automatically becomes a valid guess, autocomplete entry, AND
daily/practice answer, with no change to selection code. (This is also why #44's daily calendar likely
depends on #46: to schedule a genus as a daily answer, it must be in the playable pool — pin it here.)

## Out of scope

- **#44 daily calendar** (date→answer mapping). Distinct feature; likely consumes #46 (a scheduled
  daily answer should be pinned so it's guaranteed playable), but not built here.
- **Overriding the clue / degenerate gates.** Rejected (see Scope): the pin is cap-only.
- **Un-pinning / demoting** specific genera. The list only adds; there's no "force-exclude" counterpart
  (no need surfaced).

## Success criteria

- `ALWAYS_PLAYABLE = ["Tawa"]` → after `build:data`, **Tawa is playable** (in `genera-index.json`),
  even with Eodromaeus present in its clade; the lowest normal winner of that clade is evicted to hold
  the cap.
- A bogus entry (e.g. `"Notadino"`) produces a loud build warning and is skipped; the build completes.
- A clue-less or degenerate-clade entry is warned and skipped (not force-pinned).
- `playableGenera()` / `dailyAnswer()` unchanged; pinned genus is guessable + answer-eligible.
- `npx tsc --noEmit`, `npx vitest run` (incl. new `prunePlayable` pin tests), `npx svelte-check` clean.
- GUARD 2 does not trip (pin nets ~0 pool change: +pin, −evicted).

## Verification

- Unit tests on `prunePlayable`: (a) a pinned cap-bumped genus survives and evicts the lowest winner;
  (b) a pinned genus with no clue is NOT pinned; (c) a pinned genus in a degenerate clade is NOT
  pinned; (d) a pinned already-playable genus is a no-op. Pure, TDD.
- Build check: `ALWAYS_PLAYABLE=["Tawa"]` → Tawa in `genera-index.json`; the report prints the pin
  outcome; a deliberately-bogus temp entry prints the warning.
