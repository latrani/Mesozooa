# Species-Cluster Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read each genus's Wikipedia identity (enwiki article, sitelinks, image) from the most-notable *articled* entity in its Wikidata genus+species cluster, instead of blindly from the genus item — fixing ~114 famous-but-invisible genera (Cryolophosaurus, Nigersaurus, Amargasaurus).

**Architecture:** All change is confined to the harvest layer (`scripts/fetch-wikidata.ts` + one new pure helper module). We fetch each in-scope genus's child species, enrich them with the *existing* enrichment query, resolve a representative per genus with a pure function, fold its article/sitelinks/image onto the genus `RawTaxon`, then discard the species. The committed `raw-taxa.json` stays genus-level (plus one new optional `resolvedFrom` field); `build-tree.ts`, `assembleTree`, `dedupeRaws`, and every runtime consumer are untouched.

**Tech Stack:** TypeScript (Node, run via `tsx`), Vitest for pure-logic tests, Wikidata Query Service (SPARQL). `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`.

## Global Constraints

- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Run `npx tsc --noEmit` before committing; Vitest does NOT catch violations.
- **Pure logic is TDD-tested** (Vitest). Scripts that hit the network are validated by a real harvest run, not unit tests.
- **One tree, genus-level.** Species are a transient enrichment input; they MUST NOT survive into `raw-taxa.json` or become tree nodes.
- **Resolution donates article + sitelinks + image ONLY — never `name`.** The downstream PBDB join keys on `node.name`; changing it would break clue matching.
- **Merge workflow:** commit with `Closes #N` where applicable, but do NOT push — the user pushes. Work on `main` (no PRs).
- **Determinism:** sitelinks ties break by ascending Q-id (matches `playable.ts:93`).

---

### Task 1: Add `resolvedFrom` provenance field to `RawTaxon`

**Files:**
- Modify: `src/lib/tree/types.ts:9-20`

**Interfaces:**
- Consumes: nothing.
- Produces: `RawTaxon.resolvedFrom?: string` — the species Q-id an article/sitelinks/image was resolved from, present only when the representative was a species (not the genus item).

- [ ] **Step 1: Add the optional field**

In `src/lib/tree/types.ts`, add one line to the `RawTaxon` interface (after `redirectTarget`):

```typescript
export interface RawTaxon {
  id: string;
  name: string;
  rankId: string | null;
  parentId: string | null;
  imageUrl?: string;
  wikipediaUrl?: string;
  sitelinks?: number;
  taxonName?: string;      // Wikidata P225 (taxon name); may differ from the en label
  enwikiTitle?: string;    // enwiki article title (independent name signal)
  redirectTarget?: string; // if the enwiki article redirects, its target title (advisory only)
  resolvedFrom?: string;   // species Q-id whose article/sitelinks/image were folded onto this genus
}
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors (the field is optional; nothing else references it yet).

- [ ] **Step 3: Commit**

```bash
git add src/lib/tree/types.ts
git commit -m "feat(harvest): add RawTaxon.resolvedFrom provenance field"
```

---

### Task 2: Pure `resolveCluster` function + tests

This is the heart of the feature — a pure function over `{genus, species[]}` that picks the representative and returns the fields to fold. Isolated in its own module (mirrors `scripts/enwiki-title.ts`) so it is fully unit-testable without the network.

**Files:**
- Create: `scripts/resolve-cluster.ts`
- Test: `scripts/resolve-cluster.test.ts`

**Interfaces:**
- Consumes: `RawTaxon` (from `src/lib/tree/types`).
- Produces:
  - `interface ClusterResolution { wikipediaUrl?: string; enwikiTitle?: string; sitelinks: number; imageUrl?: string; resolvedFrom?: string; }`
  - `resolveCluster(genus: RawTaxon, species: RawTaxon[]): ClusterResolution` — pure; picks the representative (most-sitelinks entity that HAS an enwiki article, ties by ascending id) for article + sitelinks; resolves image independently (genus's own, else representative's, else any species with one); sets `resolvedFrom` only when a species won the article.

- [ ] **Step 1: Write the failing tests**

Create `scripts/resolve-cluster.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { resolveCluster } from "./resolve-cluster";
import type { RawTaxon } from "../src/lib/tree/types";

const genus = (over: Partial<RawTaxon> = {}): RawTaxon => ({
  id: "Qg", name: "Genusname", rankId: "Q34740", parentId: "Qp", ...over,
});
const species = (id: string, over: Partial<RawTaxon> = {}): RawTaxon => ({
  id, name: "Genusname species", rankId: "Q7432", parentId: "Qg", ...over,
});

describe("resolveCluster", () => {
  it("prefers a more-notable articled species over the genus (Cryolophosaurus case)", () => {
    const g = genus({ id: "Q18511006", sitelinks: 0, imageUrl: "commons://cryo.jpg" });
    const sp = [species("Q131166", {
      wikipediaUrl: "https://en.wikipedia.org/wiki/Cryolophosaurus",
      enwikiTitle: "Cryolophosaurus", sitelinks: 36,
    })];
    const r = resolveCluster(g, sp);
    expect(r.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Cryolophosaurus");
    expect(r.enwikiTitle).toBe("Cryolophosaurus");
    expect(r.sitelinks).toBe(36);
    expect(r.resolvedFrom).toBe("Q131166");
    expect(r.imageUrl).toBe("commons://cryo.jpg"); // genus's own image kept
  });

  it("keeps the genus's own article when the genus is the most notable", () => {
    const g = genus({
      wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname",
      enwikiTitle: "Genusname", sitelinks: 40,
    });
    const sp = [species("Qs1", { wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname_foo", enwikiTitle: "Genusname foo", sitelinks: 5 })];
    const r = resolveCluster(g, sp);
    expect(r.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Genusname");
    expect(r.sitelinks).toBe(40);
    expect(r.resolvedFrom).toBeUndefined(); // genus won — no provenance marker
  });

  it("reads sitelinks from the articled representative, not the cluster max", () => {
    // An articleless species has MORE sitelinks; it must NOT set the notability number.
    const g = genus({ sitelinks: 1 });
    const sp = [
      species("Qs1", { wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname_bar", enwikiTitle: "Genusname bar", sitelinks: 10 }),
      species("Qs2", { sitelinks: 99 }), // no article
    ];
    const r = resolveCluster(g, sp);
    expect(r.sitelinks).toBe(10);       // from the articled species, not 99
    expect(r.resolvedFrom).toBe("Qs1");
  });

  it("returns the genus's own values when no entity has an article", () => {
    const g = genus({ sitelinks: 0 });
    const sp = [species("Qs1", { sitelinks: 3 }), species("Qs2", { sitelinks: 7 })];
    const r = resolveCluster(g, sp);
    expect(r.wikipediaUrl).toBeUndefined();
    expect(r.enwikiTitle).toBeUndefined();
    expect(r.sitelinks).toBe(0);        // genus's own; NOT the articleless species' 7
    expect(r.resolvedFrom).toBeUndefined();
  });

  it("breaks sitelinks ties by ascending id among articled entities", () => {
    const g = genus({ sitelinks: 0 });
    const sp = [
      species("Qs9", { wikipediaUrl: "https://en.wikipedia.org/wiki/B", enwikiTitle: "B", sitelinks: 5 }),
      species("Qs1", { wikipediaUrl: "https://en.wikipedia.org/wiki/A", enwikiTitle: "A", sitelinks: 5 }),
    ];
    const r = resolveCluster(g, sp);
    expect(r.resolvedFrom).toBe("Qs1"); // ascending id wins the tie
  });

  it("falls back to a species image when the genus has none", () => {
    const g = genus({ sitelinks: 0 }); // no imageUrl
    const sp = [species("Qs1", {
      wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname_baz", enwikiTitle: "Genusname baz",
      sitelinks: 8, imageUrl: "commons://sp.jpg",
    })];
    const r = resolveCluster(g, sp);
    expect(r.imageUrl).toBe("commons://sp.jpg");
  });

  it("handles a genus with no species (monotypic-less / leaf)", () => {
    const g = genus({ wikipediaUrl: "https://en.wikipedia.org/wiki/Genusname", enwikiTitle: "Genusname", sitelinks: 12, imageUrl: "commons://g.jpg" });
    const r = resolveCluster(g, []);
    expect(r.wikipediaUrl).toBe("https://en.wikipedia.org/wiki/Genusname");
    expect(r.sitelinks).toBe(12);
    expect(r.imageUrl).toBe("commons://g.jpg");
    expect(r.resolvedFrom).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run scripts/resolve-cluster.test.ts`
Expected: FAIL — `Failed to resolve import "./resolve-cluster"` / `resolveCluster is not a function`.

- [ ] **Step 3: Write the implementation**

Create `scripts/resolve-cluster.ts`:

```typescript
import type { RawTaxon } from "../src/lib/tree/types";

export interface ClusterResolution {
  wikipediaUrl?: string;
  enwikiTitle?: string;
  sitelinks: number;
  imageUrl?: string;
  resolvedFrom?: string; // set only when the article came from a species, not the genus
}

const sl = (t: RawTaxon): number => t.sitelinks ?? 0;

/**
 * Resolve a genus's Wikipedia identity across its entity cluster {genus} ∪ species.
 * Representative = the entity WITH an enwiki article that has the most sitelinks
 * (ties by ascending id, matching playable.ts). Article + sitelinks come from that
 * representative; image resolves independently (genus's own → representative's → any
 * species'). If no entity has an article, the genus keeps its own values.
 */
export function resolveCluster(genus: RawTaxon, species: RawTaxon[]): ClusterResolution {
  const cluster = [genus, ...species];
  const articled = cluster.filter((t) => !!t.wikipediaUrl);

  // Representative: max sitelinks among articled entities, ties by ascending id.
  articled.sort((a, b) => sl(b) - sl(a) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const rep = articled[0];

  // Image: prefer the genus's own, else the representative's, else any species with one.
  const imageUrl =
    genus.imageUrl ?? rep?.imageUrl ?? species.find((s) => s.imageUrl)?.imageUrl;

  if (!rep) {
    // No article anywhere — keep the genus's own identity untouched.
    return { sitelinks: sl(genus), imageUrl };
  }

  return {
    wikipediaUrl: rep.wikipediaUrl,
    enwikiTitle: rep.enwikiTitle,
    sitelinks: sl(rep),
    imageUrl,
    resolvedFrom: rep.id === genus.id ? undefined : rep.id,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run scripts/resolve-cluster.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add scripts/resolve-cluster.ts scripts/resolve-cluster.test.ts
git commit -m "feat(harvest): pure resolveCluster — pick a genus's representative Wikipedia identity"
```

---

### Task 3: Fetch child species of in-scope genera

Adds the SPARQL query that finds each in-scope genus's child species, so they can be enriched and resolved. Anchored to our genus ids (not all Dinosauria species) so orphan/hybrid junk cannot attach.

**Files:**
- Modify: `scripts/fetch-wikidata.ts` (add `fetchClusterSpecies` function; import `RANK_GENUS`)

**Interfaces:**
- Consumes: `sparql`, `qid` (from `./wikidata`); the in-scope genus ids (`string[]`).
- Produces: `fetchClusterSpecies(genusIds: string[]): Promise<RawTaxon[]>` — returns bare species `RawTaxon`s (`{id, name: id placeholder, rankId: null, parentId: <genusId>}`), to be enriched by the existing `enrich`. `parentId` is the genus each species belongs to.

- [ ] **Step 1: Add the fetch function**

In `scripts/fetch-wikidata.ts`, add after `fetchStructure` (around line 35). This mirrors the paging/batching already in the file:

```typescript
// Child species of the in-scope genera, for cluster resolution. VALUES-bound to OUR genus
// ids (not all Dinosauria species) so orphan/hybrid junk — which has no valid genus parent —
// can never attach. Returns bare records; enrich() fills article/sitelinks/image just like genera.
async function fetchClusterSpecies(genusIds: string[]): Promise<RawTaxon[]> {
  const BATCH = 400;
  const out: RawTaxon[] = [];
  for (let i = 0; i < genusIds.length; i += BATCH) {
    const values = genusIds.slice(i, i + BATCH).map((id) => `wd:${id}`).join(" ");
    const rows = await sparql(`
      SELECT ?sp ?genus WHERE {
        VALUES ?genus { ${values} }
        ?sp wdt:P171 ?genus .
        ?sp wdt:P105 wd:${RANK_SPECIES} .
      }`);
    for (const r of rows) {
      out.push({ id: qid(r.sp!), name: qid(r.sp!), rankId: RANK_SPECIES, parentId: qid(r.genus!) });
    }
    console.log(`cluster species: ${out.length} (genus batch ${Math.min(i + BATCH, genusIds.length)}/${genusIds.length})`);
  }
  return out;
}
```

- [ ] **Step 2: Add the `RANK_SPECIES` constant**

`RANK_SPECIES` is not yet defined. Add it to `src/lib/tree/types.ts` (after `RANK_FAMILY`):

```typescript
export const RANK_SPECIES = "Q7432";
```

Then import it in `scripts/fetch-wikidata.ts` — extend the existing type import on line 5:

```typescript
import { DINOSAURIA, NEORNITHES, RANK_SPECIES } from "../src/lib/tree/types";
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (`fetchClusterSpecies` is defined but not yet called — that's fine; it's a top-level `async function`, not an unused local.)

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-wikidata.ts src/lib/tree/types.ts
git commit -m "feat(harvest): fetchClusterSpecies — child species of in-scope genera"
```

---

### Task 4: Wire resolution into the harvest and report it

Integrates Tasks 2–3 into `main()`: fetch species, enrich the genus∪species union, resolve each cluster, fold onto the genus, discard species, and print a report line. This is the task that changes what `raw-taxa.json` contains.

**Files:**
- Modify: `scripts/fetch-wikidata.ts` (`main()`, ~lines 95-108; add imports)

**Interfaces:**
- Consumes: `fetchClusterSpecies` (Task 3), `resolveCluster` (Task 2), existing `enrich`, `resolveRedirects`.
- Produces: the final `raw-taxa.json` with resolved article/sitelinks/image + `resolvedFrom` on rescued genera. No new exports.

- [ ] **Step 1: Import `resolveCluster`**

Add to the imports at the top of `scripts/fetch-wikidata.ts`:

```typescript
import { resolveCluster } from "./resolve-cluster";
```

- [ ] **Step 2: Rewrite `main()` to fetch species, enrich the union, and resolve**

Replace the body of `main()` (currently lines ~95-108, from `const structure = ...` through the `writeFile`) with:

```typescript
async function main() {
  const structure = await fetchStructure();
  const pruned = pruneSubtree(structure, NEORNITHES);
  // Reduce to in-scope nodes (root -> genus paths) before enrichment.
  const scoped = assembleTree(pruned, DINOSAURIA, "structural");
  const scopedIds = Object.keys(scoped.nodes);
  const byId = new Map(pruned.map((r) => [r.id, r]));
  const inScope = scopedIds.map((id) => byId.get(id)!).filter(Boolean);

  // Genus ids among the in-scope nodes drive the species fetch.
  const genusIds = inScope.filter((r) => r.rankId === RANK_GENUS).map((r) => r.id);
  const species = await fetchClusterSpecies(genusIds);

  // Enrich genera AND their child species in one pass (same query), then resolve each
  // genus's representative across its cluster and fold article/sitelinks/image onto the genus.
  const enrichable = [...inScope, ...species];
  const enrichMap = new Map(enrichable.map((r) => [r.id, r]));
  await enrich([...scopedIds, ...species.map((s) => s.id)], enrichMap);

  const speciesByGenus = new Map<string, RawTaxon[]>();
  for (const s of species) {
    const g = s.parentId;
    if (!g) continue;
    const list = speciesByGenus.get(g);
    if (list) list.push(enrichMap.get(s.id)!);
    else speciesByGenus.set(g, [enrichMap.get(s.id)!]);
  }

  let resolvedCount = 0;
  for (const r of inScope) {
    if (r.rankId !== RANK_GENUS) continue;
    const res = resolveCluster(enrichMap.get(r.id)!, speciesByGenus.get(r.id) ?? []);
    r.wikipediaUrl = res.wikipediaUrl;
    r.enwikiTitle = res.enwikiTitle;
    r.sitelinks = res.sitelinks;
    r.imageUrl = res.imageUrl;
    if (res.resolvedFrom) { r.resolvedFrom = res.resolvedFrom; resolvedCount++; }
  }

  await resolveRedirects(inScope);

  await mkdir("data", { recursive: true });
  await writeFile("data/raw-taxa.json", JSON.stringify(inScope, null, 0));
  console.log(`wrote data/raw-taxa.json (${inScope.length} taxa)`);
  console.log(`resolved via species: ${resolvedCount} genera`);
}
```

Note: `enrich`'s signature is `enrich(ids: string[], byId: Map<string, RawTaxon>)` — it mutates the passed map's entries in place. We pass `enrichMap` (genus + species) so both get their article/sitelinks/image populated before resolution. `inScope` entries are the same object references as in `enrichMap` for the genera, so mutations in the resolve loop land on the objects we write out.

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Confirm `enrich` mutates in place (read-check, no code change)**

Open `scripts/fetch-wikidata.ts` and confirm `enrich` does `const node = byId.get(qid(r.taxon!)); ... node.name = ...` (mutates the map's objects). This is why passing `enrichMap` populates the genus objects that `inScope` also references. If `enrich` instead returned new objects, Step 2 would need adjustment — verify before running the harvest.

Expected: `enrich` mutates `node` in place (it does, per current source lines 50-58).

- [ ] **Step 5: Run the real harvest (integration validation)**

Network-bound; takes a few minutes. Run:

```bash
npm run fetch:wikidata 2>&1 | tail -20
```

Expected output includes a `resolved via species: N genera` line with N in the ~100–120 range (the probe found 114 rescuable).

- [ ] **Step 6: Spot-check the banner cases**

Run:

```bash
node -e 'const r=JSON.parse(require("fs").readFileSync("data/raw-taxa.json","utf8"));const m=new Map(r.map(x=>[x.name,x]));for(const n of ["Cryolophosaurus","Nigersaurus","Amargasaurus"]){const x=m.get(n);console.log(n, "url:", !!x.wikipediaUrl, "sl:", x.sitelinks, "resolvedFrom:", x.resolvedFrom);}'
```

Expected: all three show `url: true`, a sitelinks count in the 20s–30s, and a `resolvedFrom` Q-id (e.g. Cryolophosaurus → sl ~36, resolvedFrom `Q131166`).

- [ ] **Step 7: Confirm no species leaked into the output**

Run:

```bash
node -e 'const r=JSON.parse(require("fs").readFileSync("data/raw-taxa.json","utf8"));console.log("species-rank rows (must be 0):", r.filter(x=>x.rankId==="Q7432").length);'
```

Expected: `species-rank rows (must be 0): 0`.

- [ ] **Step 8: Commit**

```bash
git add scripts/fetch-wikidata.ts
git commit -m "feat(harvest): resolve genus Wikipedia identity across species cluster"
```

---

### Task 5: Rebuild committed data and verify the pool grows

Regenerates the committed `src/data/*.json` from the freshly-resolved raw. This is where Cryolophosaurus becomes playable and its PBDB clue surfaces.

**Files:**
- Modify (generated, committed): `src/data/tree.json`, `src/data/genera-index.json`, `src/data/genus-attributes.json`, `src/data/meta.json`

**Interfaces:**
- Consumes: the resolved `data/raw-taxa.json` (Task 4) + current `data/raw-pbdb.json`.
- Produces: regenerated committed data. No code change.

- [ ] **Step 1: Ensure PBDB raw is current**

Per CLAUDE.md, NEVER run `build:data` on a stale raw. If `data/raw-pbdb.json` predates the current `raw-taxa.json` names, re-fetch first:

```bash
npm run fetch:pbdb 2>&1 | tail -10
```

Expected: `with a clue: N (M%)` summary. (If you just want to validate resolution and the PBDB raw is recent, this may be skipped — but the safe default is to run it.)

- [ ] **Step 2: Run the data build**

```bash
npm run build:data 2>&1 | tail -25
```

Expected: the `=== Mesozooa data build ===` report. `playable (pruned):` should be HIGHER than before (Cryolophosaurus et al. now qualify). GUARD 2 (regression) must NOT trip — this change grows the pool. If it trips, STOP: something shrank unexpectedly; do not use `ALLOW_DATA_REGRESSION`.

- [ ] **Step 3: Verify Cryolophosaurus is now playable with a clue**

```bash
node -e 'const idx=JSON.parse(require("fs").readFileSync("src/data/genera-index.json","utf8"));const a=JSON.parse(require("fs").readFileSync("src/data/genus-attributes.json","utf8"));const t=JSON.parse(require("fs").readFileSync("src/data/tree.json","utf8"));const cryo=Object.values(t.nodes).find(n=>n.name==="Cryolophosaurus");console.log("in index:", idx.some(x=>x.name==="Cryolophosaurus"));console.log("playable:", cryo.playable, "wikipediaUrl:", !!cryo.wikipediaUrl);console.log("has clue:", cryo.id in a, a[cryo.id]);'
```

Expected: `in index: true`, `playable: true`, `wikipediaUrl: true`, `has clue: true` with the Sinemurian–Pliensbachian / Antarctica / Hanson attributes.

- [ ] **Step 4: Full validation — types, unit tests, svelte**

```bash
npx tsc --noEmit && npx vitest run && npx svelte-check
```

Expected: tsc clean, all Vitest tests pass, svelte-check clean.

- [ ] **Step 5: Commit the regenerated data**

```bash
git add src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json src/data/meta.json
git commit -m "data: rebuild with species-resolved genus identities (Closes #2)

Cryolophosaurus, Nigersaurus, Amargasaurus and ~110 other famous genera whose
enwiki article/sitelinks lived on the species entity are now playable, linked
in Explore, and show their PBDB clue."
```

---

### Task 6: Verify the app renders the rescued genera

Confirms the fix in the running app, not just the data — Cryolophosaurus links to Wikipedia in Explore and shows its clue.

**Files:** none (verification only).

- [ ] **Step 1: Check the gallery / Explore for Cryolophosaurus**

Per the gallery workflow, use `/gallery.html` or the running app. Start the dev server if needed (`npm run dev`), open Explore, search "Cryolophosaurus".

Expected: it appears, the specimen card shows age (Early Jurassic / Sinemurian–Pliensbachian) and location (Antarctica), and at end-state it links to its Wikipedia article.

- [ ] **Step 2: Confirm no console errors**

Expected: no errors referencing missing attributes or undefined nodes for the rescued genera.

---

## Post-plan follow-ups (file as GitHub issues — do NOT implement here)

Per CLAUDE.md's "file GitHub issues, not doc entries" rule, after the plan lands:

1. **`tech-debt`:** Genus-less species (Eodromaeus, Overoraptor chimentoi, Nemegtonykus, Diplodocus hallorum) — genera whose Wikidata item isn't tagged `rankId = genus`, so `RANK_GENUS` filtering drops the lineage. Distinct fix (rank inference).
2. **Note on #13:** `dedupeRaws` survivor-selection misuses sitelinks (seniority ≠ popularity); correct signal is PBDB `taxon_status`/`accepted_name`. Add as context to epic #13, not a new fix.
