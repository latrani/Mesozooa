# Tree dedupe — collapse duplicate-name taxa (the Explore "ghost trees")

## Problem

Explore shows parallel "ghost" subtrees: duplicate Wikidata items for the same taxon,
almost all with lowercase names (`triceratops` under `ceratopsia > …`, alongside the real
`Triceratops` under its full lineage). Confirmed from `tree.json`:

- 2508 nodes; **283** are duplicates by case-insensitive name.
- 258 lowercase-initial nodes, 257 with QIDs ≥ Q124000000 (a recent low-quality Wikidata
  batch). They form near-complete parallel subtrees.
- In every duplicate pair the **higher-sitelink** node is the real one (245 pairs the
  capitalized twin wins, 8 tie, **0** where the lowercase wins). Lowercase nodes have
  sitelinks 0–1 (median 0); most are childless leaves.
- **Game-immune:** 0 duplicate/lowercase nodes are `playable` — the notability prune already
  excluded them. Only Explore (which shows the whole reference tree) surfaces them.

There are also a few **non-case** duplicates (e.g. two `Coelophysidae`), so a lowercase-only
filter would miss them. Dedupe by name is the general fix.

## Decision

Dedupe by case-insensitive name at build time (`assembleTree` in `scripts/`-driven build):
group nodes by `name.toLowerCase()`; within each group **keep one winner**, drop the rest,
and **reparent** any kept node whose parent was dropped onto the winning twin.

### Winner selection (per name group)

Sort the group by, in order:
1. **sitelinks** descending (the real taxon has more Wikipedia presence), then
2. **capitalized name preferred** (tie-break; real taxonomic names are Capitalized).

Keep the top; the rest are "dropped" and mapped to the winner's id.

### Reparenting

Build a `dropped-id → winner-id` map. For every KEPT node, resolve its `parentId` through
that map (a dropped parent becomes its winner twin). Verified against current data: this
leaves **0** kept nodes with a non-kept parent — the tree stays fully connected. Only 7 kept
nodes need reparenting; all resolve to a same-name winner (e.g. `Micropachycephalosaurus`
`ceratopsia`→`Ceratopsia`; `Procompsognathus` dropped-`Coelophysidae`→kept-`Coelophysidae`).

Children of a dropped node are NOT copied to the winner — they independently survive or drop
by their own name group, and reparent through the same map. (A dropped node's real children,
if any, are themselves ghosts and drop too; verified no real subtree is lost.)

### Where it lives

`assembleTree` (`src/lib/tree/assemble.ts`) already reduces raws to root→genus paths and
computes depth/counts. The dedupe is a pass **before** the keep/assemble logic (or folded into
it): operate on the raw taxon list, produce a deduped raw list + reparent map, then assemble as
today. This keeps it TDD-testable as pure logic on `RawTaxon[]`.

Both Wikidata and PBDB enrichment key off ids; dropped ids simply never reach the tree, so no
attribute/clue references dangle (and none were playable anyway).

## Requires a data regeneration

The committed `src/data/tree.json` (+ `genera-index.json`, `genus-attributes.json`) must be
rebuilt: `npm run build:data` (which reads the existing `data/raw-taxa.json` — no re-fetch
needed, the dedupe is pure transform over raws). Verify post-build:
- `Triceratops` appears once; `triceratops` gone.
- No lowercase-initial node except the root (`dinosaur`, which `displayName` renders as
  Dinosauria) — MODULO the ~3 genuinely un-twinned lowercase items (`carnotaurus`,
  `ornithodesmus`, `abelisaurinae`) which have no capitalized alternative.
- Playable pool (674) and game behavior unchanged (0 playable nodes were touched).
- Node count drops ~283.

## Label overrides (run BEFORE dedupe)

Some "real" high-sitelink items have defective Wikidata *labels* while their Wikipedia link
is correct. Confirmed: `Q18510948` is labeled **"Carnottaurus"** (typo, double-t) with 53
sitelinks and `…/wiki/Carnotaurus`; the lowercase ghost `carnotaurus` (Q124748713, 0
sitelinks) is a separate node. A case-insensitive dedupe will NOT merge `Carnottaurus` with
`carnotaurus` (different letters), so without a fix the ghost survives un-twinned and the real
one stays misspelled.

Add a small build-time label-override map, applied to raws **before** dedupe:

```
const LABEL_OVERRIDES: Record<string, string> = { Q18510948: "Carnotaurus" };
```

**Ordering is load-bearing:** apply overrides → THEN dedupe. With the override first,
`Carnotaurus` (Q18510948, 53) and `carnotaurus` (Q124748713, 0) form one name group, and
dedupe keeps the real one, drops the ghost. If dedupe ran first, both would survive and the
rename would produce two "Carnotaurus". The map is also the home for any future one-off label
fixes. (Scan found exactly ONE such typo near-dup tree-wide, so the map starts with one entry.)

Note this dissolves the earlier "un-twinned lowercase survivors" worry: `carnotaurus`,
`abelisaurinae`, `ornithodesmus` are ghosts whose real items either exist (Carnotaurus, via
the override) or reparent onto valid capitalized clades. Any lowercase display residue is a
tiny cosmetic follow-on (extend `displayName` to title-case), explicitly out of scope here.

## Testing

- Pure functions — TDD: label-override applied before dedupe; then a fixture with a Cap/lower
  pair, a non-case dup, a 3-member group, a kept-node-whose-parent-drops (reparent), and an
  override case (`Carnottaurus`→`Carnotaurus` that then merges with a lowercase ghost).
  Assert: overrides run first; winner by sitelinks-then-caps; reparent map correct; every kept
  node's resolved parent is kept or root.
- Existing `assembleTree` / layout / engine tests stay green.
- Post-build data assertions (above) — controller-run after `build:data`.

## Non-goals

- Re-fetching from Wikidata (dedupe is a pure transform over existing raws).
- Filtering at SPARQL-fetch time (post-filter is simpler and testable; revisit if the ghost
  batch grows).
- Title-casing the ~3 un-twinned survivors (separate follow-on).
- Any change to the game pool or warmth/clue data.
