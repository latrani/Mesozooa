# Name Disagreement Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover node names from Wikidata P225 when the `en` label is absent (fixes Troodon), and detect name disagreements at build time — failing the build on any undecided one, resolving via a curated `NAME_DECISIONS` map, and recording all disagreements to a committed report.

**Architecture:** Detection is fetch-time (only the fetch has network: SPARQL gains P225 + enwiki title; a redirect pass adds advisory context). Adjudication is build-time and pure (`names.ts`): gather the distinct present name-candidates per node; ≥2 distinct = a conflict; an undecided conflict fails the build. A curated `NAME_DECISIONS` map (`{name, note}`) resolves conflicts and replaces the one-off `LABEL_OVERRIDES`.

**Tech Stack:** Svelte 5 + TypeScript + Vite. Node build scripts (`scripts/*.ts`) run under tsx. Pure logic is TDD-tested with Vitest.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` before committing.
- **Test command:** `npm test` (Vitest, run-once). Single file: `npx vitest run src/lib/tree/names.test.ts`.
- **Placeholder signal:** `fetch-wikidata.ts` seeds each node `name = qid(...)`, so a node whose `en` label is absent has `name === id`. Adjudication MUST treat `name === id` as "no en candidate" (exclude the placeholder), else it'd count the Q-id as a name.
- **Candidate comparison is exact-string** (trimmed, NO case- or space-folding) — "Carnottaurus" vs "Carnotaurus" and "Drinker" vs "Drinker nisti" MUST register as distinct so they surface for decision.
- **Redirects are advisory only** — never block the build (28% of nodes redirect benignly).
- **Apply-decisions-before-dedupe ordering** is load-bearing (a corrected name must become a case-twin of its lowercase ghost so the ghost merges). Preserve it.
- **Report is committed & deterministic** — `data/name-disagreements.md`, stable sort by Q-id, no timestamps (diff changes only when the disagreement set changes).
- Data-pipeline changes need a `fetch:wikidata` → `build:data` re-run to land (Task 6, controller-owned).

---

### Task 1: `RawTaxon` gains the name-signal fields

**Files:**
- Modify: `src/lib/tree/types.ts` (`RawTaxon`)

**Interfaces:**
- Produces: `RawTaxon` with optional `taxonName?: string` (P225), `enwikiTitle?: string`, `redirectTarget?: string`.

- [ ] **Step 1: Add the fields**

In `src/lib/tree/types.ts`, extend `RawTaxon`:

```ts
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
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean (optional fields, no consumers broken).

```bash
git add src/lib/tree/types.ts
git commit -m "feat(tree): add taxonName/enwikiTitle/redirectTarget to RawTaxon"
```

---

### Task 2: Pure name adjudication (`names.ts`)

**Files:**
- Create: `src/lib/tree/names.ts`
- Test: `src/lib/tree/names.test.ts`

**Interfaces:**
- Consumes: `RawTaxon` (Task 1); `NAME_DECISIONS` shape `Record<string, { name: string; note: string }>` (defined here as a type; the actual map is Task 3).
- Produces:
  - `nameCandidates(raw: RawTaxon): string[]` — distinct, trimmed, present name candidates from `{ name (unless name===id placeholder), taxonName, enwikiTitle }`, in that priority order, de-duplicated preserving first occurrence.
  - `resolveName(raw: RawTaxon, decisions: Record<string, { name: string }>): string` — `decisions[id].name` if present; else the sole candidate; else (0 candidates) the placeholder `raw.name`. When ≥2 candidates and no decision, returns the first (en-priority) candidate — callers that must not ship an undecided name use `findConflicts` to gate first.
  - `interface NameConflict { id: string; candidates: string[]; en?: string; taxonName?: string; enwikiTitle?: string; redirectTarget?: string }`
  - `findConflicts(raws: RawTaxon[], decisions: Record<string, { name: string }>): NameConflict[]` — every raw with ≥2 distinct candidates AND no decision, stable-sorted by id.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/tree/names.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { nameCandidates, resolveName, findConflicts } from "./names";
import type { RawTaxon } from "./types";

const raw = (over: Partial<RawTaxon> & { id: string }): RawTaxon => ({
  name: over.id, rankId: null, parentId: null, ...over,
});

describe("nameCandidates", () => {
  it("excludes the Q-id placeholder (name === id) as a non-candidate", () => {
    // Troodon: no en label (name===id), P225 present
    expect(nameCandidates(raw({ id: "Q131043", taxonName: "Troodon", enwikiTitle: "Troodon" })))
      .toEqual(["Troodon"]);
  });
  it("collapses identical candidates to one", () => {
    expect(nameCandidates(raw({ id: "Q1", name: "Allosaurus", taxonName: "Allosaurus", enwikiTitle: "Allosaurus" })))
      .toEqual(["Allosaurus"]);
  });
  it("keeps distinct candidates in en/P225/enwiki priority order", () => {
    expect(nameCandidates(raw({ id: "Q18510948", name: "Carnottaurus", taxonName: "Carnotaurus", enwikiTitle: "Carnotaurus" })))
      .toEqual(["Carnottaurus", "Carnotaurus"]);
  });
  it("treats trimmed-equal as identical but case/space differences as distinct", () => {
    expect(nameCandidates(raw({ id: "Q2", name: "Drinker", taxonName: "Drinker nisti" })))
      .toEqual(["Drinker", "Drinker nisti"]);
    expect(nameCandidates(raw({ id: "Q3", name: "bird", enwikiTitle: "Bird", taxonName: "Aves" })))
      .toEqual(["bird", "Bird", "Aves"]);
  });
});

describe("resolveName", () => {
  it("uses a decision when present", () => {
    expect(resolveName(raw({ id: "Q18510948", name: "Carnottaurus", taxonName: "Carnotaurus" }),
      { Q18510948: { name: "Carnotaurus" } })).toBe("Carnotaurus");
  });
  it("uses the sole candidate when unambiguous (Troodon)", () => {
    expect(resolveName(raw({ id: "Q131043", taxonName: "Troodon" }), {})).toBe("Troodon");
  });
  it("falls back to the placeholder when there are no candidates", () => {
    expect(resolveName(raw({ id: "Q999" }), {})).toBe("Q999");
  });
});

describe("findConflicts", () => {
  it("flags ≥2-distinct-candidate nodes with no decision, sorted by id", () => {
    const raws = [
      raw({ id: "Q5", name: "Iguanodontia", taxonName: "Iguaonodontia" }),
      raw({ id: "Q1", name: "Allosaurus", taxonName: "Allosaurus" }), // agree -> no conflict
      raw({ id: "Q131043", taxonName: "Troodon" }),                    // 1 candidate -> no conflict
      raw({ id: "Q3", name: "bird", enwikiTitle: "Bird", taxonName: "Aves", redirectTarget: "Bird" }),
    ];
    const conflicts = findConflicts(raws, {});
    expect(conflicts.map((c) => c.id)).toEqual(["Q3", "Q5"]);
    expect(conflicts[0]).toMatchObject({ id: "Q3", en: "bird", taxonName: "Aves", redirectTarget: "Bird" });
  });
  it("does not flag a conflict that has a decision", () => {
    const raws = [raw({ id: "Q18510948", name: "Carnottaurus", taxonName: "Carnotaurus" })];
    expect(findConflicts(raws, { Q18510948: { name: "Carnotaurus" } })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/tree/names.test.ts`
Expected: FAIL — `names.ts` does not exist.

- [ ] **Step 3: Implement `names.ts`**

Create `src/lib/tree/names.ts`:

```ts
import type { RawTaxon } from "./types";

// The distinct, present name candidates for a node, in en → P225 → enwiki priority order.
// The `name` field is the en label EXCEPT when it still equals the id (the fetch's Q-id
// placeholder = "no en label"), in which case it is not a candidate.
export function nameCandidates(raw: RawTaxon): string[] {
  const raw3 = [
    raw.name === raw.id ? undefined : raw.name,
    raw.taxonName,
    raw.enwikiTitle,
  ];
  const out: string[] = [];
  for (const c of raw3) {
    const v = c?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

// Resolve a node's display name: an explicit decision wins; else the sole candidate; else (no
// candidates at all) the placeholder name. With ≥2 candidates and no decision this returns the
// first (en-priority) candidate — callers that must not ship an undecided name gate on
// findConflicts() first (build-tree fails the build).
export function resolveName(
  raw: RawTaxon,
  decisions: Record<string, { name: string }>,
): string {
  const decided = decisions[raw.id];
  if (decided) return decided.name;
  const cands = nameCandidates(raw);
  return cands[0] ?? raw.name;
}

export interface NameConflict {
  id: string;
  candidates: string[];
  en?: string;
  taxonName?: string;
  enwikiTitle?: string;
  redirectTarget?: string;
}

// Every node with ≥2 distinct name candidates and no decision — the undecided disagreements
// that must block the build. Stable-sorted by id.
export function findConflicts(
  raws: RawTaxon[],
  decisions: Record<string, { name: string }>,
): NameConflict[] {
  const conflicts: NameConflict[] = [];
  for (const raw of raws) {
    if (decisions[raw.id]) continue;
    const candidates = nameCandidates(raw);
    if (candidates.length < 2) continue;
    conflicts.push({
      id: raw.id,
      candidates,
      en: raw.name === raw.id ? undefined : raw.name,
      taxonName: raw.taxonName,
      enwikiTitle: raw.enwikiTitle,
      redirectTarget: raw.redirectTarget,
    });
  }
  conflicts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return conflicts;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/tree/names.test.ts`
Expected: PASS — all cases.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/tree/names.ts src/lib/tree/names.test.ts
git commit -m "feat(tree): pure name adjudication (candidates, resolveName, findConflicts)"
```

---

### Task 3: `NAME_DECISIONS` map replaces `LABEL_OVERRIDES`

**Files:**
- Create: `src/lib/tree/name-decisions.ts`
- Modify: `src/lib/tree/dedupe.ts` (import decisions, use `resolveName` for the rename step)
- Test: `src/lib/tree/dedupe.test.ts` (update import + the `LABEL_OVERRIDES` assertion)

**Interfaces:**
- Consumes: `resolveName` (Task 2).
- Produces: `NAME_DECISIONS: Record<string, { name: string; note: string }>`.

- [ ] **Step 1: Create the decisions map**

Create `src/lib/tree/name-decisions.ts`, seeded from the audit (evidence-backed by ≥2-source
agreement + enwiki tie-breaker; exact strings reconciled against the fresh report in Task 6):

```ts
// Curated resolutions for node-name disagreements (en label vs P225 vs enwiki title). A Q-id
// here short-circuits conflict detection — the decision IS the resolution. `note` is provenance
// (never rendered). See docs/superpowers/specs/2026-07-16-name-disagreement-resolution-design.md.
export const NAME_DECISIONS: Record<string, { name: string; note: string }> = {
  // en typo; P225 + enwiki agree
  Q18510948: { name: "Carnotaurus", note: "en label typo 'Carnottaurus'" },
  Q132857:   { name: "Mussaurus", note: "en label typo 'Mussaurdes'" },
  // P225 typo; keep en (en + enwiki agree)
  Q134190:   { name: "Iguanodontia", note: "P225 typo 'Iguaonodontia'" },
  Q77853179: { name: "Colossosauria", note: "P225 typo 'Colososauria'" },
  Q3349337:  { name: "Odontornithes", note: "P225 typo 'Odonthornithes'" },
  Q3079242:  { name: "Rhadinosaurus", note: "P225 typo 'Rhadinososaurus'" },
  // vernacular -> scientific clade name
  Q5113:     { name: "Aves", note: "en/enwiki vernacular 'bird'; use scientific clade name" },
  // binomial/string -> genus (no-space preference)
  Q131236:   { name: "Prosauropoda", note: "en 'Prosauropod'; use proper clade form" },
  Q134751:   { name: "Drinker", note: "en binomial 'Drinker nisti'; use genus" },
  Q593763:   { name: "Zanabazar", note: "en binomial 'Zanabazar junior'; use genus" },
  Q6126872:  { name: "Shanshanosaurus", note: "en binomial; use genus" },
  Q5028563:  { name: "Camptodontus", note: "en is a disambiguation string; use genus" },
  // P225 packs two names in one statement; keep clean en
  Q62397920: { name: "Eutyrannosauria", note: "P225 'Eutyrannosauria, Albertosauria'; keep en" },
  // taxonomy disputes — resolve toward the currently-accepted taxon (enwiki redirect target is a
  // good proxy for where a curious player lands)
  Q131161:   { name: "Pachycephalosaurus spinifer", note: "P225 'Stygimoloch' sunk into Pachycephalosaurus (enwiki redirects there)" },
  Q16975532: { name: "Camarasaurus lewisi", note: "P225 'Cathetosaurus'; enwiki redirects to Camarasaurus lewisi" },
  Q134591:   { name: "Becklespinax", note: "en binomial 'Altispinax dunkeri'; enwiki redirects to Becklespinax" },
  Q988566:   { name: "Dornraptor", note: "P225/enwiki 'Dornraptor' (Merosaurus reassigned)" },
};
```

- [ ] **Step 2: Rewire `dedupe.ts`**

In `src/lib/tree/dedupe.ts`, replace the `LABEL_OVERRIDES` const + its use in step 1 of
`dedupeRaws`. Remove the `LABEL_OVERRIDES` export and change the imports/rename:

```ts
import type { RawTaxon } from "./types";
import { NAME_DECISIONS } from "./name-decisions";
import { resolveName } from "./names";
```

Replace the step-1 line:

```ts
  const fixed = raws.map((r) => (LABEL_OVERRIDES[r.id] ? { ...r, name: LABEL_OVERRIDES[r.id] } : r));
```

with (resolve every node's name from decisions + candidates BEFORE grouping, preserving the
apply-before-dedupe ordering):

```ts
  // 1. resolve each node's name (decision, or P225/enwiki fallback) BEFORE dedupe so a corrected
  //    name becomes a case-twin of its lowercase ghost and the ghost merges.
  const fixed = raws.map((r) => {
    const name = resolveName(r, NAME_DECISIONS);
    return name === r.name ? r : { ...r, name };
  });
```

- [ ] **Step 3: Update `dedupe.test.ts`**

In `src/lib/tree/dedupe.test.ts`, change the import line to drop `LABEL_OVERRIDES`:

```ts
import { dedupeRaws } from "./dedupe";
```

And replace the test that asserts `LABEL_OVERRIDES["Q18510948"]` (around line 69) with an
equivalent behavioral check via the decisions map:

```ts
  it("resolves a decided node's name (Carnotaurus) so it dedupes against the lowercase ghost", () => {
    const out = dedupeRaws([
      R("A", "Root", null, 10),
      R("Q18510948", "Carnottaurus", "A", 53),
      R("ghost", "carnotaurus", "A", 0),
    ]);
    expect(out.map((r) => r.id).sort()).toEqual(["A", "Q18510948"]);
    expect(out.find((r) => r.id === "Q18510948")!.name).toBe("Carnotaurus");
  });
```

(Keep every other `dedupeRaws` test as-is; the `R(...)` helper sets `name` to a real string, so
`name !== id` and `resolveName` returns that name unchanged — existing behavior preserved.)

- [ ] **Step 4: Run tests + typecheck**

Run: `npx vitest run src/lib/tree/dedupe.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean. Grep confirms the old name is gone: `grep -rn LABEL_OVERRIDES src` → no matches.

- [ ] **Step 5: Commit**

```bash
git add src/lib/tree/name-decisions.ts src/lib/tree/dedupe.ts src/lib/tree/dedupe.test.ts
git commit -m "feat(tree): NAME_DECISIONS map replaces LABEL_OVERRIDES; dedupe uses resolveName"
```

---

### Task 4: Fetch harvests P225 + enwiki title + redirect target

**Files:**
- Modify: `scripts/fetch-wikidata.ts` (enrich SPARQL + redirect resolution pass)
- Create: `scripts/enwiki-title.ts` (pure title-from-URL helper)
- Test: `scripts/enwiki-title.test.ts`

**Interfaces:**
- Produces: `enwikiTitleFromUrl(url: string | undefined): string | undefined` — decode the last path segment of an `en.wikipedia.org/wiki/<Title>` URL (spaces from `_`, percent-decoded).
- Side effect: `data/raw-taxa.json` nodes now carry `taxonName`, `enwikiTitle`, `redirectTarget`.

- [ ] **Step 1: Write the failing test for the title helper**

Create `scripts/enwiki-title.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { enwikiTitleFromUrl } from "./enwiki-title";

describe("enwikiTitleFromUrl", () => {
  it("extracts and decodes the article title", () => {
    expect(enwikiTitleFromUrl("https://en.wikipedia.org/wiki/Tyrannosaurus")).toBe("Tyrannosaurus");
    expect(enwikiTitleFromUrl("https://en.wikipedia.org/wiki/Drinker_nisti")).toBe("Drinker nisti");
    expect(enwikiTitleFromUrl("https://en.wikipedia.org/wiki/Foo%20bar")).toBe("Foo bar");
  });
  it("returns undefined for missing/non-article urls", () => {
    expect(enwikiTitleFromUrl(undefined)).toBeUndefined();
    expect(enwikiTitleFromUrl("")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run scripts/enwiki-title.test.ts`
Expected: FAIL — `enwiki-title.ts` does not exist.

- [ ] **Step 3: Implement the helper**

Create `scripts/enwiki-title.ts`:

```ts
// The enwiki article title from a canonical /wiki/<Title> URL (underscores -> spaces, decoded).
export function enwikiTitleFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  const m = url.match(/\/wiki\/(.+)$/);
  if (!m) return undefined;
  try {
    return decodeURIComponent(m[1]).replace(/_/g, " ");
  } catch {
    return m[1].replace(/_/g, " ");
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run scripts/enwiki-title.test.ts`
Expected: PASS.

- [ ] **Step 5: Add P225 to the enrich SPARQL and populate the fields**

In `scripts/fetch-wikidata.ts`, the `enrich` query's SELECT/OPTIONALs get `?taxonName`:

```ts
    const rows = await sparql(`
      SELECT ?taxon ?taxonLabel ?taxonName ?img ?article ?sitelinks WHERE {
        VALUES ?taxon { ${values} }
        OPTIONAL { ?taxon wdt:P225 ?taxonName }
        OPTIONAL { ?taxon wdt:P18 ?img }
        OPTIONAL { ?article schema:about ?taxon ; schema:isPartOf <https://en.wikipedia.org/> }
        OPTIONAL { ?taxon wikibase:sitelinks ?sitelinks }
        SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
      }`);
```

In the row loop, populate the new fields (import the helper at top:
`import { enwikiTitleFromUrl } from "./enwiki-title";`):

```ts
    for (const r of rows) {
      const node = byId.get(qid(r.taxon!));
      if (!node) continue;
      if (r.taxonLabel) node.name = r.taxonLabel;
      if (r.taxonName) node.taxonName = r.taxonName;
      if (r.img) node.imageUrl = r.img;
      if (r.article) { node.wikipediaUrl = r.article; node.enwikiTitle = enwikiTitleFromUrl(r.article); }
      if (r.sitelinks) node.sitelinks = Number(r.sitelinks);
    }
```

- [ ] **Step 6: Add the redirect-resolution pass (advisory)**

In `scripts/fetch-wikidata.ts`, after `enrich(...)` completes in `main`, add a pass that batches
the enwiki titles through the Wikipedia API and sets `redirectTarget` where an article redirects.
Add this function and call it before writing the file:

```ts
async function resolveRedirects(taxa: RawTaxon[]): Promise<void> {
  const withTitle = taxa.filter((t) => t.enwikiTitle);
  const BATCH = 50;
  for (let i = 0; i < withTitle.length; i += BATCH) {
    const batch = withTitle.slice(i, i + BATCH);
    const titles = batch.map((t) => t.enwikiTitle!).join("|");
    const url =
      "https://en.wikipedia.org/w/api.php?action=query&redirects=1&format=json&titles=" +
      encodeURIComponent(titles);
    const res = await fetch(url, { headers: { "User-Agent": "Mesozooa/0.1 (dinosaur cladistics game)" } });
    if (!res.ok) { await new Promise((r) => setTimeout(r, 1500)); continue; }
    const json = await res.json();
    const rmap = new Map<string, string>();
    for (const rd of json.query?.redirects ?? []) rmap.set(rd.from, rd.to);
    const norm = new Map<string, string>();
    for (const nz of json.query?.normalized ?? []) norm.set(nz.from, nz.to);
    for (const t of batch) {
      const key = norm.get(t.enwikiTitle!) ?? t.enwikiTitle!;
      const target = rmap.get(key);
      if (target && target !== t.enwikiTitle) t.redirectTarget = target;
    }
    await new Promise((r) => setTimeout(r, 600)); // be polite to the API
    console.log(`redirects ${Math.min(i + BATCH, withTitle.length)}/${withTitle.length}`);
  }
}
```

And in `main`, after `await enrich(...)`:

```ts
  await resolveRedirects(inScope);
```

- [ ] **Step 7: Typecheck + commit (fetch not run here — that's Task 6)**

Run: `npx tsc --noEmit`
Expected: clean. Do NOT run the fetch in this task; the live harvest + regeneration is Task 6.

```bash
git add scripts/fetch-wikidata.ts scripts/enwiki-title.ts scripts/enwiki-title.test.ts
git commit -m "feat(fetch): harvest P225 + enwiki title + advisory redirect target"
```

---

### Task 5: Build adjudicates, writes the report, fails on undecided conflicts

**Files:**
- Modify: `scripts/build-tree.ts`

**Interfaces:**
- Consumes: `findConflicts`, `NameConflict` (Task 2); `NAME_DECISIONS` (Task 3).
- Side effect: writes `data/name-disagreements.md` (committed); exits non-zero if any undecided conflict.

- [ ] **Step 1: Wire adjudication into `build-tree.ts`**

In `scripts/build-tree.ts`, add imports:

```ts
import { findConflicts, type NameConflict } from "../src/lib/tree/names";
import { NAME_DECISIONS } from "../src/lib/tree/name-decisions";
```

Immediately after `const raws: RawTaxon[] = JSON.parse(...)` (before building the tree), detect
conflicts, write the report, and fail if any are undecided:

```ts
  // Name-disagreement gate: any node with ≥2 distinct name candidates and no decision blocks the
  // build. Always (re)write the committed report deterministically.
  const conflicts = findConflicts(raws, NAME_DECISIONS);
  await mkdir("data", { recursive: true });
  await writeFile("data/name-disagreements.md", renderReport(conflicts));
  if (conflicts.length > 0) {
    console.error(`\n✗ ${conflicts.length} undecided name disagreement(s). See data/name-disagreements.md`);
    console.error("  Add each Q-id to NAME_DECISIONS (src/lib/tree/name-decisions.ts) and rebuild.");
    process.exit(1);
  }
```

Add the report renderer (deterministic — sorted by findConflicts already; no timestamp):

```ts
function renderReport(conflicts: NameConflict[]): string {
  const lines = [
    "# Name disagreements",
    "",
    "Auto-generated by `build:data`. Each row is a node whose Wikidata `en` label, P225 taxon",
    "name, and/or enwiki title disagree and that has NO entry in NAME_DECISIONS. The build fails",
    "while any remain. Resolve by adding the Q-id to `src/lib/tree/name-decisions.ts`.",
    "",
    conflicts.length === 0 ? "_None — all disagreements are decided._" : `${conflicts.length} undecided:`,
    "",
  ];
  for (const c of conflicts) {
    const parts = [
      `- **${c.id}**`,
      c.en ? `en=\`${c.en}\`` : null,
      c.taxonName ? `P225=\`${c.taxonName}\`` : null,
      c.enwikiTitle ? `enwiki=\`${c.enwikiTitle}\`` : null,
      c.redirectTarget ? `↳redirects→\`${c.redirectTarget}\`` : null,
    ].filter(Boolean);
    lines.push(parts.join("  "));
  }
  lines.push("");
  return lines.join("\n");
}
```

- [ ] **Step 2: Verify the build still passes against CURRENT data**

The committed `data/raw-taxa.json` predates Task 4's fields, so every node has at most the `en`
candidate → zero conflicts → build must still pass and emit an empty report.

Run: `npm run build:data` (or the equivalent `tsx scripts/build-tree.ts`)
Expected: exits 0; `data/name-disagreements.md` says "_None — all disagreements are decided._";
`src/data/tree.json` regenerates. Verify Carnotaurus still present, no `Carnottaurus`:

```bash
node -e 'const t=require("./src/data/tree.json"); const N=Object.values(t.nodes); console.log("Carnotaurus:", N.some(n=>n.name==="Carnotaurus"), "| Carnottaurus:", N.some(n=>n.name==="Carnottaurus"));'
```
Expected: `Carnotaurus: true | Carnottaurus: false`.

- [ ] **Step 3: Typecheck + commit**

```bash
npx tsc --noEmit
git add scripts/build-tree.ts data/name-disagreements.md src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json
git commit -m "feat(build): fail on undecided name disagreements; write committed report"
```

---

### Task 6: Live re-fetch + regenerate + reconcile decisions (controller-owned)

Network + iterative; the controller runs this (subagents don't fetch). This is where the new raw
fields land and the real disagreement set surfaces.

**Files:**
- Regenerated: `data/raw-taxa.json` (gitignored), `src/data/tree.json`, `src/data/genera-index.json`, `src/data/genus-attributes.json`, `data/name-disagreements.md`
- Possibly modified: `src/lib/tree/name-decisions.ts` (reconcile with the real report)

- [ ] **Step 1: Re-fetch Wikidata (harvests the new fields + redirects)**

Run: `npm run fetch:wikidata`
Expected: completes; `data/raw-taxa.json` nodes now carry `taxonName`/`enwikiTitle`/`redirectTarget`.
Spot-check Troodon recovered its name signal:
```bash
node -e 'const r=require("./data/raw-taxa.json").find(x=>x.id==="Q131043"); console.log(r && {name:r.name, taxonName:r.taxonName, enwiki:r.enwikiTitle});'
```
Expected: `taxonName: "Troodon"` present.

- [ ] **Step 2: Build; reconcile any undecided conflicts**

Run: `npm run build:data`
- If it exits non-zero, open `data/name-disagreements.md`, decide each listed Q-id, add it to
  `NAME_DECISIONS` (with a `note`), and re-run. Repeat until the build exits 0.
- The Task 3 seed should cover the known 17; only genuinely new drift (fresh Wikidata edits since
  the audit) would add rows. For each new one, apply the same rule: exact string that ≥2 of
  {en, P225, enwiki} agree on, or the currently-accepted taxon for a dispute (redirect target as
  the tie-breaker), preferring the no-space form.

- [ ] **Step 3: Verify Troodon + the fixed names landed**

```bash
node -e 'const t=require("./src/data/tree.json"); const N=Object.values(t.nodes); const bare=N.filter(n=>/^Q\d+$/.test(n.name)); console.log("bare Q-id names:", bare.length); console.log("Troodon:", N.some(n=>n.name==="Troodon"), "| Carnotaurus:", N.some(n=>n.name==="Carnotaurus"), "| Aves:", N.some(n=>n.name==="Aves"));'
```
Expected: `bare Q-id names: 0` (or only genuinely name-less items), `Troodon: true`, `Carnotaurus: true`, `Aves: true`.

- [ ] **Step 4: Full gate + commit the regenerated data**

Run: `npm test && npx tsc --noEmit`
Expected: all green.

```bash
git add src/lib/tree/name-decisions.ts data/name-disagreements.md src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json
git commit -m "data: regenerate with P225 name recovery + resolved disagreements (Troodon restored)"
```

- [ ] **Step 5: Update deferred-findings + CLAUDE.md**

- In `docs/superpowers/deferred-findings.md`, mark the lowercase-"bird" (Aves) item RESOLVED
  (now decided → `Aves` via `NAME_DECISIONS`), and note the `displayName` "dinosaur"→"Dinosauria"
  special-case can stay or fold into decisions (leave as-is unless trivial).
- If node/pool counts shift, update `CLAUDE.md` "Key parameters".

```bash
git add docs/superpowers/deferred-findings.md CLAUDE.md
git commit -m "docs: mark lowercase-bird resolved; refresh counts after name-recovery rebuild"
```

---

## Self-review notes

- **Spec coverage:** detection at fetch (Task 4), pure adjudication (Task 2), decisions map replacing LABEL_OVERRIDES (Task 3), fail-closed build + committed report (Task 5), live regen + reconcile (Task 6), RawTaxon fields (Task 1). All spec sections covered.
- **Placeholder handling:** `name === id` excluded from candidates — Task 2 `nameCandidates` + its Troodon test.
- **Exact-string comparison (no folding):** Task 2 tests assert `bird`/`Bird`/`Aves` are 3 distinct and `Drinker`/`Drinker nisti` are 2 distinct.
- **Redirects advisory only:** carried on `NameConflict`/report, never gate `findConflicts` (Task 2). No redirect ever calls `process.exit`.
- **Apply-before-dedupe preserved:** Task 3 replaces the rename step in-place; `resolveName` returns the same string for normal nodes so all other dedupe tests hold.
- **Deterministic committed report:** stable id-sort (Task 2 `findConflicts`), no timestamp in `renderReport` (Task 5).
- **Safe landing order:** Tasks 1–5 build green against current data (new fields absent → ≤1 candidate → no conflicts); Task 6's fetch is what surfaces reality. Task 5 Step 2 explicitly verifies the pre-fetch build stays green.
- **Type consistency:** `resolveName`/`findConflicts`/`NameConflict`/`NAME_DECISIONS` signatures identical across Tasks 2, 3, 5.
