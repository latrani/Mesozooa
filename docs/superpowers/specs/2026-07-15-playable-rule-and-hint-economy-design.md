# Playable-rule rethink + adaptive cap + hint/clue economy

**Date:** 2026-07-15
**Status:** Approved design, pre-implementation
**Supersedes:** the `hasFamilyAncestor` gate in `markPlayable`, the flat `CAP=7` in
`prunePlayable`, and the `MAX_HINTS=3` / passive-clue hint model.

## Motivation

"Why is Oviraptor not playable?" — because the playable gate required a **family-ranked
ancestor**, and Wikidata's `parent taxon` points Oviraptor straight at the clade
Oviraptorosauria, skipping its own family. This is not a one-off: **730 of 1631
wiki-notable genera (40%)** have no family-ranked ancestor, because Wikidata rank labels
are sparse and inconsistent. The gate was silently excluding Argentinosaurus, Eoraptor,
Dilophosaurus, Ouranosaurus, and most of the famous "floating" genera.

Investigation surfaced three *independent* problems the old design conflated:

1. **Notability gate built on bad data** — family rank is the wrong signal.
2. **Disambiguation cap measures the wrong quantity** — `CAP=7` limits *leaves that
   bottom out at a node*, but the player must disambiguate *all playable descendants* of
   the terminal clade. These diverge whenever a node has both branches and leaves, so the
   "every terminal set ≤ 7" guarantee in the docs was already false (31% of targets today
   reach a terminal state showing >7 candidates; one shows 675).
3. **Hint mechanic degenerates / has a boring-win bug** — the hint walks one node down the
   target lineage; when the next node *is* the target it "reveals" the answer as a hint row
   (and `applyHint` never guards `won`). Separately, the clue auto-fires passively.

These are three knobs, addressed separately below.

## Key data (from committed `tree.json` + `data/raw-pbdb.json`, 2026-07-15)

- 1835 genus nodes total; every name distinct (post-dedupe — no duplicate-name genera).
- 1631 have a Wikipedia page.
- **1514** have wiki + (age OR location); **1344** have wiki + age AND location.
- PBDB clue coverage already exists on disk for **1683** genera — the fetch always ran over
  all genera; the old build just filtered attributes down to the family-gated pool. **No
  re-fetch is needed.**
- Node-width (direct children) over 386 internal nodes: quintiles 1·2·4·9, median 3, max 76.
- Pure-leaf fanout (eligible genus-leaves per node) in the 1344 pool: quintiles 1·2·4·7,
  p95 13, max 43 (Saurischia). Worst pure polytomies (0 branch-children): Mamenchisauridae
  (20 leaves, all Jurassic Chinese sauropods), Euhelopodidae (15).

## Decision 1 — Base playability rule

Drop the family gate. A genus is **base-eligible** iff:

```
n.isGenus && n.wikipediaUrl && hasBoth(attrs[n])
  where hasBoth(a) = !!a && !!a.ageLabel && !!a.discoveryLocation
```

Requiring **both** age and location (not either):
- costs only ~170 genera vs "either" (1344 vs 1514) — well-documented genera have both;
- means the clue delivered at a leaf is *always* full (time **and** place), never a half-clue;
- is itself the primary pool-size lever — "has a Wikipedia page and real paleo data" is a
  good proxy for "is a satisfying dinosaur to guess."

`hasFamilyAncestor` and its `RANK_FAMILY` import are **deleted** from `playable.ts` (grep to
confirm no other caller first).

## Decision 2 — Adaptive diversity cap

`terminalClade` is purely count-based and never used family rank, so the per-terminal-clade
cap is the real disambiguation guard. Replace the flat cap with a cap that scales to the
**clue-diversity** of each terminal clade's leaf set, because the two pathological shapes
want opposite treatment:

- **Wastebasket** (e.g. Saurischia: 45 leaves, 16 countries, 181 Ma span) — an
  unresolved-placement dumping ground. The clue *disambiguates* well, so a wide cap is fine.
- **Boring bucket** (e.g. Mamenchisauridae: 20 leaves, 85% one country, ~11 Ma span;
  Centrosaurinae: all the same age) — a real tight clade where the clue is nearly useless.
  These are the "guess 15 near-identical longnecks and rage-quit" nodes; they want the
  tightest cap.

### Algorithm (build-time, in `prunePlayable`)

For each terminal clade, over its base-eligible leaf members:

```
dom     = largest single-country share of discoveryLocation      // 0..1
locDiv  = 1 - dom                                                 // geographic spread
ageSd   = stddev of age-midpoints ((ageStartMa + ageEndMa)/2)     // Ma
ageDiv  = min(1, ageSd / AGE_SD_FULL)

score   = (LOC_WEIGHT * locDiv + AGE_WEIGHT * ageDiv) ^ DIVERSITY_GAMMA
cap     = clamp(round(CAP_MIN + (CAP_MAX - CAP_MIN) * score), CAP_MIN, CAP_MAX)
```

Then keep the top-`cap` members by sitelinks (ties by ascending id), exactly as today. The
smooth (gate-free) formula ranks clades by genuine boringness — no threshold cliffs.

### Constants (named, tunable dials)

```
CAP_MIN         = 3     // floor: never make the player pick blind among more than ~3 boring siblings
CAP_MAX         = 7     // ceiling: widest terminal set, only for well-spread clades
AGE_SD_FULL     = 45    // Ma stddev of age-midpoints treated as "fully time-diverse"
LOC_WEIGHT      = 0.5   // location vs age contribution to the diversity score
AGE_WEIGHT      = 0.5
DIVERSITY_GAMMA = 1.35  // >1 bends low-diversity sets harder toward CAP_MIN
```

### Result

**~783 playable.** Wastebaskets stay wide (Theropoda 7, Saurischia 6); boring buckets
squeezed (Mamenchisauridae → 3, Centrosaurinae → 3); moderate clades 4–5. All the famous
orphans are in. Pruned genera remain fully browsable in Explore — only the *playable* flag
changes. `CAP_MAX == max leaf-fanout` is now a real guarantee, not an accident.

### Note

The clue is weakest exactly inside boring buckets (7 similar-clue siblings is harder than 7
distinct ones). The floor of 3 acknowledges this. A future "extra notability signal" (e.g.
external dinosaur-coverage lists like the I Know Dino podcast) could improve *which* survivors
are kept in the ~15 saturated clades — deferred, not needed now.

## Decision 3 — Unified hint/clue with a depth-scaled cost

### Behavior

One "I'm stuck" button replaces the separate hint action and the passive auto-clue:

- **Not yet at the leaf-terminal state** → walk one node down the target's lineage (below the
  deepest already-revealed node), as `nextHintNode` does today.
- **At the leaf-terminal state** (the next step down is a leaf; warmth has bottomed out at the
  target's terminal clade) → reveal the paleo **clue** (age + location) instead of the leaf,
  fixing the boring-win bug. Shown once; re-pressing does not re-charge. The clue no longer
  auto-appears — it is button-triggered, the deep/cheap end of the same mechanic.

### Cost — depth-scaled, relative to lineage

A flat 1-move hint is degenerate: "seed one guess, then mash hint down the spine" solves 87%
of targets within 20 moves. Cost is therefore scaled by **how far along the target's own
root→leaf lineage** the revealed node sits — early (shallow) hints expensive, late (deep)
hints cheap. This kills the spine-walk (it pays the highest prices at the top, where the
exploiter must operate) while rewarding a player who narrowed legitimately and wants a cheap
nudge on the final indistinguishable leaves.

```
frac = revealedNodeDepthIndex / (lineageLength - 1)      // 0 at root .. 1 at leaf
cost = ceil(HINT_COST_MAX - (HINT_COST_MAX - HINT_COST_MIN) * frac)   // guess-slots
```

Constants (named, tunable):

```
HINT_COST_MAX = 6   // a root-level (shallow) hint costs 6 guess-slots
HINT_COST_MIN = 2   // a leaf-adjacent hint (and the clue) costs 2 — nothing is ever free
```

Per-step cost runs 6→2 across a lineage. Pure-spine-walk median cost ≈ 66 guess-slots; only
~7% of targets solvable in a 20-budget that way. `MAX_HINTS` (the hard 3-cap) is **removed** —
the shared budget is the only limit.

### Budget — one currency

Guesses and hints share one pool. Each `GuessResult` carries a **`cost`** (guess = 1, hint =
computed above). The budget compares against the **sum of costs**, not row count. Daily's
`DAILY_MAX_GUESSES` is retained as the (now shared) move budget; the exact number is a dial to
tune by playtest — start at the current value and revisit if the shared pool feels tight
(~25 is a candidate).

## Decision 4 — Record + surface + share hint usage

Hint-count becomes a second prestige axis: "18 moves, 0 hints" flexes against "9 moves, 4
hints." The plumbing largely exists (`GuessResult.kind === "hint"`, `hintsUsed` on state, 💡
already in the share).

- **State:** `hintsUsed` stays but is now a *display/prestige* count, not a budget cap. Add
  `cost` to `GuessResult` (see above).
- **History:** hint rows already render with 💡; keep, and show cost on the row.
- **Share grid:** a hint expands to **`cost` × 💡** — grid length == moves spent, visually
  literal about what help cost. (So two 4-cost hints = eight 💡 in the grid.)
- **Share score line:** total moves used + a *distinct-hint* tally using a **different glyph**
  from the grid, so the two counts (moves-spent-on-help vs. times-hinted) can't be misread as
  a mismatch. Chosen: 🔦 for the tally. Example:

  ```
  Mesozooa 2026-07-15  14/25 · 🔦2
  🟦🟦🟩🟨💡💡💡💡🟧🟥
  💡💡🎯
  ```

  Grid 💡 = moves those hints cost; `🔦2` = two hint presses.

## Build / files

- `src/lib/tree/playable.ts` — rewrite `markPlayable` (drop family), rewrite `prunePlayable`
  (adaptive cap + constants). Delete `hasFamilyAncestor`.
- `scripts/build-tree.ts` — replace `PLAYABLE_CAP=7` wiring with the constant block; regenerate
  `src/data/tree.json` + `src/data/genus-attributes.json` (grows ~675 → ~783). No PBDB re-fetch.
- `src/lib/game/engine-core.ts` — hint cost fn, unified button behavior, `won` guard, budget
  on sum-of-cost, remove `MAX_HINTS`.
- `src/lib/game/types.ts` — add `GuessResult.cost`.
- `src/lib/game/share.ts` — grid expands hints by cost; score line adds 🔦 tally.
- `src/lib/game/dailyStore.svelte.ts` — `MAX_HINTS` used in the `hintsRemaining` getter and
  the `canHint` guard; both rework for the shared-budget/cost model (there is no separate hint
  cap now — the button is available whenever the remaining move-budget covers the next hint's
  cost).
- `src/lib/game/persistence.ts` — validates `hintsUsed`; **migration:** older saved games have
  no `cost` on `GuessResult`. Backfill on load (guess → 1; legacy hint row → derive from its
  revealed node's lineage frac, or a safe default) so restored games don't miscount the budget.
- `src/lib/game/components/GameBoard.svelte` — `hintsRemaining = 3 - hintsUsed` (stale — remove
  the 3); the end-state line "guessed in N turns with M hints" already exists (edit, not new).
- `src/gallery/fixtures.ts` — `hintsRemaining = 3 - hintsUsed` fixture (stale — update).
- Stores + components — button label/behavior, history cost display, specimen no longer
  auto-shows clue (button-driven).
- Docs — fix CLAUDE.md ("2,072" → 1835 reference pool; "674/675 / family ancestor" → new rule
  and ~783; warmth/CAP description). Update `deferred-findings.md` as needed.

## Testing (TDD on pure logic)

- `playable.test.ts` — rewrite: base rule (genus + wiki + both-clue); adaptive cap picks
  correct N for wastebasket vs boring-bucket fixtures; the family-less fixture genus
  ("Loosey") is now *playable* (fixture intent inverts — was "no family → excluded").
- New tests for the hint-cost function (frac 0 → MAX, frac 1 → MIN, monotonic) and
  sum-of-cost budget accounting.
- `share.ts` tests — hint expands to `cost` 💡; score line renders 🔦 tally.
- Phased build: **Phase 1** data rule + adaptive cap (build-pipeline only, shippable alone);
  **Phase 2** hint/clue economy + share (engine + UI).
```
