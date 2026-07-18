# Mesozooa Leaf-Disambiguation — Data Pipeline (Plan A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the committed data so the playable pool is notability-pruned (every terminal set ≤ CAP=7, keeping the most-notable genera) and carries a paleo clue (age + discovery location). Produces the data the clue mechanic (Plan B) consumes.

**Architecture:** Extend the build-time pipeline: harvest Wikidata sitelink counts (notability) and PBDB attributes (age via `taxa`, location via `occs`); add pure, TDD-tested tree functions (`terminalClade`, `prunePlayable`); and rebuild `tree.json` (new `playable` + `sitelinks` on every genus) plus a new `genus-attributes.json`. Wikidata still owns the tree; PBDB supplies only attributes, keyed by genus name.

**Tech Stack:** Node 20+/25, TypeScript, Vitest, `tsx`, Wikidata SPARQL, PBDB REST API (`paleobiodb.org/data1.2`).

## Global Constraints

- **One `playable` pool.** After the prune it is the whole game (autocomplete = guesses = answers). Everything else is unplayable (Explore-only). No guessable/answerable split.
- **Notability prune.** For each **terminal clade** (lowest ancestor with `descendantGenusCount > 1`, skipping monotypic parents), keep the **top-CAP genera by Wikidata sitelink count** (ties by ascending QID); the rest become unplayable. **CAP = 7** (build-time constant, tunable). A genus is only kept if it also has a clue (§ clue eligibility).
- **Clue eligibility.** A genus needs **≥ 1** of {geological age, discovery location} from PBDB; genera with neither are unplayable (keeps the endgame clue consistent).
- **Clue = age + location.** "When it lived" (PBDB `early_interval`/`late_interval` + Ma bounds) and "where it was discovered" (PBDB occurrence modal country, **present-day**, not paleo).
- **`sitelinks` retained on every genus node** (not just playable) so future re-prunes need no re-harvest.
- **PBDB for attributes only** (keyed by genus name), never taxonomy. Build-time only; no runtime PBDB calls.
- **`verbatimModuleSyntax` is ON.** Type-only imports use `import type`; every task runs `npx tsc --noEmit` clean before commit.
- **Network tasks** (Wikidata/PBDB fetch, rebuild) hit live APIs; every request sends a descriptive `User-Agent`. They are smoke-verified, not unit-tested. `data/raw-taxa.json` and `data/raw-pbdb.json` are gitignored; `src/data/*.json` are committed.
- **Test fixture:** pure-logic tests reuse the foundation `FIXTURE_RAWS` (playable TR, TB, TC; Q430 count 4; TF count 2; O/CF count 1). Sitelinks/attributes are set synthetically in tests.

---

### Task 1: `sitelinks` field + carry-through

**Files:**
- Modify: `src/lib/tree/types.ts`, `src/lib/tree/assemble.ts`, `src/lib/tree/assemble.test.ts`, `src/lib/game/warmth.test.ts`

**Interfaces:**
- Produces: `RawTaxon.sitelinks?: number`; `TreeNode.sitelinks: number` (defaults to 0 when absent). `assembleTree` copies it through.

- [ ] **Step 1: Add the field to the types**

In `src/lib/tree/types.ts`, add `sitelinks` to both interfaces:
```ts
export interface RawTaxon {
  id: string;
  name: string;
  rankId: string | null;
  parentId: string | null;
  imageUrl?: string;
  wikipediaUrl?: string;
  sitelinks?: number;
}
```
and, in `TreeNode`, add a required `sitelinks: number` (place it after `playable`):
```ts
  playable: boolean;
  sitelinks: number;
  imageUrl?: string;
  wikipediaUrl?: string;
```

- [ ] **Step 2: Carry it through `assembleTree`**

In `src/lib/tree/assemble.ts`, in the node-construction object literal, add `sitelinks`:
```ts
      isGenus: r.rankId === RANK_GENUS,
      playable: false,
      sitelinks: r.sitelinks ?? 0,
      imageUrl: r.imageUrl,
      wikipediaUrl: r.wikipediaUrl,
```

- [ ] **Step 3: Add a carry-through assertion to the test**

In `src/lib/tree/assemble.test.ts`, inside the existing `describe("assembleTree", ...)` block, add:
```ts
  it("carries sitelinks (default 0 when absent)", () => {
    expect(tree.nodes["TR"].sitelinks).toBe(0);
  });
  it("carries a provided sitelinks count", () => {
    const withSl = assembleTree(
      pruneSubtree(FIXTURE_RAWS.map((r) => (r.id === "TR" ? { ...r, sitelinks: 42 } : r)), NEORNITHES),
      DINOSAURIA,
      "test",
    );
    expect(withSl.nodes["TR"].sitelinks).toBe(42);
  });
```

- [ ] **Step 4: Fix the one `TreeNode` literal in tests**

Making `sitelinks` required breaks the `TreeNode` literal built in `src/lib/game/warmth.test.ts`.
Add `sitelinks: 0` to its `node()` builder (the object with `descendantGenusCount`/`isGenus`):
```ts
    depth: 0, descendantGenusCount: count, isGenus: false, playable: false, sitelinks: 0,
```
(No other file constructs a `TreeNode` literal — `assemble.ts` is the sole real builder.)

- [ ] **Step 5: Run tests + type-check**

Run: `npm test` → PASS (assemble + warmth + all). Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tree/types.ts src/lib/tree/assemble.ts src/lib/tree/assemble.test.ts src/lib/game/warmth.test.ts
git commit -m "feat: carry Wikidata sitelinks through the tree"
```

---

### Task 2: `terminalClade` (pure)

**Files:**
- Create: `src/lib/tree/terminal.ts`, `src/lib/tree/terminal.test.ts`

**Interfaces:**
- Consumes: `TreeData` from `./types`.
- Produces: `terminalClade(tree, id): string` — the lowest ancestor of `id` with `descendantGenusCount > 1` (walks up from the parent, skipping monotypic clades); returns `id` if none exists.

- [ ] **Step 1: Write the failing test**

`src/lib/tree/terminal.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { terminalClade } from "./terminal";
import { assembleTree, pruneSubtree } from "./assemble";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");

describe("terminalClade", () => {
  it("is the parent when the parent has >1 genus", () => {
    expect(terminalClade(tree, "TR")).toBe("TF"); // TF has TR + TB
    expect(terminalClade(tree, "TB")).toBe("TF");
  });
  it("skips monotypic ancestors up to the first branching clade", () => {
    // TC's parent CF (1 genus) and grandparent O (1 genus) are monotypic -> Q430 (4 genera)
    expect(terminalClade(tree, "TC")).toBe("Q430");
  });
  it("uses the branching parent for a genus directly under a multi-genus clade", () => {
    expect(terminalClade(tree, "LO")).toBe("T"); // T has TF-subtree genera + LO
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- terminal` → FAIL (module not found).

- [ ] **Step 3: Write the implementation**

`src/lib/tree/terminal.ts`:
```ts
import type { TreeData } from "./types";

// The lowest ancestor of `id` with more than one descendant genus — the warmest clade
// warmth can establish short of guessing the genus itself. Skips monotypic parents.
export function terminalClade(tree: TreeData, id: string): string {
  let a = tree.nodes[id]?.parentId ?? null;
  while (a && tree.nodes[a] && tree.nodes[a].descendantGenusCount === 1) {
    a = tree.nodes[a].parentId;
  }
  return a ?? id;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- terminal` → PASS. Run: `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree/terminal.ts src/lib/tree/terminal.test.ts
git commit -m "feat: terminalClade — the flat set a target bottoms out to"
```

---

### Task 3: Attribute types + `prunePlayable` (pure)

**Files:**
- Create: `src/lib/attributes.ts`
- Modify: `src/lib/tree/playable.ts`, `src/lib/tree/playable.test.ts`

**Interfaces:**
- Produces:
  - `GenusAttribute = { ageLabel?; ageStartMa?; ageEndMa?; discoveryLocation? }`, `GenusAttributes = Record<string, GenusAttribute>`, `hasClue(a)` (true iff `ageLabel` or `discoveryLocation`) — in `src/lib/attributes.ts`.
  - `prunePlayable(tree, attrs, cap): void` — narrows the already-`markPlayable`d set: drops genera without a clue, then within each terminal clade keeps the top-`cap` by `sitelinks` (ties by ascending id), dropping the rest.

- [ ] **Step 1: Write the attributes module**

`src/lib/attributes.ts`:
```ts
export interface GenusAttribute {
  ageLabel?: string;
  ageStartMa?: number;
  ageEndMa?: number;
  discoveryLocation?: string;
}

export type GenusAttributes = Record<string, GenusAttribute>;

export function hasClue(a: GenusAttribute | undefined): boolean {
  return !!a && (!!a.ageLabel || !!a.discoveryLocation);
}
```

- [ ] **Step 2: Write the failing test**

In `src/lib/tree/playable.test.ts`, **add `prunePlayable` to the existing `./playable` import**
(don't add a second import of `markPlayable`/`playableGenera`), and add one new import:
```ts
import type { GenusAttributes } from "../attributes";
```
Then append this `describe` block:
```ts
describe("prunePlayable", () => {
  function freshTree() {
    const t = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
    markPlayable(t); // base playable: TR, TB, TC
    t.nodes["TR"].sitelinks = 5;
    t.nodes["TB"].sitelinks = 3;
    t.nodes["TC"].sitelinks = 9;
    return t;
  }
  const clue: GenusAttributes = {
    TR: { ageLabel: "Maastrichtian" },
    TB: { discoveryLocation: "Mongolia" },
    TC: { ageLabel: "Maastrichtian", discoveryLocation: "USA" },
  };

  it("keeps the top-CAP most-notable per terminal set", () => {
    const t = freshTree();
    // TR & TB share terminal clade TF; TC's is Q430 (alone). CAP 1 -> keep TR (5>3), TC.
    prunePlayable(t, clue, 1);
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TC", "TR"]);
  });
  it("keeps everyone when CAP >= set size", () => {
    const t = freshTree();
    prunePlayable(t, clue, 7);
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TC", "TR"]);
  });
  it("drops genera with no clue regardless of notability", () => {
    const t = freshTree();
    prunePlayable(t, { TR: { ageLabel: "x" }, TB: { ageLabel: "x" } }, 7); // TC has no clue
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("breaks sitelink ties by ascending id", () => {
    const t = freshTree();
    t.nodes["TR"].sitelinks = 3; // tie with TB
    prunePlayable(t, clue, 1); // TF set {TR,TB} tie -> keep "TB" (< "TR")
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TC"]);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- playable` → FAIL (`prunePlayable` not exported).

- [ ] **Step 4: Write the implementation**

Append to `src/lib/tree/playable.ts` (and add the imports at the top):
```ts
import { terminalClade } from "./terminal";
import type { GenusAttributes } from "../attributes";
import { hasClue } from "../attributes";
```
```ts
// Narrow the base-playable set: require a clue, then keep only the top-`cap` most-notable
// (by sitelinks, ties by ascending id) genera within each terminal clade.
export function prunePlayable(tree: TreeData, attrs: GenusAttributes, cap: number): void {
  const byClade = new Map<string, TreeNode[]>();
  for (const n of Object.values(tree.nodes)) {
    if (!n.playable) continue;
    if (!hasClue(attrs[n.id])) {
      n.playable = false;
      continue;
    }
    const a = terminalClade(tree, n.id);
    const list = byClade.get(a);
    if (list) list.push(n);
    else byClade.set(a, [n]);
  }
  for (const members of byClade.values()) {
    members.sort((x, y) => y.sitelinks - x.sitelinks || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    for (let i = cap; i < members.length; i++) members[i].playable = false;
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- playable` → PASS. Run: `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/attributes.ts src/lib/tree/playable.ts src/lib/tree/playable.test.ts
git commit -m "feat: notability prune of the playable pool"
```

---

### Task 4: PBDB client — pure parsing + network wrapper

**Files:**
- Create: `src/lib/pbdb-parse.ts`, `src/lib/pbdb-parse.test.ts`, `scripts/pbdb.ts`

**Interfaces:**
- Produces (pure, tested in `src/lib/pbdb-parse.ts`):
  - `parseAge(rec): { ageLabel?; ageStartMa?; ageEndMa? }` — from a PBDB taxa record (`early_interval`, `late_interval`, `firstapp_max_ma`, `lastapp_min_ma`).
  - `modalLocation(rows): string | undefined` — the most common present-day country among PBDB occurrence rows (`cc` ISO code → readable name via `COUNTRY_NAMES`, fallback to the code), ties broken by name.
  - `COUNTRY_NAMES: Record<string,string>`.
- Produces (network, in `scripts/pbdb.ts`): `pbdbAges(names)`, `pbdbLocations(names)` returning `Record<name, ...>`.

- [ ] **Step 1: Write the failing test (pure functions)**

`src/lib/pbdb-parse.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { parseAge, modalLocation } from "./pbdb-parse";

describe("parseAge", () => {
  it("labels a single interval and reads Ma bounds", () => {
    const a = parseAge({ early_interval: "Maastrichtian", late_interval: "Maastrichtian", firstapp_max_ma: 72.2, lastapp_min_ma: 66 });
    expect(a.ageLabel).toBe("Maastrichtian");
    expect(a.ageStartMa).toBe(72.2);
    expect(a.ageEndMa).toBe(66);
  });
  it("joins distinct early/late intervals", () => {
    expect(parseAge({ early_interval: "Coniacian", late_interval: "Maastrichtian" }).ageLabel).toBe("Coniacian-Maastrichtian");
  });
  it("is empty when no interval is present", () => {
    expect(parseAge({}).ageLabel).toBeUndefined();
  });
});

describe("modalLocation", () => {
  it("returns the most common country as a readable name", () => {
    expect(modalLocation([{ cc: "CA" }, { cc: "CA" }, { cc: "US" }])).toBe("Canada");
  });
  it("falls back to the raw code when unmapped", () => {
    expect(modalLocation([{ cc: "ZZ" }])).toBe("ZZ");
  });
  it("is undefined with no located rows", () => {
    expect(modalLocation([{}, {}])).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pbdb-parse` → FAIL (module not found).

- [ ] **Step 3: Write the pure implementation**

`src/lib/pbdb-parse.ts`:
```ts
export const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", CA: "Canada", CN: "China", MN: "Mongolia", AR: "Argentina",
  GB: "United Kingdom", DE: "Germany", AU: "Australia", ZA: "South Africa", BR: "Brazil",
  ES: "Spain", FR: "France", RU: "Russia", IN: "India", MA: "Morocco", EG: "Egypt",
  NE: "Niger", TZ: "Tanzania", MG: "Madagascar", KZ: "Kazakhstan", UZ: "Uzbekistan",
  RO: "Romania", PT: "Portugal", MX: "Mexico", CL: "Chile", UY: "Uruguay", JP: "Japan",
  KR: "South Korea", TH: "Thailand", LA: "Laos", IT: "Italy", BE: "Belgium", PL: "Poland",
};

export interface AgeRecord {
  early_interval?: string;
  late_interval?: string;
  firstapp_max_ma?: number;
  lastapp_min_ma?: number;
}

export function parseAge(rec: AgeRecord): { ageLabel?: string; ageStartMa?: number; ageEndMa?: number } {
  const early = rec.early_interval;
  const late = rec.late_interval;
  let ageLabel: string | undefined;
  if (early && late && early !== late) ageLabel = `${early}-${late}`;
  else ageLabel = early ?? late ?? undefined;
  return {
    ageLabel,
    ageStartMa: rec.firstapp_max_ma,
    ageEndMa: rec.lastapp_min_ma,
  };
}

export function modalLocation(rows: { cc?: string }[]): string | undefined {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.cc) continue;
    counts.set(r.cc, (counts.get(r.cc) ?? 0) + 1);
  }
  if (counts.size === 0) return undefined;
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0];
  return COUNTRY_NAMES[best] ?? best;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pbdb-parse` → PASS.

- [ ] **Step 5: Write the network wrapper**

`scripts/pbdb.ts`:
```ts
import { parseAge, modalLocation } from "../src/lib/pbdb-parse";
import type { AgeRecord } from "../src/lib/pbdb-parse";

const BASE = "https://paleobiodb.org/data1.2";
const UA = "Mesozooa/0.1 (https://github.com/; dinosaur cladistics game)";
const BATCH = 80;

async function getJSON(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) {
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      continue;
    }
    if (!res.ok) throw new Error(`PBDB ${res.status}: ${url}`);
    return res.json();
  }
  throw new Error(`PBDB retries exhausted: ${url}`);
}

const genusOf = (name: string) => name.split(" ")[0];

export async function pbdbAges(names: string[]): Promise<Record<string, ReturnType<typeof parseAge>>> {
  const out: Record<string, ReturnType<typeof parseAge>> = {};
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const url = `${BASE}/taxa/list.json?vocab=pbdb&show=app&taxon_name=${encodeURIComponent(batch.join(","))}`;
    const j = await getJSON(url);
    for (const rec of j.records ?? []) {
      const g = genusOf(rec.taxon_name ?? rec.accepted_name ?? "");
      if (batch.includes(g) && !out[g]) out[g] = parseAge(rec as AgeRecord);
    }
    console.log(`pbdb ages: ${Math.min(i + BATCH, names.length)}/${names.length}`);
  }
  return out;
}

export async function pbdbLocations(names: string[]): Promise<Record<string, string | undefined>> {
  const out: Record<string, string | undefined> = {};
  for (let i = 0; i < names.length; i += BATCH) {
    const batch = names.slice(i, i + BATCH);
    const url = `${BASE}/occs/list.json?vocab=pbdb&show=loc&taxon_name=${encodeURIComponent(batch.join(","))}`;
    const j = await getJSON(url);
    const rowsByGenus = new Map<string, { cc?: string }[]>();
    for (const occ of j.records ?? []) {
      const g = genusOf(occ.accepted_name ?? occ.identified_name ?? "");
      if (!batch.includes(g)) continue;
      const list = rowsByGenus.get(g);
      if (list) list.push({ cc: occ.cc });
      else rowsByGenus.set(g, [{ cc: occ.cc }]);
    }
    for (const [g, rows] of rowsByGenus) out[g] = modalLocation(rows);
    console.log(`pbdb locations: ${Math.min(i + BATCH, names.length)}/${names.length}`);
  }
  return out;
}
```

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/pbdb-parse.ts src/lib/pbdb-parse.test.ts scripts/pbdb.ts
git commit -m "feat: PBDB age + location parsing and client"
```

---

### Task 5: Harvest Wikidata sitelinks in the fetch

**Files:**
- Modify: `scripts/fetch-wikidata.ts`

**Interfaces:**
- Consumes: `RawTaxon` (now with `sitelinks?`). Produces: `data/raw-taxa.json` where in-scope taxa carry `sitelinks`.

- [ ] **Step 1: Add sitelinks to the enrichment query and mapping**

In `scripts/fetch-wikidata.ts`, extend the `enrich` SPARQL query and the row handler:
```ts
    const rows = await sparql(`
      SELECT ?taxon ?taxonLabel ?img ?article ?sitelinks WHERE {
        VALUES ?taxon { ${values} }
        OPTIONAL { ?taxon wdt:P18 ?img }
        OPTIONAL { ?article schema:about ?taxon ; schema:isPartOf <https://en.wikipedia.org/> }
        OPTIONAL { ?taxon wikibase:sitelinks ?sitelinks }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }`);
    for (const r of rows) {
      const node = byId.get(qid(r.taxon!));
      if (!node) continue;
      if (r.taxonLabel) node.name = r.taxonLabel;
      if (r.img) node.imageUrl = r.img;
      if (r.article) node.wikipediaUrl = r.article;
      if (r.sitelinks) node.sitelinks = Number(r.sitelinks);
    }
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit` → clean.

- [ ] **Step 3: Re-run the fetch (network)**

Run: `npm run fetch:wikidata` (generous timeout; the client retries on 429/5xx — re-run if a page times out).
Expected: completes; final line reports a taxa count in the low thousands.

- [ ] **Step 4: Verify sitelinks landed**

Run:
```bash
node --input-type=module -e "import fs from 'node:fs'; const d=JSON.parse(fs.readFileSync('./data/raw-taxa.json','utf8')); const g=d.filter(x=>x.rankId==='Q34740'); console.log('genera', g.length, 'with sitelinks', g.filter(x=>typeof x.sitelinks==='number').length);"
```
Expected: the great majority of genera carry a `sitelinks` number.

- [ ] **Step 5: Commit (script only; raw JSON is gitignored)**

```bash
git add scripts/fetch-wikidata.ts
git commit -m "feat: harvest Wikidata sitelink counts"
```

---

### Task 6: `fetch-pbdb.ts` → `data/raw-pbdb.json`

**Files:**
- Create: `scripts/fetch-pbdb.ts`
- Modify: `package.json` (add a `fetch:pbdb` script)

**Interfaces:**
- Consumes: `data/raw-taxa.json` (genus names), `pbdbAges`/`pbdbLocations` from `./pbdb.ts`.
- Produces: `data/raw-pbdb.json` (gitignored) = `Record<genusName, { ageLabel?; ageStartMa?; ageEndMa?; discoveryLocation? }>`.

- [ ] **Step 1: Add the npm script**

In `package.json` `scripts`, add:
```json
    "fetch:pbdb": "tsx scripts/fetch-pbdb.ts",
```

- [ ] **Step 2: Write the fetch script**

`scripts/fetch-pbdb.ts`:
```ts
import { readFile, writeFile } from "node:fs/promises";
import { pbdbAges, pbdbLocations } from "./pbdb";
import type { RawTaxon } from "../src/lib/tree/types";
import { RANK_GENUS } from "../src/lib/tree/types";
import type { GenusAttribute } from "../src/lib/attributes";

async function main() {
  const raws: RawTaxon[] = JSON.parse(await readFile("data/raw-taxa.json", "utf8"));
  const names = [...new Set(raws.filter((r) => r.rankId === RANK_GENUS).map((r) => r.name))];
  console.log(`fetching PBDB attributes for ${names.length} genera...`);

  const ages = await pbdbAges(names);
  const locs = await pbdbLocations(names);

  const out: Record<string, GenusAttribute> = {};
  let withAge = 0, withLoc = 0, withEither = 0;
  for (const name of names) {
    const age = ages[name];
    const loc = locs[name];
    const attr: GenusAttribute = {};
    if (age?.ageLabel) { attr.ageLabel = age.ageLabel; attr.ageStartMa = age.ageStartMa; attr.ageEndMa = age.ageEndMa; withAge++; }
    if (loc) { attr.discoveryLocation = loc; withLoc++; }
    if (attr.ageLabel || attr.discoveryLocation) { out[name] = attr; withEither++; }
  }

  await writeFile("data/raw-pbdb.json", JSON.stringify(out, null, 0));
  console.log(`=== PBDB attributes ===`);
  console.log(`  genera:        ${names.length}`);
  console.log(`  with age:      ${withAge}`);
  console.log(`  with location: ${withLoc}`);
  console.log(`  with a clue:   ${withEither} (${((100 * withEither) / names.length).toFixed(0)}%)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Add `data/raw-pbdb.json` to `.gitignore`**

Append to `.gitignore`:
```
data/raw-pbdb.json
```

- [ ] **Step 4: Run the fetch (network)**

Run: `npm run fetch:pbdb`
Expected: prints coverage; "with a clue" should be ~90%+ of genera (probe measured 95–97% on flat-set genera).

- [ ] **Step 5: Commit (script + package.json + .gitignore; raw JSON gitignored)**

```bash
git add scripts/fetch-pbdb.ts package.json .gitignore
git commit -m "feat: fetch PBDB age + location attributes"
```

---

### Task 7: Rebuild `tree.json`, `genus-attributes.json`, `genera-index.json`

**Files:**
- Modify: `scripts/build-tree.ts`, `src/data/README.md`
- Produces (committed): rebuilt `src/data/tree.json`, `src/data/genera-index.json`, new `src/data/genus-attributes.json`.

**Interfaces:**
- Consumes: `data/raw-taxa.json` (with sitelinks), `data/raw-pbdb.json`; `terminalClade` (not called directly here — used inside `prunePlayable`), `markPlayable`/`prunePlayable`/`playableGenera`, `GenusAttributes`.

- [ ] **Step 1: Rewrite the build script**

Replace `scripts/build-tree.ts` with:
```ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pruneSubtree, assembleTree } from "../src/lib/tree/assemble";
import { markPlayable, prunePlayable, playableGenera } from "../src/lib/tree/playable";
import type { RawTaxon } from "../src/lib/tree/types";
import { DINOSAURIA, NEORNITHES } from "../src/lib/tree/types";
import type { GenusAttribute, GenusAttributes } from "../src/lib/attributes";

const PLAYABLE_CAP = 7; // max sibling genera in a terminal set (per-genus median); tunable

async function main() {
  const raws: RawTaxon[] = JSON.parse(await readFile("data/raw-taxa.json", "utf8"));
  const pbdbByName: Record<string, GenusAttribute> = JSON.parse(await readFile("data/raw-pbdb.json", "utf8"));
  const dataVersion = new Date().toISOString().slice(0, 10);

  const tree = assembleTree(pruneSubtree(raws, NEORNITHES), DINOSAURIA, dataVersion);
  markPlayable(tree); // base eligibility: genus + enwiki + family ancestor

  // Attributes keyed by genus id (match PBDB by name).
  const attrs: GenusAttributes = {};
  for (const n of Object.values(tree.nodes)) {
    if (n.isGenus && pbdbByName[n.name]) attrs[n.id] = pbdbByName[n.name];
  }

  prunePlayable(tree, attrs, PLAYABLE_CAP); // notability prune (needs a clue; ≤ CAP per terminal set)

  const genera = Object.values(tree.nodes).filter((n) => n.isGenus);
  const playable = playableGenera(tree);
  const index = playable
    .map((n) => ({ id: n.id, name: n.name }))
    .sort((a, b) => a.name.localeCompare(b.name));

  // Emit clue attributes only for the final playable set.
  const clueOut: GenusAttributes = {};
  for (const n of playable) if (attrs[n.id]) clueOut[n.id] = attrs[n.id];

  await mkdir("src/data", { recursive: true });
  await writeFile("src/data/tree.json", JSON.stringify(tree));
  await writeFile("src/data/genera-index.json", JSON.stringify(index));
  await writeFile("src/data/genus-attributes.json", JSON.stringify(clueOut));

  // Data-quality report.
  console.log("=== Mesozooa data build ===");
  console.log("dataVersion:        ", dataVersion);
  console.log("total nodes:        ", Object.keys(tree.nodes).length);
  console.log("genera (all):       ", genera.length);
  console.log("playable (pruned):  ", playable.length, `(CAP=${PLAYABLE_CAP})`);
  console.log("clue attributes:    ", Object.keys(clueOut).length);
  console.log("genera w/o sitelink:", genera.filter((n) => n.sitelinks === 0).length);
  console.log("root count:         ", tree.nodes[DINOSAURIA].descendantGenusCount);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Update `src/data/README.md`**

Add `genus-attributes.json` and the PBDB step to the regeneration instructions:
```markdown
# Generated data

Do not edit by hand. Regenerate with:

    npm run fetch:wikidata   # -> data/raw-taxa.json (gitignored; incl. sitelinks)
    npm run fetch:pbdb       # -> data/raw-pbdb.json (gitignored; age + location)
    npm run build:data       # -> src/data/tree.json, genera-index.json, genus-attributes.json

`tree.json` is the full Mesozoic cladogram (reference pool); genera carry `sitelinks`.
`genera-index.json` is the notability-pruned playable pool (≤ CAP=7 per terminal set).
`genus-attributes.json` holds the paleo clue (age + discovery location) for each playable
genus. See docs/superpowers/specs for design.
```

- [ ] **Step 3: Run the build**

Run: `npm run build:data`
Expected: `playable (pruned)` ≈ **670–700** (target ~696 minus the clue trim); `clue attributes` equals the playable count; report prints.

- [ ] **Step 4: Verify the artifacts + invariants**

Run:
```bash
node --input-type=module -e "import fs from 'node:fs'; \
const t=JSON.parse(fs.readFileSync('./src/data/tree.json','utf8')); \
const idx=JSON.parse(fs.readFileSync('./src/data/genera-index.json','utf8')); \
const at=JSON.parse(fs.readFileSync('./src/data/genus-attributes.json','utf8')); \
const N=t.nodes; \
function tc(id){let a=N[id].parentId;while(a&&N[a].descendantGenusCount===1)a=N[a].parentId;return a??id;} \
const play=Object.values(N).filter(n=>n.playable); \
const bySet={}; for(const n of play){const a=tc(n.id);(bySet[a]=bySet[a]||[]).push(n.id);} \
const maxSet=Math.max(...Object.values(bySet).map(m=>m.length)); \
console.log('playable',play.length,'index',idx.length,'attrs',Object.keys(at).length); \
console.log('max terminal set among playable (must be <=7):',maxSet); \
console.log('every playable has a clue:', play.every(n=>at[n.id]&&(at[n.id].ageLabel||at[n.id].discoveryLocation)));"
```
Expected: `index` and `attrs` equal `playable`; **max terminal set ≤ 7**; every playable has a clue = `true`.

- [ ] **Step 5: Sanity-check famous genera survived the prune**

Run:
```bash
node --input-type=module -e "import fs from 'node:fs'; const t=JSON.parse(fs.readFileSync('./src/data/tree.json','utf8')); const byName=Object.fromEntries(Object.values(t.nodes).map(n=>[n.name,n])); for(const nm of ['Tyrannosaurus','Triceratops','Velociraptor','Spinosaurus','Stegosaurus','Brachiosaurus']) console.log(nm, byName[nm]?.playable);"
```
Expected: the famous genera present are `playable: true` (notability keeps them).

- [ ] **Step 6: Run the full gate suite**

Run: `npm test` → all pass. Run: `npx tsc --noEmit` → clean. Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors. Run: `npm run build` → succeeds (confirms the app still bundles the rebuilt, smaller `tree.json`).

- [ ] **Step 7: Commit the rebuilt data**

```bash
git add scripts/build-tree.ts src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json src/data/README.md
git commit -m "feat: rebuild data with notability prune + paleo clue attributes"
```

---

## Notes for Plan B (game — not implemented here)

- Plan B consumes `genus-attributes.json` (the clue) and the smaller `playable` pool. The clue
  mechanic triggers when `warmestSharedNodeId(state) === terminalClade(target)` and reveals
  age + location together.
- The `playable` pool is now ~670–700; `dailyAnswer`/practice/autocomplete already read the
  `playable` flag, so no game pool change is needed — only the clue UI + the `terminalClade`
  import into the game engine.
- `CAP` and the guess budget stay build-time/config dials for playtest tuning.
