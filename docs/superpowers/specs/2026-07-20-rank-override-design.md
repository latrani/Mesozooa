# Rank override: recover genera Wikidata mis-tagged as species

**2026-07-20. Status: DESIGN, approved for implementation. Closes the design portion of #43.**

## Problem

A handful of real dinosaur genera never enter the tree because their Wikidata **genus item** carries
`P105 (taxonomic rank) = Q7432 (species)` instead of `Q34740 (genus)`. `assembleTree`
(`src/lib/tree/assemble.ts`) keeps only nodes on a root→**genus** path (`rankId === RANK_GENUS`), so a
genus item that claims to be a species is dropped along with its whole lineage — it never reaches
`raw-taxa.json`, never gets enriched, never appears in Explore or the game.

Issue #43 framed this as "genus item **not** rank-tagged." The live data (2026-07-20) shows it is
subtly different and more tractable: the items **are** tagged — mis-tagged **as species**. That is a
detectable, correctable signal, not an absence.

## Measured population: exactly 3

A full WDQS sweep of every species-ranked taxon under Dinosauria (`raw-taxa` join + parent-rank),
2026-07-20, funnels cleanly:

| Filter | Count |
|---|---|
| species-ranked (`P105=Q7432`) under Dinosauria | 25,080 |
| …parented to a **non-genus** clade (excludes genus-parented synonyms) | 198 |
| …with a **single-word en label** (genus-shaped, not a binomial/vernacular) | 16 |
| …**with an en label at all** and parent rank ∉ {species, subspecies} | **3** |

The 3:

| Q-id | Genus | Wikidata parent | genus-item sitelinks |
|---|---|---|---|
| `Q122069485` | **Eodromaeus** | Theropoda (clade) | 19 |
| `Q95715804` | **Overoraptor** | Saurischia (order) | 10 |
| `Q72914385` | **Nemegtonykus** | Parvicursorinae (subfamily) | 9 |

The other 13 of the 16 are all **labelless** (the "label" is just the Q-id echoed back): 12 are modern-
bird / infraspecific stubs parented to bird families or individual bird species ("Common Quail",
"House Sparrow", "Osprey", a *Stiphrornis* subspecies), and 1 (`Q130390510`) is an anonymous abelisaur-
adjacent stub with no en label and `sitelinks = 0` — nothing to display or search even if promoted.
None is a recoverable genus. (Appendix at bottom lists them so this is not re-surveyed.)

## Decision: curated override, not a heuristic

A structural auto-detector was considered and **rejected**. The parent-rank gate alone yields 198
false positives (the living-bird tree); surviving to 3 requires stacking single-word-label +
label-present + parent-rank-not-species filters that were hand-tuned against this exact dataset. That
is a large, fragile, false-positive-prone machine **running every harvest to catch a population of 3.**
YAGNI: curate the 3.

**Fix:** a curated `RANK_OVERRIDES: Record<string, string>` map (Q-id → rank Q-id), mirroring the
existing `NAME_DECISIONS` pattern, applied in `fetchStructure` (`scripts/fetch-wikidata.ts`) at the
point each `RawTaxon`'s `rankId` is assigned:

```ts
// scripts/fetch-wikidata.ts, inside fetchStructure's row loop:
const rawRank = r.rank ? qid(r.rank) : null;
raws.push({
  id: qid(r.taxon!),
  name: qid(r.taxon!),
  rankId: RANK_OVERRIDES[qid(r.taxon!)] ?? rawRank,
  parentId: qid(r.parent!),
});
```

```ts
// new: src/lib/tree/rank-overrides.ts
// Wikidata genus items mis-tagged P105=species; override to genus so assembleTree keeps them.
// Each verified by WDQS sweep 2026-07-20 (single-word label, real clade parent, has en label).
export const RANK_OVERRIDES: Record<string, string> = {
  Q122069485: "Q34740", // Eodromaeus — P105=species, parent Theropoda; basal theropod, Late Triassic
  Q95715804:  "Q34740", // Overoraptor — P105=species, parent Saurischia; Late Cretaceous
  Q72914385:  "Q34740", // Nemegtonykus — P105=species, parent Parvicursorinae; alvarezsaurid, Late Cretaceous
};
```

Applying the override in `fetchStructure` means the corrected rank propagates through *everything*
downstream — the structural `assembleTree` scope, enrichment (incl. the species-cluster article
resolution), the PBDB name join, and the build — with no other change.

## Future-proofing: a candidate report, not auto-action

The build (`build-tree.ts`, or a fetch-time check) emits a **candidate report**: any taxon that is
species-ranked, has a **single-word en label**, is parented to a **non-genus, non-species** clade, and
is **not** already in `RANK_OVERRIDES`. Today that list is empty. If a future harvest surfaces a new
mis-tagged genus, it appears in the report so a human notices and adds it — without the build
silently acting on a heuristic. This is the same "surface loudly, decide deliberately" philosophy as
the name-disagreement gate, minus the fail-closed hard stop (a missed promotion is a quiet omission,
not a data corruption, so it warns rather than blocks).

## Scope: full recovery — and all 3 will be playable

Promotion makes the 3 **genus nodes with an Explore entry + Wikipedia link**, AND — verified against
PBDB directly (2026-07-20) — **all three have a full age+location clue**, so once promoted they enter
`raw-taxa.json`, the next `fetch:pbdb` queries them, and they clear the clue gate:

| Genus | PBDB age | PBDB location |
|---|---|---|
| Eodromaeus | Carnian | Argentina (San Juan) — Ischigualasto |
| Overoraptor | Cenomanian–Turonian | Argentina (Río Negro) |
| Nemegtonykus | Maastrichtian | Mongolia (Ömnögovi) |

(An earlier draft claimed these lacked PBDB data — that was a false read: grepping `raw-pbdb.json`
only shows names we *queried*, and these were never queried because they were never in `raw-taxa.json`.
Direct PBDB lookup confirms all three are valid genus records with occurrences.)

So the realistic outcome is **full playability**, contingent only on the per-clade cap competition —
which brings a hard dependency:

## HARD DEPENDENCY: the playable-override must land first (Tawa)

Eodromaeus (genus-item sitelinks **19**, clue: Carnian/Argentina) resolves into the **Theropoda-direct
terminal clade** — the *same* cap-7 bucket as **Tawa** (sl=14), where Tawa is currently the #7/last
playable slot. Simulation (2026-07-20, `prunePlayable` re-run with Eodromaeus injected) is unambiguous:

```
KEEP  Eodromaeus  sl=19   <- takes a slot
KEEP  Siats       sl=19
cut   Tawa        sl=14   <- BUMPED to #8
```

**Shipping rank-override alone bumps Tawa out of the playable pool.** Since Tawa (Ghost Ranch, camp
week) is a must-keep, the always-playable **playable-override feature** (issue #44-adjacent) is a
**prerequisite**, not a follow-on: pin Tawa first, then promote Eodromaeus. Sequencing:

1. Build the playable-override allowlist; add **Tawa** (and any other camp locals).
2. *Then* ship this rank-override.

Alternative if the override slips: temporarily hold Eodromaeus out of `RANK_OVERRIDES` (ship only
Overoraptor + Nemegtonykus, which land in other clades and displace no one), and add Eodromaeus once
Tawa is pinned. Do NOT ship Eodromaeus before Tawa is protected.

Recovery success criterion: **the 3 appear as genus nodes with Wikipedia links AND become playable**,
with Tawa still playable (guaranteed by the override, per the dependency above).

## Out of scope

- **Tawa cap-collision protection — moved to a HARD DEPENDENCY above, not out of scope.** Eodromaeus
  does have a clue and *does* bump Tawa (verified, not hypothetical). Rather than a bespoke guard in
  this spec, Tawa is protected by the playable-override feature, which becomes a prerequisite. See
  "HARD DEPENDENCY" above.
- **Auto-detection heuristic.** Rejected (see Decision).
- **Diplodocus hallorum** (from #43's original list). It has a **binomial** label — it is a genuine
  *species* article (the former "Seismosaurus"), not a mis-tagged genus. This fix correctly does not
  touch it; if its recovery is ever wanted, that is a different mechanism.
- **Sellosaurus and other genus-parented synonyms.** A single-word species-tagged taxon whose parent
  **is a genus** (Sellosaurus → Plateosaurus) is a probable genus-level synonym; promoting it would
  create genus-under-genus structure. Left for the #13 synonymy/forced-merge work; the parent-is-genus
  case is explicitly excluded by the override being curated (we simply don't list them).
- **Cap tuning** (#45, decided: keep 3–7).

## Success criteria

- `RANK_OVERRIDES` contains the 3 Q-ids; after `fetch:wikidata` + `build:data`, Eodromaeus,
  Overoraptor, and Nemegtonykus each appear as a genus node in `src/data/tree.json` with their
  Wikipedia link, under their correct clade parent (Theropoda / Saurischia / Parvicursorinae).
- The candidate report runs and (today) lists no un-covered candidates.
- All 3 become **playable** (they have PBDB clues) and appear in `genera-index.json`.
- **Tawa remains playable** — the override prerequisite is satisfied before Eodromaeus is promoted.
- Existing guards do not trip; playable pool does not shrink (net add: +3 promoted, −0 if Tawa pinned).
- `npx tsc --noEmit`, `npx vitest run`, `npx svelte-check` clean.

## Appendix: the 13 non-cases (do not re-survey)

All single-word-or-Q-id, clade/species-parented, species-ranked — excluded because **labelless**
(no en label → nothing to display or search):
`Q130390510` (Abelisauridae/Furileusauria — anonymous abelisaur stub, sl=0), `Q137995850`
(Hemiprocnidae), `Q138828198` (Caprimulgidae), and 10 parented to individual modern-bird species or a
*Stiphrornis* subspecies (`Q131457259/274/292`, `Q131466226`, `Q131535068/211/212`, `Q97658717/718`).
Modern-bird / infraspecific noise; none recoverable.
