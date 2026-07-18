# Tree Dedupe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the Explore "ghost tree" duplicates (283 case-duplicate Wikidata items) and fix the mislabeled `Carnottaurus`, via a pure build-time transform over the raw taxon list.

**Architecture:** A new pure function `dedupeRaws(raws)` runs on `RawTaxon[]` before `assembleTree`: first apply a label-override map (fix typos), then group by case-insensitive name, keep the max-sitelinks node per group (tie → capitalized), and reparent every survivor whose parent was dropped onto the surviving twin. Wired into `scripts/build-tree.ts`; committed `src/data/*.json` regenerated with `npm run build:data` (no re-fetch).

**Tech Stack:** TypeScript + Vite. Tests: Vitest. Data build: `tsx scripts/build-tree.ts` via `npm run build:data`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Run `npx tsc --noEmit` before committing.
- Pure logic is TDD-tested. `dedupeRaws` is pure over `RawTaxon[]` — full TDD.
- Ordering is load-bearing: **apply label overrides BEFORE dedupe** (so `Carnottaurus`→`Carnotaurus` becomes a case-twin of the ghost `carnotaurus` and the ghost gets dropped; reversed order leaves two "Carnotaurus").
- Winner rule per name group: **max `sitelinks`**, tie-break **prefer a capitalized initial**.
- Do NOT change the game pool or its behavior: 0 duplicate/lowercase nodes are `playable`, so the playable set (674) and all game tests must remain identical after rebuild.
- `LABEL_OVERRIDES` starts with exactly one entry: `{ Q18510948: "Carnotaurus" }`.
- Match surrounding code style; no unrelated refactors.

---

### Task 1: `dedupeRaws` pure function

**Files:**
- Create: `src/lib/tree/dedupe.ts`
- Test: `src/lib/tree/dedupe.test.ts`

**Interfaces:**
- Consumes: `RawTaxon` from `./types` (`{ id, name, rankId, parentId, imageUrl?, wikipediaUrl?, sitelinks? }`).
- Produces:
  - `LABEL_OVERRIDES: Record<string, string>` — `{ Q18510948: "Carnotaurus" }`.
  - `dedupeRaws(raws: RawTaxon[]): RawTaxon[]` — overrides applied, duplicates by case-insensitive name collapsed to one winner (max sitelinks, tie→capitalized), survivors' `parentId` remapped through the dropped→winner map. Order of the returned array is not significant.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tree/dedupe.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { dedupeRaws, LABEL_OVERRIDES } from "./dedupe";
import type { RawTaxon } from "./types";

const R = (id: string, name: string, parentId: string | null, sitelinks = 0): RawTaxon => ({
  id, name, rankId: null, parentId, sitelinks,
});

describe("dedupeRaws", () => {
  it("keeps the higher-sitelinks node in a case-duplicate pair and drops the other", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("B", "Triceratops", "A", 50),
      R("C", "triceratops", "A", 0),
    ]);
    const ids = out.map((r) => r.id).sort();
    expect(ids).toEqual(["A", "B"]);
  });

  it("tie-breaks equal sitelinks by preferring a capitalized initial", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("low", "stegosaurus", "A", 5),
      R("Cap", "Stegosaurus", "A", 5),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "Cap"]);
  });

  it("reparents a survivor whose parent was dropped onto the surviving twin", () => {
    // kept child 'K' under dropped 'cerat'; 'Cerat' is the surviving twin of that name group
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("Cerat", "Ceratopsia", "A", 40),
      R("cerat", "ceratopsia", "A", 0),
      R("K", "Triceratops", "cerat", 50),
    ]);
    const k = out.find((r) => r.id === "K")!;
    expect(k.parentId).toBe("Cerat"); // remapped from dropped 'cerat'
    expect(out.map((r) => r.id).sort()).toEqual(["A", "Cerat", "K"]);
  });

  it("applies label overrides BEFORE dedupe so a typo'd real item absorbs its ghost", () => {
    // Q18510948 'Carnottaurus' (override -> 'Carnotaurus', 53) must beat + drop ghost 'carnotaurus'
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("Q18510948", "Carnottaurus", "A", 53),
      R("ghost", "carnotaurus", "A", 0),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "Q18510948"]);
    expect(out.find((r) => r.id === "Q18510948")!.name).toBe("Carnotaurus");
  });

  it("handles a 3-member group, keeping only the max", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("x", "Rhinorex", "A", 7),
      R("y", "rhinorex", "A", 3),
      R("z", "RHINOREX", "A", 1),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "x"]);
  });

  it("leaves a unique-name node untouched", () => {
    const out = dedupeRaws([R("A", "Root", null, 10), R("B", "Velociraptor", "A", 20)]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "B"]);
  });

  it("exposes the Carnotaurus override entry", () => {
    expect(LABEL_OVERRIDES["Q18510948"]).toBe("Carnotaurus");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tree/dedupe.test.ts`
Expected: FAIL — cannot find module `./dedupe` / `dedupeRaws is not a function`.

- [ ] **Step 3: Implement `dedupeRaws`**

Create `src/lib/tree/dedupe.ts`:

```ts
import type { RawTaxon } from "./types";

// One-off label fixes for real items with defective Wikidata labels (correct Wikipedia link).
// Applied BEFORE dedupe so a corrected name becomes a case-twin of its lowercase ghost.
export const LABEL_OVERRIDES: Record<string, string> = {
  Q18510948: "Carnotaurus", // labeled "Carnottaurus" (typo) in Wikidata; 53 sitelinks
};

const sl = (r: RawTaxon): number => r.sitelinks ?? 0;
const isCap = (r: RawTaxon): boolean => !!r.name && r.name[0] === r.name[0].toUpperCase();

// Collapse duplicate-name taxa. Real taxa recur as lowercase Wikidata "ghost" items; keep the
// most-notable node per case-insensitive name and remap dropped ids to their winner so any
// surviving child reparents onto the real lineage.
export function dedupeRaws(raws: RawTaxon[]): RawTaxon[] {
  // 1. label overrides first
  const fixed = raws.map((r) => (LABEL_OVERRIDES[r.id] ? { ...r, name: LABEL_OVERRIDES[r.id] } : r));

  // 2. group by case-insensitive name, pick a winner per group
  const groups = new Map<string, RawTaxon[]>();
  for (const r of fixed) {
    const key = r.name.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  const winnerOf = (group: RawTaxon[]): RawTaxon =>
    group.reduce((best, r) => {
      if (sl(r) !== sl(best)) return sl(r) > sl(best) ? r : best;
      if (isCap(r) !== isCap(best)) return isCap(r) ? r : best;
      return best;
    });

  const dropToWinner = new Map<string, string>(); // dropped id -> winner id
  const kept: RawTaxon[] = [];
  for (const group of groups.values()) {
    const win = winnerOf(group);
    kept.push(win);
    for (const r of group) if (r.id !== win.id) dropToWinner.set(r.id, win.id);
  }

  // 3. reparent survivors whose parent was dropped
  return kept.map((r) =>
    r.parentId && dropToWinner.has(r.parentId)
      ? { ...r, parentId: dropToWinner.get(r.parentId)! }
      : r,
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tree/dedupe.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree/dedupe.ts src/lib/tree/dedupe.test.ts
git commit -m "feat(tree): dedupeRaws — collapse duplicate-name taxa + label overrides"
```

---

### Task 2: Wire dedupe into the build + regenerate data

**Files:**
- Modify: `scripts/build-tree.ts`

**Interfaces:**
- Consumes: `dedupeRaws` (Task 1).

- [ ] **Step 1: Import and apply dedupe before assembleTree**

In `scripts/build-tree.ts`, add the import next to the other tree imports:

```ts
import { dedupeRaws } from "../src/lib/tree/dedupe";
```

Change the assemble line (currently):

```ts
  const tree = assembleTree(pruneSubtree(raws, NEORNITHES), DINOSAURIA, dataVersion);
```

to dedupe first:

```ts
  const tree = assembleTree(pruneSubtree(dedupeRaws(raws), NEORNITHES), DINOSAURIA, dataVersion);
```

- [ ] **Step 2: Add a dedupe line to the build report**

In the `console.log` data-quality report block, add after the "total nodes" line:

```ts
  console.log("raw taxa (pre-dedupe):", raws.length);
  console.log("after dedupe:       ", dedupeRaws(raws).length);
```

- [ ] **Step 3: Verify types + run the unit suite**

Run: `npx tsc --noEmit`
Expected: no errors.
Run: `npx vitest run`
Expected: all pass (dedupe + existing suites; no engine change).

- [ ] **Step 4: Commit the wiring (data regenerated in Task 3)**

```bash
git add scripts/build-tree.ts
git commit -m "build(tree): apply dedupeRaws before assemble; report pre/post counts"
```

---

### Task 3: Regenerate committed data + verify

**Files:**
- Modify (regenerated): `src/data/tree.json`, `src/data/genera-index.json`, `src/data/genus-attributes.json`

**Interfaces:** none (data artifacts).

**Note:** This task requires the raw fetch inputs `data/raw-taxa.json` and `data/raw-pbdb.json` (gitignored). If absent, they must be re-fetched first: `npm run fetch:wikidata && npm run fetch:pbdb`. Confirm they exist before running the build.

- [ ] **Step 1: Confirm raw inputs exist**

Run: `ls -la data/raw-taxa.json data/raw-pbdb.json`
Expected: both files present. If missing, run `npm run fetch:wikidata && npm run fetch:pbdb` first (public APIs, no auth).

- [ ] **Step 2: Regenerate the committed data**

Run: `npm run build:data`
Expected: the "=== Mesozooa data build ===" report prints; "raw taxa (pre-dedupe)" ≈ 2508+ and "after dedupe" ≈ 283 fewer; "playable (pruned)" still **674**.

- [ ] **Step 3: Verify the dedupe landed (assertions on the rebuilt tree)**

Run:

```bash
node -e '
const d = require("./src/data/tree.json");
const n = d.nodes;
const byName = (nm) => Object.values(n).filter((x) => x.name.toLowerCase() === nm);
const tri = byName("triceratops");
console.log("Triceratops nodes:", tri.map((x) => x.name));            // expect exactly ["Triceratops"]
console.log("any Carnottaurus:", Object.values(n).some((x) => x.name === "Carnottaurus")); // false
console.log("Carnotaurus present:", Object.values(n).some((x) => x.name === "Carnotaurus")); // true
const lower = Object.values(n).filter((x) => x.name && x.name[0] === x.name[0].toLowerCase() && x.name !== "dinosaur");
console.log("lowercase-initial nodes (excl root):", lower.length);    // expect 0
console.log("total nodes:", Object.keys(n).length);
console.log("playable:", Object.values(n).filter((x) => x.playable).length); // expect 674
'
```

Expected: `Triceratops nodes: [ "Triceratops" ]`; `any Carnottaurus: false`; `Carnotaurus present: true`; `lowercase-initial nodes: 0`; `playable: 674`.

If `lowercase-initial nodes` is not 0, investigate (a survivor whose whole name group was lowercase — should not happen after overrides + dedupe given current data; report before proceeding).

- [ ] **Step 4: Verify the app still builds + full suite green**

Run: `npx vitest run`  → all pass.
Run: `npm run build > /tmp/mzbuild.log 2>&1 && echo OK || tail -20 /tmp/mzbuild.log`  → `OK`.

- [ ] **Step 5: Commit the regenerated data**

```bash
git add src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json
git commit -m "data: regenerate tree with dedupe (283 ghost nodes removed; Carnotaurus fixed)"
```

---

## Self-Review

**Spec coverage:**
- Dedupe by case-insensitive name, keep max-sitelinks (tie→capitalized) → Task 1 `winnerOf`. ✓
- Reparent survivors whose parent dropped → Task 1 step 3 + reparent test. ✓
- Label overrides applied BEFORE dedupe → Task 1 `dedupeRaws` step 1 + ordering test (`Carnottaurus`). ✓
- `LABEL_OVERRIDES = { Q18510948: "Carnotaurus" }` → Task 1. ✓
- Pure transform over raws, wired before assembleTree → Task 2. ✓
- Regenerate committed data, no re-fetch (unless raws absent) → Task 3 (with the fetch fallback noted). ✓
- Game pool unchanged (674 playable) → asserted Task 3 step 3 + full suite Task 3 step 4. ✓
- Post-build assertions (Triceratops once, no Carnottaurus, 0 lowercase, node count drops) → Task 3 step 3. ✓

**Placeholder scan:** none — every code/command step is concrete.

**Type consistency:** `dedupeRaws(raws: RawTaxon[]): RawTaxon[]` and `LABEL_OVERRIDES` defined in Task 1, imported/used identically in Task 2. `RawTaxon` fields match `types.ts` (`sitelinks?: number` → `sl` defaults to 0).

**Note:** Task 3 is data-artifact regeneration; its "test" is the assertion block + full suite, per project convention (no unit test for generated JSON). If the raw fetch inputs are missing in the execution environment, Task 3 blocks on a re-fetch — flagged in the task.

## Non-goals

- Re-fetching from Wikidata unless raw inputs are absent (dedupe is a pure transform over existing raws).
- SPARQL-time filtering.
- Title-casing any residual lowercase display names (none expected post-dedupe; separate follow-on if it recurs).
- Any game-pool, warmth, or clue change.
