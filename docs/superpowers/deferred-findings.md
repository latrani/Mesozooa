# Mesozooa — Deferred Findings (retired → GitHub issues)

**This backlog moved to GitHub issues** (`latrani/Mesozooa`, 2026-07-18). New deferred work,
design problems, and accepted tradeoffs are filed there, not here — see CLAUDE.md → *Working
agreements → Tracking deferred work* for the label conventions (`epic` / `tech-debt` /
`by-design` / `wontfix`).

Fast filters:
- Open work: <https://github.com/latrani/Mesozooa/issues>
- The taxonomy epic (Wikidata's `parent taxon` is not a cladogram): [#13](https://github.com/latrani/Mesozooa/issues/13)
- Accepted-as-correct, filed closed: [`by-design`](https://github.com/latrani/Mesozooa/issues?q=is%3Aissue+label%3Aby-design)

This file now keeps only two things issues don't want: the **accepted micro-tradeoffs** (too
trivial for even a closed issue — recorded so they aren't "rediscovered" as new in review) and the
**Resolved log** (history; don't re-litigate).

---

## Accepted micro-tradeoffs — intentionally left as-is

Judged not worth changing *or* worth a tracked issue. If a review re-raises one of these, it's a
known, accepted call — not a new finding.

- `assemble.ts` BFS uses `queue.shift()` → O(n²). Build-time only, ~2k nodes. Fine.
- `fetch-wikidata.ts` builds a redundant intermediate Map. Harmless, build-time.
- `fetch-wikidata.ts` `rankId` assumes ≤1 `P105` (rank) statement per taxon; multiples would dup
  rows (benign — `byId`/`assembleTree` dedup by id).
- `build-tree.ts` `dataVersion` uses UTC `toISOString()` (can be a day ahead of local). Cosmetic
  build stamp. (The *daily* date was fixed to local in Plan 2b; this build stamp was not.)
- `engine-core.ts` `store.getNode(id)!` non-null assertions — safe by `TreeStore` invariants.
- `warmestSharedNodeId` ranks by raw `descendantGenusCount`, bypassing the `WarmthProvider` —
  equivalent for the default `CountWarmth`. Unify only if a non-count provider is ever added.
- Unreachable defensive branch in `applyHint` (`nextHintNode` null when `w === target`) is untested;
  reachable only after a win, which `status !== "playing"` already short-circuits.
- `scripts/pbdb.ts` `batch.includes(g)` is O(n²) per batch (BATCH=80, network-bound — negligible);
  linear retry backoff.
- `pbdbAges` first-record-wins (`!out[g]`) is order-dependent under a cross-kingdom name **homonym**
  in the same batch; committed `raw-pbdb.json` freezes the result (deterministic build). Low
  incidence for dino names. (The structural homonym question is epic [#13](https://github.com/latrani/Mesozooa/issues/13).)
- **Parenthetical subgenus names drop the age (Poekilopleuron)** — PBDB files some genera under a
  `Genus (Subgenus)` name (e.g. `Megalosaurus (Poekilopleuron)`). `genusOf()` in `scripts/pbdb.ts`
  splits on the first space → keys the age to the outer genus, so the subgenus never receives its
  (perfectly good) interval label and gets pruned for a missing age. Only known casualty so far:
  Poekilopleuron. Fix would teach `genusOf` to handle the parenthetical form.

---

## Resolved (kept for reference — don't re-litigate)

- **Leaf-disambiguation Plan B (the clue mechanic)** — BUILT. `leafHintActive` + the `leafHint`
  guess kind + `clueFor` are live in `engine-core.ts`; the terminal-clue flow ships. (The old
  "Plan B still to build" note was stale.)
- **Per-image attribution** — RESOLVED (branch `local-images-attribution`, 2026-07-17).
  `scripts/fetch-images.ts` harvests Commons `imageinfo`/`extmetadata`; `formatCredit` formats;
  `build-tree.ts` bakes `imageAuthor`/`imageLicense`/`imageLicenseUrl` + local `/images/<Qid>.webp`
  paths; `SpecimenCard.svelte` renders the credit. 1663 images credited, 0 non-free, images
  localized (no runtime Commons hotlink) and downscaled to WebP (370MB→53MB). Specs
  `2026-07-17-local-images-attribution-design.md` + `2026-07-17-image-downscale-webp-design.md`.
- **highlightId not reset on new round** — fixed at Plan 2 finish (`2aac6ae`).
- **Daily UTC-drift** — `todayString` uses local date components (Plan 2b).
- **Hint-reveals-target soft-lock** — dup guard scoped to `kind:"guess"` (`5b27e8d`, with test).
- **Monotypic hint-walk stall** — `nextHintNode` walks from the deepest revealed lineage node
  (`ae7d43e`, with test).
- **Plan 2b code-quality fast-follows** (`fe5ae96`): share/budget cap derived from `maxGuesses`;
  strict daily deserialize (guess-row shape + `mode`); stale localStorage keys pruned on load;
  `canHint` reflects real hint availability (`nextHintNode`).
- **mrca unknown-id contract** — the game validates guesses against the playable pool
  (`gameEngine`/`isPlayable`), so `mrca` is never fed an unknown id in play.
- **PBDB locations at 14%** — `pbdbLocations` queried `taxon_name` (misses species-level
  occurrences); switched to `base_name` → 72% (`3f457d3`).
- **Raw country codes in clues** — PBDB emits `UK` (not ISO `GB`); expanded `COUNTRY_NAMES` to cover
  all observed codes + rebuilt → 0 raw codes (`3238c81`).
- **Lowercase clade label "bird" (Aves) + "dinosaur" (Dinosauria)** — the name-disagreement system
  (`a3179a7`) made these explicit `NAME_DECISIONS` (vernacular→scientific); the tree now carries
  `Aves`/`Dinosauria` directly. 0 lowercase-initial names in the rebuilt tree.
- **Label-less nodes rendering as bare Q-ids (incl. Troodon)** — Wikidata items with no `en` label
  fell back to the Q-id placeholder. Fixed by harvesting P225 (taxon name) + enwiki title and
  resolving names from the best available source (`a3179a7`); 0 bare Q-id names in the rebuilt tree.
- **Game tree genus-counts + branch hover-tip** — whole-tree `descendantGenusCount` beside game
  clade labels was a confusing non-playable signal; removed via a `showCounts` prop (Explore keeps
  them). Guessed-at-branch hover tooltip removed entirely (`16808b6`).
