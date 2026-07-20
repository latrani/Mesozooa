# Species-cluster resolution: reading a genus's Wikipedia identity from the right entity

**2026-07-20. Status: DESIGN, approved for implementation planning.**

## Problem

A genus's enrichment metadata — the enwiki article, the sitelink count, the image — is scattered
across its Wikidata **entity cluster** (the genus item plus its child *species* items), and the genus
item is systematically the *wrong* place to read it. We harvest only the genus item, so we read the
wrong entity and silently degrade the data.

The banner case: **Cryolophosaurus**. The genus item (`Q18511006`) has `sitelinks: 0` and **no**
enwiki article — the English Wikipedia article "Cryolophosaurus" is attached to the *species* item
`Q131166` (*C. ellioti*), which has 36 sitelinks. **Nigersaurus** is identical: genus `Q18511062`
has one non-English sitelink and no article; species `Q131407` holds the article and 30 sitelinks.

This is not monotypy-specific and not an edge case. Measured over our **2,074 harvested genera**
(read-only probe, 2026-07-20, `scratch/probe-species.ts` against all Dinosauria genus+species):

- **441** genera have no enwiki article on the genus item.
- **114** of those are *rescuable* — a child species has an article. (327 have no article anywhere.)
- In **110 of 114** rescuable cases, a child species is **more notable** (higher sitelinks) than the
  genus item. The gap is severe: Amargasaurus genus `sl=0` vs species `sl=37`; Cryolophosaurus 0→36;
  Nigersaurus 1→30. A murderer's row of famous genera (Bagaceratops, Balaur, Tyrannotitan,
  Australovenator, Metriacanthosaurus, Tianyuraptor) reads `sl=0–2` on the genus item.
- Independent of playability, the "Cryolophosaurus pattern" (image on the genus item, article on a
  species) appears **710** times across Dinosauria — proof that the fields scatter *per field*, not
  as a block.

What actually changes for the **114 rescued** (scoped) genera, by field:

- **60** — the Cryolophosaurus pattern: image already on the genus item, so they gain **article +
  sitelinks**; the image is unchanged (the resolution rule keeps the genus's own image).
- **27** — no genus image but a species has one: gain **article + sitelinks + image**.
- **27** — no image anywhere: gain **article + sitelinks** only.

So for the Cryolophosaurus-pattern majority, the improvement is the article (which unlocks
playability + the Explore link) and the corrected notability count — *not* the image, which was the
one field already filed on the right entity.

### Why this matters — the three downstream consumers

The scattered fields drive three things, all corrupted at once when we read the genus item:

1. **Playability gate** (`playable.ts:58`): `n.playable = n.isGenus && !!n.wikipediaUrl`. No article →
   `playable: false`. Cryolophosaurus can never be a guess or an answer.
2. **Explore Wikipedia link**: end-state link labels only fire on playable/revealed nodes with a URL.
   No article → no link (issue #2's original symptom).
3. **Per-clade notability rank** (`prunePlayable`, `playable.ts:93`): within a terminal clade, the
   highest-sitelinks genera win the adaptive-cap slots. Reading `sl=0` for a famous genus ranks it
   dead-last — so even a *made-playable* Cryolophosaurus would lose its slot to obscure siblings.

A fourth consumer — `dedupeRaws` survivor-selection — also reads sitelinks, but its problem is
different in kind (see **Out of scope**).

### This is orthogonal to the tree's shape (epic #13)

Epic #13 is about *edges*: Wikidata's single `parent taxon` chain isn't a cladogram, so contested
regions (the bird stem) are flattened. This problem is about *node metadata*: a genus's identity is
misfiled across its entity cluster. The two do not intersect. A perfect cladogram would still leave
Cryolophosaurus's article on the species item and the genus reading `sl=0`; the worst scatter occurs
in *uncontested* regions (Amargasaurus). Fixing structure would not fix this, and fixing this needs
no structural change. **#13 is explicitly out of this spec.**

## What `sitelinks` means (working definition)

> **`sitelinks` = the count of wiki-project pages (`wikibase:sitelinks`, ≈ language-Wikipedia
> articles) linking to a given Wikidata *entity*. We treat it as a notability *proxy* for the
> animal.**

The proxy is reasonable (a famous dinosaur gets many language articles) but it is a proxy, not a
measured quantity, and it is **entity-scoped** — it measures coverage of the item you read it from.
The scatter corrupts it precisely because we read it from the genus item, which often carries none of
the animal's coverage. Resolution does not make sitelinks a *better* metric; it makes us read the
metric from the *right* entity.

## Design

### Principle

Resolve each genus to a **representative Wikipedia identity** across its entity cluster, at harvest
time. The cluster is `{genus item} ∪ {its child species items}`. The representative is chosen by
notability, with **no privilege given to the genus item** — a better-articled species wins.

### Scope of change

Entirely within `scripts/fetch-wikidata.ts`. The committed `raw-taxa.json` keeps its current shape —
**genus-level plus ancestors, no species**. Species are a *transient enrichment input* that never
survives to the file. Therefore `build-tree.ts`, `assembleTree`, `dedupeRaws`, the tree invariant,
and every runtime consumer are **untouched**. Species never become tree nodes; the "one tree,
genus-level" model (CLAUDE.md) is preserved.

### Pipeline (new steps marked ★)

1. `fetchStructure()` — unchanged. All `wdt:P171* wd:Q430` (Dinosauria), all ranks.
2. `pruneSubtree(structure, NEORNITHES)` — unchanged. Removes the modern-bird crown subtree.
3. `assembleTree(pruned, DINOSAURIA, "structural")` → `scopedIds` — unchanged. The genus-keep prune
   (keep only nodes on a root→genus path); this is what drops species today, and we keep it.
4. **★ `fetchClusterSpecies(genusIds)`** — one SPARQL, `VALUES ?genus { … }` bound to our in-scope
   genus ids, `?sp wdt:P171 ?genus`. Returns child-species ids grouped by genus. **Anchoring to our
   genera is load-bearing**: it means bird-of-paradise hybrids and other junk species (which are
   orphans with no valid genus parent, seen in the probe) can never attach. Volume is small — ~2,047
   species for our genera, ≈6 batches of 400, trivial at build time.
5. `enrich(scopedIds ∪ speciesIds)` — the existing enrichment query, fed the union of genus and
   species ids. Every genus AND child species gets label / P225 / P18 image / enwiki article /
   sitelinks.
6. **★ `resolveClusters()`** — for each genus, apply the resolution rule below and fold the result
   onto the genus `RawTaxon`. Discard all species objects after this step.
7. `resolveRedirects()` — unchanged. Runs on the resolved genus set.
8. Write `raw-taxa.json` — genus-level, now with correctly-resolved article / sitelinks / image.

### Resolution rule

For a genus `g` with cluster `C = {g} ∪ species(g)`:

- **Representative** = among entities in `C` that **have an enwiki article**, the one with the most
  sitelinks (ties broken by ascending Q-id — the same deterministic tie-break `prunePlayable` already
  uses at `playable.ts:93`).
- `wikipediaUrl` ← representative's article.
- `sitelinks` ← **that same representative's** sitelinks. Reading the count from the *articled*
  representative (not `max()` over the whole cluster) keeps notability coherent with linkability: the
  number always describes the exact entity a player can click through to. An articleless species with
  a higher count does not inflate the rank of an unreachable thing.
- If **no** entity in `C` has an article → no representative → the genus keeps whatever it natively
  had (normally: no article, `sitelinks: 0`) → remains not playable. This is the correct outcome for
  the 327 genera with no English coverage anywhere.
- **Image** resolves *independently* of notability (an image is not a notability signal): prefer the
  genus item's own P18; else the representative's; else any child species with one.

### Provenance

When the representative is a species (not the genus item), record `resolvedFrom: <speciesQid>` on the
genus `RawTaxon`. This makes the assertion visible and auditable — matching the `NAME_DECISIONS`
philosophy that a resolved value should never be silently indistinguishable from a native one. The
`build:data` data-quality report gains a line: `resolved via species: N genera`.

### Data-model change

`RawTaxon` gains one optional field: `resolvedFrom?: string`. No other type changes; article,
sitelinks, and image reuse existing fields. `resolvedFrom` is harvest-only provenance — it does not
need to propagate into `TreeNode` unless a later consumer wants it (none does today).

### Notability rank fix (falls out for free)

The per-clade notability rank in `prunePlayable` reads `node.sitelinks`. Because resolution writes the
correct value into `raw-taxa.json` upstream, the rank is fixed with **no change to `prunePlayable`
itself** — it simply reads honest numbers. The 110 rescued genera stop sorting dead-last in their
terminal clades. This is the second of the two legitimate notability uses; both (gate + rank) are now
correct.

## Out of scope

- **Epic #13 (tree shape).** Explicitly excluded; orthogonal (see above).
- **`dedupeRaws` survivor-selection.** `dedupe.ts:29` picks the surviving item of a duplicate-name
  group by sitelinks. This is a **misuse** of the proxy: choosing the *senior/valid* name of a
  synonym pair is a published-taxonomic-opinion question, not a popularity question, and the research
  doc (`2026-07-17-taxonomy-source-research.md`) found sitelinks picks **backwards** in 2 of 8 known
  cases (Teyuwasu, Othnielosaurus). The correct signal is PBDB `taxon_status` / `accepted_name`,
  which **is** the #13 synonymy work. Resolution improves the *inputs* to this pick (a genus now
  carries its true count) but does not fix the wrong-question problem. Left to #13; documented here so
  it is not re-flagged as part of this change.
- **Genus-less species (rank-tag gap).** ~30 taxa (Eodromaeus, Overoraptor chimentoi, Nemegtonykus,
  Diplodocus hallorum) have an enwiki article on a *species* whose parent genus item exists but is
  **not tagged `rankId = genus`** in Wikidata, so our `RANK_GENUS` filter in `assembleTree` drops the
  whole lineage. This is a distinct mechanism (rank inference, not cluster resolution) and a distinct
  fix. **File as a separate GitHub issue** (`tech-debt`); out of scope here.
- **Homonym-poisoned PBDB clues (#13).** The PBDB join is by bare genus name (`build-tree.ts:116`),
  so a genus sharing its name with a non-dino taxon inherits the wrong occurrences — a confident-wrong
  clue. Resolution does **not** touch the join key (it donates only article/sitelinks/image, never
  `name`), so it introduces **zero** new mismatches. But it *does* change one thing: a poisoned genus
  that was hidden by non-playability can now become playable and thus *surface* its latent bad clue.
  Audit of all 108 newly-exposed clues (2026-07-20, against `raw-pbdb.json`) found exactly **one**
  poisoned case — **Alocodon** (a Jurassic ornithischian PBDB dates to the Eocene via a homonym) — and
  it is already dropped by the Mesozoic date gate (`isMesozoic` false), so it never actually reaches a
  specimen card. No **Mesozoic-vs-Mesozoic** homonym (the class the date gate *cannot* catch) is
  present in the rescued set. Net: resolution un-masks one latent lie that another guard already
  swallows; the general fix (a `base_name=Dinosauria`-scoped PBDB join) remains #13's job.

## Success criteria

- Cryolophosaurus and Nigersaurus are playable, link to their enwiki article in Explore, and show
  their PBDB clue (age + location) in the specimen card. (Both have full PBDB data already; the only
  blocker is the missing article gating them out of `genus-attributes.json`.)
- The ~114 rescuable genera gain articles; the ~110 with a more-notable species gain honest sitelink
  counts and stop ranking dead-last in their terminal clades.
- `raw-taxa.json` shape is unchanged except the new optional `resolvedFrom` field; `tree.json` node
  shape is unchanged.
- The build-data regression guards (GUARD 1/2 in `build-tree.ts`) do **not** trip — this change
  should *increase* the playable pool, never shrink it. Expect the playable count to rise.
- Data-quality report prints `resolved via species: N genera`.

## Verification approach

- Read-only probe already run (`scratch/probe-species.ts`, `scratch/probe-scoped.ts`) established the
  population. Keep as evidence; scratch/ is gitignored.
- Pure resolution logic (given a cluster, pick the representative + image) is TDD-tested in isolation
  — it is a pure function over `{genus, species[]}`, easy to unit-test with the Cryolophosaurus /
  Nigersaurus / no-article / polytypic-tie cases.
- Full harvest re-run validated by: Cryolophosaurus + Nigersaurus present in `genera-index.json`, the
  playable count rising (not falling), and spot-checking the `resolvedFrom` report against the probe's
  114-genus list.
- `npx tsc --noEmit` for the `RawTaxon` type change (verbatimModuleSyntax is on).
