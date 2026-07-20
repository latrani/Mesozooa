# Paleo-data: decouple from playability + unify the name

**2026-07-20. Status: DESIGN, approved for implementation.**

## Problem

Two entangled defects, one root confusion.

**1. The paleo-data (age + discovery location) is emitted only for *playable* genera.** `build-tree.ts`
writes `genus-attributes.json` by iterating the `playable` set, so a genus that is documented in PBDB
but excluded from the *game* (by the notability cap, e.g. **Suskityrannus** — cap-bumped to #9 of 11
in Tyrannosauroidea) loses its paleo-data in **Explore** too. But Explore is a *reference explorer* —
paleo-data there is reference content, not game feedback. Playability answers "is this a valid game
answer?"; it should not also gate "do we have data worth showing?". Measured: **1,472** genera have
paleo-data, but only **799** (the playable set) get it emitted — **673** documented genera show
nothing in Explore.

**2. The same concept is called three different things**, which is *why* defect 1 hid for so long:
"field clue" (the reveal chip), "paleo clue" (code comments), "paleo data" (informal). One concept
with three names obscured that the game-clue and the Explore-reference-data are the *same data*, so
nobody noticed the game gate was silently starving the reference view.

## Decisions

**The canonical user-facing name is "Paleo-data."** Everywhere a human sees it — the reveal chip, any
label, all prose/docs — it is "paleo-data" (chip label: "Paleo-data"). Never "field clue" or "paleo
clue."

**Internal code identifiers keep their existing names.** `leafHint` (the engine trigger that reveals
it), `clueFor`, `formatClueAge`/`formatClueLocation`, `clueFieldsFrom`, `hasClue`, `GenusAttribute`,
and the `genus-attributes.json` filename all stay. Renaming them is churn with no clarity payoff, and
the rule is specifically about the *shown thing* and *prose*, not identifiers. `leafHint` remains the
name of the trigger; the thing it surfaces is "paleo-data."

**Paleo-data emission is decoupled from playability.** Emit for every genus that has paleo-data, not
just playable ones. The *playable set* (`genera-index.json`, autocomplete, answer pool) is unchanged —
this widens *reference data*, not the *game*.

## Changes

### 1. Decouple emission (`scripts/build-tree.ts`)

The emit loop currently iterates `playable`:

```ts
// Emit clue attributes only for the final playable set.
const clueOut: GenusAttributes = {};
for (const n of playable) if (attrs[n.id]) clueOut[n.id] = attrs[n.id];
```

Change to iterate all genera (paleo-data for everything documented):

```ts
// Emit paleo-data for EVERY genus that has it — Explore shows it as reference content, so it is
// NOT gated on playability (the game answer pool is genera-index.json, emitted separately above).
const clueOut: GenusAttributes = {};
for (const n of genera) if (attrs[n.id]) clueOut[n.id] = attrs[n.id];
```

`genera` is already in scope (`const genera = Object.values(tree.nodes).filter((n) => n.isGenus)`).

**Effects:** `genus-attributes.json` 799 → 1,472 entries, ~155 KB → ~283 KB (+128 KB, precached
offline — trivial, smaller than one shipped image). `genera-index.json` unchanged. Suskityrannus and
672 other documented-but-unplayable genera gain their Explore paleo-data with no further change.

**Guards:** `build-tree.ts` GUARD 2 tracks `clueLoc` (clues-with-location) and `playable` counts; both
only grow here, so no trip. No new guard needed.

### 2. Terminology → "Paleo-data"

- **`src/lib/game/chip-view.ts:33`** (the ONE user-facing string): `label: "Field clue"` →
  `label: "Paleo-data"`. This is the chip shown when the reveal fires.
- **`src/lib/game/clue.ts:6`** comment: rewrite to "The paleo-data for a genus id…" AND fix the now-
  false parenthetical — it currently claims "Every playable genus has one"; after the decouple, the
  correct statement is that paleo-data is emitted for every genus that has it, and the *reverse* is not
  true (not every genus with paleo-data is playable). Keep the null-handling guidance.
- **`src/lib/game/engine-core.ts:111`** comment: "surfaces the paleo clue" → "surfaces the paleo-data".
- **`src/data/README.md:11`**: "paleo clue (age + discovery location) for each playable" → "paleo-data
  (age + discovery location) for every genus that has it".

Identifiers are untouched (see Decisions).

## Out of scope

- **The playable override** (forcing Suskityrannus into the game *answer* pool past the cap). This
  spec makes its paleo-data visible in Explore; making it a guessable/daily *answer* is a separate,
  next piece. Explicitly deferred.
- **Cap tuning** (the deferred brainstorm). Untouched.

## Success criteria

- Suskityrannus shows its paleo-data (Turonian; United States, New Mexico, Moreno Hill Formation) in
  Explore, while remaining absent from the playable answer pool (`genera-index.json`).
- `genus-attributes.json` has ~1,472 entries; `genera-index.json` still ~799.
- The reveal chip reads "Paleo-data". No user-facing text says "field clue" or "paleo clue".
- `npx tsc --noEmit`, `npx vitest run`, `npx svelte-check` all clean. GUARD 2 does not trip.

## Verification

- `chip-view` test (if present) or a new assertion pins the chip label to "Paleo-data".
- A build + a node check: Suskityrannus (Q20728010) present in `genus-attributes.json`, absent from
  `genera-index.json`.
- `clueFor` is already null-safe (`src/lib/game/clue.ts:8-10`) and no consumer treats "in attributes"
  as a proxy for "playable" (verified: only `clue.ts` reads the file, purely as a lookup), so widening
  the emitted set cannot break the game.
