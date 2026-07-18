# Mesozooa — Leaf Disambiguation Design

*Fixing the endgame: telling sibling genera apart once warmth bottoms out.*
Date: 2026-07-12

Addresses the game's core UX pain (see the `leaf-disambiguation-pain` memory): once the
search is narrowed to a small clade, warmth cannot separate the sibling genera (leaves) —
they all share that clade, so they're equally warm. The endgame becomes a blind check-off of
a list, and for large flat sets you can get warm and still lose to the 20-guess budget.

## 1. The problem, quantified

For a target genus **T**, warmth can never get below T's **terminal clade** — the lowest
ancestor `A` of T with `descendantGenusCount(A) > 1` (skipping monotypic parents that contain
only T). Every genus under `A` has the same MRCA with T, so warmth cannot distinguish them.
The **terminal set** = `descendantGenusCount(A)`.

Measured over the 900 currently-playable genera:

| Terminal-set size | Share |
|---|---|
| 2–4 | 22.8% |
| 5–9 | 22.7% |
| 10–19 | 23.2% |
| **20+ (can get warm and fail out)** | **31.3%** |

Every genus has ≥2 terminal siblings; 55% land in ≥10; 31% in ≥20. Worst offenders:
Hadrosauridae, Nodosauridae, Ceratopsidae, Dromaeosauridae, Mamenchisauridae. Core difficulty
spike, not an edge case.

**Median terminal-set size: 7 per genus** (mean 10; p25=4, p75=13, p90=23), though only **3
per set** — most flat sets are tiny, but genera concentrate in the big families. The per-genus
median (7) is the cap chosen in §2.

## 2. The decision

**Prune the pool so every terminal set is small, and add a paleo clue for the rest.** There is
a single `playable` set — the whole game (autocomplete, guesses, answers all draw from it).
Everything else is **unplayable**: still fully browsable in Explore, but never appears in a
game. No "guessable vs answerable" distinction.

1. **Cap the terminal set at `CAP = 7` by keeping the most *notable* genera.** For each
   terminal clade, keep the top-`CAP` genera by notability; the rest become unplayable. This
   bounds every in-game flat set to ≤ 7 siblings (always winnable + clue-solvable) while
   **keeping famous genera in every family** — Tyrannosaurus stays, obscure Zhuchengtyrannus
   goes, never the reverse. Pool ≈ **696** at CAP 7 (before the clue-availability filter,
   §3.3) — well above Metazooa's 329, so the obscure long tail largely survives. **7 is the
   per-genus median terminal-set size** (see §1), so the cap trims the 33 oversized sets while
   leaving a typical answer's endgame whole. CAP is a build-time dial controlling **endgame
   difficulty** (max siblings to disambiguate); it also sets the pool as a coupled side effect.
2. **A paleo clue** — *when it lived* + *where it was discovered* — surfaced when warmth bottoms
   out, turning the ≤10 endgame from a blind check-off into a deduction.

**Guess budget = 20** (Metazooa parity), a tunable difficulty dial.

### Notability heuristic: Wikidata sitelink count

Rank genera by **number of Wikipedia language editions (Wikidata `wikibase:sitelinks`)** — a
cheap, in-pipeline fame proxy. Validated on 108 tyrannosauroid+hadrosaurid genera: Tyrannosaurus
107, Parasaurolophus 54, Albertosaurus 52 … down to Didanodon 2, Plesiolophus 2. Clean
separation of famous from obscure; every playable genus has ≥1 sitelink (enwiki required), so
no zero case. **Ties break by QID** (deterministic/reproducible).

### Why this shape (evidence)

- **Wikidata can't support the clue.** Flat-set coverage: geological age 44%, size 4–21%,
  geography 0–29%. Too patchy.
- **PBDB can.** Same genera: recognized 97%, temporal range 95%, has-occurrences (→ discovery
  location) 96%. Used **only for attributes, keyed by genus name** — not taxonomy — which
  sidesteps the parataxonomy reason the main spec §3.1 avoided PBDB.
- **Sitelink notability discriminates** (validated above).
- **Cap→pool** (keep top-CAP per terminal set, measured): CAP3→457, 4→543, 6→656, **7→696**,
  8→729, 10→776. (CAP couples pool to endgame size; 7 = the per-genus median.)

## 3. Data design (Plan A)

Build-time only; Wikidata still owns the tree. `playable` is **redefined** to the pruned set.

### 3.1 New harvested data

- **Wikidata sitelink count** per genus — add `wikibase:sitelinks` to the existing enrichment
  query in `fetch-wikidata.ts` (cheap, already querying Wikidata).
- **PBDB attributes** per genus, via a new `scripts/fetch-pbdb.ts` querying PBDB by genus
  **name** (~97% match; unmatched get no attributes):
  - **when it lived** — geological age (interval name + Ma bounds).
  - **where it was discovered** — a present-day locality summary (country/region from PBDB
    occurrences; **present-day, not paleo-position** — paleo-geography isn't useful to this
    audience).

### 3.2 The terminal clade + notability prune (pure, tested)

- **Terminal clade of T**: the lowest ancestor `A` with `descendantGenusCount(A) > 1` (walk up
  from T's parent, skipping monotypic clades). Used by both the prune and the clue trigger.
- Base eligibility (existing): family ancestor + English Wikipedia article.
- **Clue eligibility** (new): has **at least one** of {age, discovery-location}. A genus with
  neither is unplayable (keeps the endgame clue consistent — no brute-force holes; §2 accepts
  this small trim rather than leaving un-clued answers).
- **`playable`** = for each terminal clade, among its base-eligible AND clue-eligible genera,
  the **top-`CAP` by sitelink count** (ties by QID). All others unplayable.
  - Pure functions: `terminalClade(tree, id)`, and `markPlayableByNotability(tree, attrs, cap)`
    — unit-tested against a fixture (with synthetic sitelink/clue data).

### 3.3 Emitted artifacts

- `tree.json` — `playable` now reflects the pruned set. **Every genus node carries its
  `sitelinks` count** (not just the playable ones), so any future notability-based prune or
  threshold tune (e.g. a global sitelink floor, or a smaller CAP) can be applied at build time
  from committed data **without re-harvesting Wikidata**. Cheap to store; retained deliberately.
- **`src/data/genus-attributes.json`** — keyed by genus id:
  `{ [id]: { ageLabel: string; ageStartMa?: number; ageEndMa?: number; discoveryLocation?: string } }`.
  Separate from `tree.json` (Wikidata owns the tree; PBDB owns attributes).
- `genera-index.json` — the playable set (unchanged role: autocomplete = answers = playable).

## 4. Clue mechanic (Plan B)

- The **terminal clade** (§3.2) is the warmest clade warmth can establish short of guessing T;
  its playable members (≤ CAP) are the flat set the player faces.
- **Trigger:** when the player's warmest shared clade equals T's terminal clade
  (`warmestSharedNodeId(state) === terminalClade(target)`), auto-reveal the target's clue from
  `genus-attributes.json`: **when it lived + where it was discovered, both shown together when
  both are present** (either alone when only one is). Not a spent hint — it's the deduction
  tiebreaker.
- Every playable genus has ≥1 clue field (guaranteed by §3.2), so the clue is always present at
  the terminal moment.
- **Known limitation (accepted for v1):** neither field is a perfect discriminator — "where
  discovered" can occasionally give the answer away, and "when lived" may not separate close
  sisters. Showing both together mitigates this. Per-genus **clue curation** (pick the best
  discriminator) is a future refinement; for now, both-at-once is the rule.
- Applies to Daily and Practice; renders in a small panel near the warmest trail (styling
  deferred to the look-and-feel pass).

## 5. Impact & interactions

- **Playable pool 900 → ~696** (minus the clue-availability trim, so ~670). This set **is** the
  game: `dailyAnswer`, `newRoundState`/practice, and the guess autocomplete all draw from
  `playable`. There is no separate answer pool.
- **Daily determinism:** `dailyAnswer` indexes the (smaller) playable pool sorted by numeric
  QID; a rebuild shifting a past date's answer is an accepted v1 risk.
- **Reference explorer unaffected** — shows the full reference pool; unplayable genera stay
  visible (optionally marked; deferred).
- **Existing game code needs no pool change** — it already reads the `playable` flag; the
  rebuild simply narrows it. Plan B adds only the clue mechanic + guess-budget config.

## 6. Plan split

- **Plan A (data):** add sitelink harvest to `fetch-wikidata.ts`; new `fetch-pbdb.ts`; the pure
  terminal-clade + notability-prune functions; rebuild `tree.json` (new `playable`) +
  `genus-attributes.json`. Produces the data the game consumes.
- **Plan B (game):** the clue mechanic (terminal-clade trigger + clue panel) and
  guess-budget-as-config. Consumes Plan A's data.

Plan A alone already fixes winnability (bounded terminal sets + notable answers); Plan B adds
the deduction layer.

## 7. Open / deferred

- `CAP` = 7 (per-genus median → ≤7-sibling endgames, pool ~696). Tunable after playtest — lower
  tightens both the endgame and the pool (they're coupled), e.g. CAP 3 → ~457.
- Exact PBDB fields / discovery-location format — finalized in Plan A against real API output.
- Per-genus clue curation; marking unplayable genera in Explore; guess-budget tuning — deferred.
- All clue-panel styling — the look-and-feel pass.

## 8. Out of scope

- PBDB for taxonomy (tree stays Wikidata-only). Paleo-position clues. Species-level play.
  Runtime PBDB calls (build-time only). Streak/stats.
