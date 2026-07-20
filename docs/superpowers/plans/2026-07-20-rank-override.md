# Rank Override (#43) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recover 3 dinosaur genera (Eodromaeus, Overoraptor, Nemegtonykus) that Wikidata mis-tags `P105 = species` on their genus item — so `assembleTree`'s `RANK_GENUS` filter currently drops them — by overriding their rank to genus at harvest time. All 3 have PBDB clues, so they become playable.

**Architecture:** A curated `RANK_OVERRIDES` map (Q-id → rank Q-id, mirroring `NAME_DECISIONS`) applied in `fetchStructure` where each `RawTaxon.rankId` is assigned. The corrected rank propagates through the whole pipeline (scope → enrich → species-cluster resolution → PBDB join → build) with no other change. A build-time candidate report surfaces any future un-listed mis-tagged genus. Then re-harvest + rebuild.

**Tech Stack:** TypeScript, tsx-run harvest/build scripts, Vitest. `verbatimModuleSyntax` ON — type-only imports MUST use `import type`.

## Global Constraints

- **`verbatimModuleSyntax` is ON.** `RANK_OVERRIDES` and `RANK_GENUS`/`RANK_SPECIES` are runtime VALUE imports; types stay `import type`. Run `npx tsc --noEmit` before committing.
- **The override only rewrites `rankId`.** It must NOT touch `name`, `parentId`, or anything else. The 3 targets keep their real clade parents (Theropoda / Saurischia / Parvicursorinae).
- **#46 prerequisite is satisfied** (Tawa is pinned on main): promoting Eodromaeus into the Theropoda-direct cap-7 bucket will bump Tawa on notability, but Tawa's pin holds its slot. Verify Tawa stays playable after the rebuild.
- **Candidate report warns, never blocks.** A missed promotion is a quiet omission, not data corruption — the report is advisory (unlike the fail-closed name gate).
- **Never run `build:data` on stale raws** (CLAUDE.md). This plan RE-HARVESTS (`fetch:wikidata` + `fetch:pbdb`) before building, because the 3 targets must enter `raw-taxa.json` and then be queried in PBDB for the first time.
- **Merge workflow:** feature branch → main, no PRs, Indi pushes. Commit fixes with `Closes #43`.

---

### Task 1: `RANK_OVERRIDES` map + apply in `fetchStructure`

**Files:**
- Create: `src/lib/tree/rank-overrides.ts`
- Modify: `scripts/fetch-wikidata.ts` (`fetchStructure` row loop, ~lines 19-26; add import)

**Interfaces:**
- Consumes: nothing.
- Produces: `RANK_OVERRIDES: Record<string, string>` (Q-id → rank Q-id). Applied so a listed taxon's `RawTaxon.rankId` becomes the override value instead of its Wikidata `P105`.

- [ ] **Step 1: Create the overrides module**

Create `src/lib/tree/rank-overrides.ts`:

```typescript
// Wikidata genus items MIS-TAGGED P105=species on the genus item itself, so assembleTree's
// RANK_GENUS filter drops them. Override each to genus (Q34740) at harvest so they're kept.
// Verified by WDQS sweep 2026-07-20 (single-word en label, real clade parent, has en label, has a
// PBDB clue). See docs/superpowers/specs/2026-07-20-rank-override-design.md. Keyed by Q-id (exact,
// no homonym risk), mirroring NAME_DECISIONS.
export const RANK_OVERRIDES: Record<string, string> = {
  Q122069485: "Q34740", // Eodromaeus — parent Theropoda; basal theropod, Carnian, Argentina (Ischigualasto)
  Q95715804:  "Q34740", // Overoraptor — parent Saurischia; Cenomanian–Turonian, Argentina
  Q72914385:  "Q34740", // Nemegtonykus — parent Parvicursorinae; alvarezsaurid, Maastrichtian, Mongolia
};
```

- [ ] **Step 2: Apply the override in `fetchStructure`**

In `scripts/fetch-wikidata.ts`, add the import near the other value imports (line ~5, alongside `DINOSAURIA, NEORNITHES, RANK_SPECIES`):

```typescript
import { RANK_OVERRIDES } from "../src/lib/tree/rank-overrides";
```

Then in `fetchStructure`'s row loop (currently ~lines 19-26), change the `rankId` assignment. Replace:

```typescript
    for (const r of rows) {
      raws.push({
        id: qid(r.taxon!),
        name: qid(r.taxon!), // filled in Phase 2
        rankId: r.rank ? qid(r.rank) : null,
        parentId: qid(r.parent!),
      });
    }
```

with:

```typescript
    for (const r of rows) {
      const id = qid(r.taxon!);
      raws.push({
        id,
        name: id, // filled in Phase 2
        // A curated rank override (#43) corrects genus items Wikidata mis-tags P105=species; it wins
        // over the raw P105 so assembleTree keeps the lineage. Only rankId is affected.
        rankId: RANK_OVERRIDES[id] ?? (r.rank ? qid(r.rank) : null),
        parentId: qid(r.parent!),
      });
    }
```

- [ ] **Step 3: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. (`RANK_OVERRIDES` is imported and used; no unused-import error.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/tree/rank-overrides.ts scripts/fetch-wikidata.ts
git commit -m "feat(harvest): RANK_OVERRIDES — promote genus items Wikidata mis-tags as species"
```

---

### Task 2: Candidate report for future mis-tagged genera

Emit a build-time advisory listing any species-ranked taxon that looks like a mis-tagged genus but is NOT in `RANK_OVERRIDES`, so a future case surfaces without silent auto-action.

**Files:**
- Modify: `scripts/fetch-wikidata.ts` (`main()`, after `pruneSubtree`, ~line 120; add report + import)

**Interfaces:**
- Consumes: the post-`pruneSubtree(NEORNITHES)` `pruned` raws (already in scope in `main()`), `RANK_OVERRIDES` (Task 1), `RANK_SPECIES`.
- Produces: console output only (advisory). No data written.

**Why post-prune:** the ~195 modern-bird false positives (species parented to passerine families like Aegithalidae) live UNDER Neornithes and are removed by `pruneSubtree(NEORNITHES)`. Running the detector on `pruned` filters most of them structurally — no label lookup needed. A species-ranked node that SURVIVES the prune with a non-species parent is a likely mis-tag candidate.

**Honest caveat on expected output:** the prune removes Neornithes-descendant species, but a handful of *stem*-bird or otherwise-not-under-Neornithes species-tagged stubs (the labelless `Q…` items seen in the 2026-07-20 sweep, e.g. an abelisaur-adjacent stub, stem birds parented directly under Aves) MAY survive and appear in the report. That's acceptable — the report is advisory and its job is exactly to surface "look at these." So Step 1's expected output is "the 3 targets no longer appear (they're overridden); a small residue of labelless non-dino stubs may remain and is fine to ignore." Do NOT expect a literally-empty list; expect the 3 to be absent from it.

- [ ] **Step 1: Add the candidate report in `main()`**

In `scripts/fetch-wikidata.ts`, `main()` already has (line ~120):

```typescript
  const structure = await fetchStructure();
  const pruned = pruneSubtree(structure, NEORNITHES);
```

Immediately after those two lines, insert:

```typescript
  // Candidate report (#43, advisory): a taxon still rank-tagged species AFTER the Neornithes prune,
  // whose parent is NOT itself a species, is a likely mis-tagged genus (the modern-bird species that
  // dominate the raw set are pruned away with Neornithes). List any that aren't already overridden so
  // a future harvest's new case is noticed. Warns, never blocks — a missed promotion is a quiet
  // omission, not corruption.
  {
    const byId = new Map(pruned.map((r) => [r.id, r]));
    const candidates = pruned.filter((r) => {
      if (r.rankId !== RANK_SPECIES) return false;
      if (RANK_OVERRIDES[r.id]) return false; // already handled
      const parent = r.parentId ? byId.get(r.parentId) : undefined;
      return parent ? parent.rankId !== RANK_SPECIES : true; // parent not a species (infraspecific)
    });
    if (candidates.length) {
      console.warn(`\n⚠ ${candidates.length} species-ranked taxon(s) look like mis-tagged genera (not in RANK_OVERRIDES):`);
      for (const c of candidates) console.warn(`    ${c.id} (parent ${c.parentId ?? "none"})`);
      console.warn("  If any is a real dinosaur genus, add its Q-id to src/lib/tree/rank-overrides.ts. (#43)\n");
    } else {
      console.log("rank-override candidates: none (all mis-tagged genera are covered)");
    }
  }
```

- [ ] **Step 2: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors. `RANK_SPECIES` is already imported (from the species-cluster work); `RANK_OVERRIDES` from Task 1.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch-wikidata.ts
git commit -m "feat(harvest): advisory report for un-listed mis-tagged-genus candidates"
```

---

### Task 3: Re-harvest, rebuild, verify the 3 land playable + Tawa survives

**Files:**
- Modify (generated, committed): `src/data/tree.json`, `src/data/genera-index.json`, `src/data/genus-attributes.json`, `src/data/meta.json`

**Interfaces:**
- Consumes: Tasks 1-2 (override applied at harvest); PBDB.
- Produces: regenerated committed data with the 3 genera present + playable.

- [ ] **Step 1: Re-harvest Wikidata (targets must enter raw-taxa.json)**

Run: `npm run fetch:wikidata 2>&1 | tail -25`
Expected: completes; the candidate report prints. The 3 targets (Q122069485, Q95715804, Q72914385) must NOT appear in it (they're now overridden). A small residue of labelless non-dino stubs MAY appear — that's fine (advisory). `resolved via species: N` line still present.

- [ ] **Step 2: Re-fetch PBDB (targets must be queried for the first time)**

Run: `npm run fetch:pbdb 2>&1 | tail -8`
Expected: `with a clue: N (M%)`. The 3 targets are now in the name list, so PBDB is queried for them.

- [ ] **Step 3: Build**

Run: `npm run build:data 2>&1 | tail -30`
Expected: build report. Playable pool grows (the 3 enter; Eodromaeus displaces the lowest Theropoda-direct winner but Tawa is pinned). Name gate passes. GUARD 2 does not trip (pool grows). always-playable report still shows `✓ "Tawa"` and `✓ "Suskityrannus"` pinned. If the name gate reports a NEW undecided disagreement for one of the 3 (e.g. a binomial P225), STOP and report BLOCKED — that would need a NAME_DECISIONS entry, a scope question for the human.

- [ ] **Step 4: Verify the 3 are present, playable, clued — and Tawa survived**

Run:
```bash
node -e 'const idx=JSON.parse(require("fs").readFileSync("src/data/genera-index.json","utf8"));const a=JSON.parse(require("fs").readFileSync("src/data/genus-attributes.json","utf8"));const t=JSON.parse(require("fs").readFileSync("src/data/tree.json","utf8"));const byName=new Map(Object.values(t.nodes).map(n=>[n.name,n]));for(const nm of ["Eodromaeus","Overoraptor","Nemegtonykus","Tawa"]){const n=byName.get(nm);if(!n){console.log(nm,"MISSING");continue;}console.log(nm.padEnd(14),"playable:",n.playable,"inIndex:",idx.some(x=>x.name===nm),"hasClue:",n.id in a,"parent:",t.nodes[n.parentId]?.name);}'
```
Expected: Eodromaeus/Overoraptor/Nemegtonykus all `playable:true, inIndex:true, hasClue:true` with parents Theropoda/Saurischia/Parvicursorinae; **Tawa `playable:true, inIndex:true`** (pin held against the Eodromaeus bump).

- [ ] **Step 5: Full validation**

Run: `npx tsc --noEmit && npx vitest run && npx svelte-check 2>&1 | tail -5`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json src/data/meta.json
git commit -m "data: recover Eodromaeus, Overoraptor, Nemegtonykus via rank override (Closes #43)

3 genera Wikidata mis-tagged P105=species are promoted to genus and now enter
the tree with their PBDB clues (Eodromaeus: Carnian/Argentina; Overoraptor:
Cenomanian-Turonian/Argentina; Nemegtonykus: Maastrichtian/Mongolia). Eodromaeus
lands in Theropoda-direct and displaces the lowest cap winner; Tawa's #46 pin
holds its slot."
```

---

## Self-review notes

- **Spec coverage:** RANK_OVERRIDES map + fetchStructure application (Task 1), candidate report (Task 2), re-harvest/rebuild/verify incl. all-3-playable + Tawa-survives (Task 3). All covered.
- **The Tawa/Eodromaeus interaction** (the whole reason #46 came first) is explicitly verified in Task 3 Step 4 — not assumed.
- **Candidate-report false-positive avoidance** is handled structurally (run on post-Neornithes `pruned`), matching the spec's "single-word label / real-clade parent" intent without a label lookup. NOTE: this is a slightly different detector than the spec's prose (post-prune structural filter vs. explicit single-word-label check) — it achieves the same result (excludes bird junk) more simply; flagged for the reviewer.
- **Type consistency:** `RANK_OVERRIDES: Record<string,string>` used identically in Task 1 (apply) and Task 2 (skip-if-present). `RANK_SPECIES`/`RANK_GENUS` are existing exports.
- **Possible BLOCKED path** (Task 3 Step 3): if a promoted genus's enwiki/P225 introduces a name disagreement, the fail-closed name gate stops the build — surfaced as a stop-and-report, since resolving it is a human scope call (add a NAME_DECISIONS entry), not a mechanical retry.
