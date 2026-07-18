# Taxonomy source research: can we do better than Wikidata?

**2026-07-17. Status: RESEARCH NOTES, not a design.** Feeds a future brainstorm; nothing here is
decided. Every claim below was verified by live API probe on this date (reproduction commands at
the bottom), not from memory.

## Why this exists

Two problems we'd been tracking as unrelated turn out to be the same problem.

**Symptom 1: Archaeopteryx is a dead guess.** In the committed tree,
`MRCA(Archaeopteryx, Ichthyornis)` = `MRCA(Archaeopteryx, Jeholornis)` =
`MRCA(Archaeopteryx, Velociraptor)` = **Paraves, 329 genera**. The most famous Mesozoic bird is
exactly equidistant from every bird and every raptor, and it's `playable`, so a very common guess
returns near-zero information. Root cause: Wikidata files Paraves with 9 direct children including
a rump **Eumaniraptora (7 genera)** sitting *beside* **Avialae (222)**, **Dromaeosauridae (53)** and
**Troodontidae (38)**, all three of which belong *inside* it in standard usage. Archaeopteryx hangs
off the rump, outside Avialae.

**Symptom 2: genus synonym-merging is blocked on detection.** (See `deferred-findings.md` bucket D.)
Dracorex, Stygimoloch and Pachycephalosaurus are three growth stages of one animal, but Wikidata has
them as three sibling genera under Pachycephalosauria. The doc's own conclusion: detection is the
deeper problem, the known ~9 sinks are a floor rather than a population, there's no cheap structural
detector, and the survivor heuristic (sitelinks) picks backwards in 2 of 8 known cases.

**The shared cause: Wikidata's `parent taxon` is not a cladogram.** It's a single-parent chain
filled in by different editors citing different papers. Where the science is contested (the bird
stem) or where a genus has been sunk (Dracorex), a single-parent chain cannot represent the truth,
so it stores one editor's opinion and drops the rest. Both symptoms are that, surfacing in different
places.

## Sources evaluated

| Source | Verdict | Why |
|---|---|---|
| **Open Tree of Life** (synthesis) | **Unusable** | Prunes extinct taxa from the synthetic tree. Every dinosaur OTT id returns `pruned_ott_id` from `tree_of_life/mrca` and `node_info`. The one source that IS a real synthesized phylogeny contains no fossils. |
| **Open Tree taxonomy** (OTT) | **Too coarse** | Has the taxa (all flagged `extinct`, `incertae_sedis`, `major_rank_conflict_inherited`). Nests Archaeopteryx in Aves, which is the mainstream view, but its lineage jumps `Coelurosauria → Aves`, skipping Maniraptora, Paraves and Avialae. Adopting it would destroy most of the tree's resolution. |
| **OTOL phylesystem** (curated study trees) | **Empty for us** | Real cladograms with fossils, but coverage is 1 study focal to Dinosauria (Puttick et al. 2014), 2 Theropoda, 2 Coelurosauria, and **0** for Avialae, Sauropoda, Ornithischia. Nothing to import wholesale. Notable: what little exists covers the coelurosaur/bird stem, which is exactly our broken region. |
| **PBDB** | **Best candidate, but not a drop-in** | Already in our pipeline. Fixes Archaeopteryx, breaks bird-vs-bird. Knows 3,958 valid dinosaur genera (includes all of modern Aves). Detects synonymy natively. |

### The decisive comparison

| Pair | Wikidata (ours) | PBDB |
|---|---|---|
| Archaeopteryx + Ichthyornis | Paraves (329) ✗ | **Avialae** ✓ |
| Archaeopteryx + Velociraptor | Paraves (329) ✗ | **Maniraptora** ✓ |
| Archaeopteryx + Tyrannosaurus | (n/a) | **Coelurosauria** ✓ |
| **Ichthyornis + Jeholornis** (two indisputable birds) | inside Aves ✓ | **Maniraptora** ✗✗ |

PBDB fixes Archaeopteryx and produces a correct distance gradient out to Tyrannosaurus, then fumbles
two obvious birds into Maniraptora, because it files Jeholornis under `Paraves → Aves` but Ichthyornis
under `Avialae → Ornithothoraces → …`. **Avialae and Paraves are siblings under Maniraptora in PBDB,
just as Avialae and Eumaniraptora are siblings under Paraves in Wikidata.** Same disease, different
organ. PBDB is an opinion hierarchy too. Swapping sources relocates the damage; it does not fix it.

**Conclusion: there is no canonical machine-readable dinosaur cladogram to switch to.** Dinosaur
phylogeny is contested, and every aggregator flattens contested regions into a single parent. This
reads like a data-quality bug but is closer to a map-projection problem: flat and correct are not
simultaneously available from any one source.

## The synonymy connection (the big finding)

PBDB's core competency is tracking taxonomic *opinions*, with authority and opinion records behind
every name, so it models validity and synonymy directly (`taxon_status`, `accepted_name`). Probed
against our exact deferred merge list:

| Genus | PBDB says | Notes |
|---|---|---|
| **Dracorex** | subjective synonym of **Pachycephalosaurus** | **The proven silent case.** No captured `redirectTarget`, all three names agree, nothing in our pipeline flags it. PBDB flags it immediately. |
| **Teyuwasu** | subjective synonym of **Staurikosaurus** | **Sitelinks merges this BACKWARDS** (Teyuwasu sl=16 vs Staurikosaurus sl=0). PBDB names the senior correctly. |
| **Othnielosaurus** | subjective synonym of **Nanosaurus** | **The other backwards case** (sl=17 vs sl=16). PBDB names the senior correctly. |
| Stygimoloch | subjective synonym of Pachycephalosaurus | |
| Cathetosaurus | subjective synonym of Camarasaurus | |
| Dollodon | subjective synonym of Mantellisaurus | |
| Hanssuesia | **valid** | Disagrees with the enwiki redirect (→Stegoceras) |
| Camptodontornis | **valid** | Disagrees with the enwiki redirect (→Longipteryx) |
| Sangonghesaurus | **valid** | Disagrees with the enwiki redirect (→Tianchisaurus) |
| Liassaurus | not in PBDB | |

**6 of 9, including all three hardest cases.** This directly attacks both blockers the deferred doc
calls hard:

1. **Detection.** PBDB gives a systematic detector over every genus at once. The doc's prescribed
   prerequisite ("must FIRST run a complete enwiki-redirect resolution over every genus to discover
   the real sink population") may be unnecessary, or may reduce to a cross-check.
2. **Survivor selection.** PBDB names the senior from published opinion rather than guessing by
   popularity, fixing exactly the 2 of 8 that sitelinks reverses.

The 3 misses are the point, not a defect: where enwiki says "synonym" and PBDB says "valid", that's a
genuine disagreement between two curated sources, and it's a decision for a human, not a heuristic.

## The shape of a fix (for the brainstorm, not decided)

**One PBDB taxonomy fetch answers both problems, through one pattern we have already built.**

The `NAME_DECISIONS` work (`a3179a7`, `bda6e1d`) established exactly the right architecture for this
class of problem: harvest a second opinion, diff it against the first, write a committed
disagreement report, **fail the build while any disagreement is undecided**, and resolve via a
curated map keyed by Q-id. That pattern generalizes from names to structure and synonymy without
modification.

Sketch:

- Add a PBDB **taxonomy** fetch (we currently pull only occurrences, for clues). Endpoint:
  `taxa/list.json?base_name=Dinosauria&rel=all_children&show=parent`. Needs pruning (PBDB's
  Dinosauria includes modern Aves) and name-matching to Q-ids (same bare-name join we already do for
  clues, so it inherits the homonym risk logged in bucket D).
- **Structure:** diff the PBDB parent chain against Wikidata's per node. Report disagreements. The
  broken region is small: Paraves has 9 direct children and the mangle is confined to roughly 5 nodes
  (Eumaniraptora, Deinonychosauria, Avialae, Dromaeosauridae, Troodontidae). A curated
  `PARENT_DECISIONS` map of about a dozen lines may be the whole fix. Paraves is 329 genera, ~18% of
  the pool, so it is not a niche correction.
- **Synonymy:** consume `taxon_status` + `accepted_name` as the detector and the forced-merge-target,
  cross-checked against the enwiki redirect signal. Disagreements (the 3 above) go to a decisions map.

## The central question: structural dependency, or advisory?

**This is the decision the brainstorm exists to make. Everything else follows from it.**

**Option A — PBDB as a structural dependency.** Its parent chain feeds the tree directly, wholly or
for a region. Less hand-curation, and it scales without a human in the loop. But it imports PBDB's
own flattening: adopt it for the bird stem and Ichthyornis + Jeholornis land at Maniraptora, which
is *worse* than what we ship today. You'd be trading a known wrong answer for a different wrong
answer that nobody has reviewed.

**Option B — PBDB as advisory (report-only).** PBDB is never read at runtime and never writes the
tree. It's a second opinion that produces a **committed disagreement report**; the build fails while
any disagreement is undecided; every actual change lands in a human-curated decisions map. Keeps one
source of truth for structure, matches the `NAME_DECISIONS` precedent exactly, and means no
structural change ever enters the tree without someone having looked at it. Costs hand-curation
proportional to disagreement count (unknown, needs measuring — but for the *structure* problem the
broken region looks like ~5 nodes, not 500).

### The reframe that matters

The instinctive objection to Option B is "a curated backbone means *we're* asserting a phylogeny,
and who are we to do that?"

**But we are already asserting one.** Every tree is an assertion. Right now we assert Wikidata's, by
default, silently, and without review. That is not a more neutral position than curating, it is the
same act performed unconsciously, and it is how Archaeopteryx became a dead guess without anyone
deciding it should be. The choice was never "assert a phylogeny vs. don't." It's "assert one
deliberately vs. inherit one accidentally."

So the deliverable here may not be a fix at all. **It may be making the assertion deliberate** —
turning an invisible inherited default into a reviewed, versioned, intentional statement about what
this tree claims. The disagreement report is the mechanism that makes it visible; the decisions map
is where the claim gets stated out loud. That's the same reason the name-disagreement gate exists:
not because names are hard, but because a silent wrong answer is worse than a loud undecided one.

If that's right, the success criterion isn't "Archaeopteryx guesses better." It's "no structural
claim in this tree is unreviewed," and Archaeopteryx falls out for free.

### Other open questions

- Do we override parents at all, or only where the two sources disagree AND a human decided?
- Scope: the whole backbone, or only the contested bird stem? A general mechanism invites general
  use; a Paraves-only override is honest about being a patch on one known-broken region.
- Homonym risk compounds: joining PBDB taxonomy by bare genus name has the same collision problem
  that mis-dated Cardiodon and Alocodon (bucket D). Constraining by `base_name=Dinosauria` likely
  fixes both at once.
- Does the Puttick et al. 2014 phylesystem tree cover the Paraves backbone well enough to be worth
  reading as a third opinion for exactly the broken region?
- How many structural disagreements are there really? Option B's cost is entirely that number, and
  we have not measured it. That's probably the first thing to find out, and it's cheap: one fetch and
  one diff, no changes to the tree.

## Reproduce

```sh
# OTOL prunes fossils from the synthetic tree
curl -s -X POST https://api.opentreeoflife.org/v3/tnrs/match_names \
  -H "content-type:application/json" -d '{"names":["Archaeopteryx"]}'   # -> ott3604083
curl -s -X POST https://api.opentreeoflife.org/v3/tree_of_life/node_info \
  -H "content-type:application/json" -d '{"ott_id":3604083}'            # -> pruned_ott_id

# PBDB lineage: Archaeopteryx sits in Avialae (mainstream), unlike Wikidata
curl -s "https://paleobiodb.org/data1.2/taxa/list.json?name=Archaeopteryx&rel=all_parents"

# PBDB synonymy: the detector we're missing
curl -s "https://paleobiodb.org/data1.2/taxa/single.json?name=Dracorex"  # -> subjective synonym of Pachycephalosaurus
```

## See also

- `deferred-findings.md` bucket D: "Paraves is flattened…", "PBDB homonym contamination…",
  "Genus synonym-merging".
- `src/lib/tree/name-decisions.ts` + `data/name-disagreements.md`: the fail-closed curation pattern
  this would extend.
