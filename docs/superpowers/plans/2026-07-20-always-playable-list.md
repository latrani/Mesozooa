# Always-Playable List (#46) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A curated by-name list of genera guaranteed into the playable pool past the notability cap (cap-only override; still requires a clue + non-degenerate clade), so Tawa stays playable when #43 promotes Eodromaeus into its clade.

**Architecture:** Add an optional `pinned: Set<string>` parameter to the pure `prunePlayable`; pinned genera sort to the top of their terminal clade so the existing cap trim keeps them and evicts the lowest non-pinned winner. A committed `ALWAYS_PLAYABLE` name list is resolved to ids in `build-tree.ts`, which sets `pinned` and prints a per-name build report (pinned / redundant / skipped-with-warning). Selection code is untouched — pins flow through `node.playable`.

**Tech Stack:** TypeScript, Vitest (pure-logic TDD), tsx-run build script. `verbatimModuleSyntax` ON — type-only imports MUST use `import type`.

## Global Constraints

- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Run `npx tsc --noEmit` before committing; Vitest does NOT catch violations.
- **Cap-only override.** A pin overrides ONLY the notability-cap exclusion. It must NOT bypass the no-clue gate or the degenerate-clade (`branchDepth <= 1`) gate — a pinned genus failing either is warned and skipped, never force-pinned.
- **Pins consume slots, don't expand the pool.** A pinned genus sorts to the top of its terminal clade; the existing trim-to-cap keeps it and evicts the lowest-ranked non-pinned winner. Clade stays at cap size.
- **Graceful failure at build time.** An unresolved / unclued / degenerate pin is a loud build-report warning, NOT a build failure (it's a curation typo, not data corruption).
- **Selection code unchanged.** `playableGenera()` and `dailyAnswer()` read `node.playable`; do not modify them.
- **Merge workflow:** feature branch → main, no PRs, Indi pushes. Commit with `Closes #46`.
- **Determinism:** the existing tie-break (descending sitelinks, ascending id) is preserved; the pin ordering is layered ABOVE it.

---

### Task 1: `prunePlayable` accepts a `pinned` set (pure, TDD)

**Files:**
- Modify: `src/lib/tree/playable.ts` (`prunePlayable`, lines 69-97)
- Test: `src/lib/tree/playable.test.ts` (extend the existing `describe("prunePlayable")` block)

**Interfaces:**
- Consumes: existing `TreeData`, `GenusAttributes`, `capFn`.
- Produces: `prunePlayable(tree, attrs, capFn, pinned?: Set<string>): void` — `pinned` defaults to an empty set (existing call sites keep working unchanged). Pinned genera that pass the clue + degenerate gates sort ahead of all non-pinned in their clade, so the cap trim keeps them.

- [ ] **Step 1: Write the failing tests**

Add these inside the existing `describe("prunePlayable", ...)` block in `src/lib/tree/playable.test.ts` (it already defines `freshTree()` with TR sl=5 / TB sl=3 / TC sl=9 / LO sl=4 in clade `TF` for TR+TB, and the `clue` map). Append after the "breaks sitelink ties" test:

```typescript
  it("pins a cap-bumped genus, evicting the lowest non-pinned winner", () => {
    const t = freshTree();
    // TR(5) & TB(3) share terminal clade TF; cap 1 normally keeps TR. Pin TB -> TB survives, TR evicted.
    prunePlayable(t, clue, () => 1, new Set(["TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB"]);
  });
  it("pin is a no-op when the genus already wins its cap slot", () => {
    const t = freshTree();
    // Pin TR, which already wins cap 1 in TF. Result unchanged: just TR.
    prunePlayable(t, clue, () => 1, new Set(["TR"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR"]);
  });
  it("does NOT pin a genus with no clue (cap-only override)", () => {
    const t = freshTree();
    // Clue map omits TB -> TB has no clue. Pinning it must NOT rescue it; TR wins cap 1 alone.
    const noTB: GenusAttributes = { TR: clue.TR, TC: clue.TC, LO: clue.LO };
    prunePlayable(t, noTB, () => 1, new Set(["TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR"]);
  });
  it("pinning both members of a clade keeps both even past cap", () => {
    const t = freshTree();
    // Pin TR and TB, cap 1. Both pinned -> both sort to top -> both survive the cap-1 trim.
    prunePlayable(t, clue, () => 1, new Set(["TR", "TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: the 4 new tests FAIL (arity error / pinned arg ignored — e.g. "pins a cap-bumped genus" gets `["TR"]` not `["TB"]`).

- [ ] **Step 3: Implement the `pinned` parameter**

In `src/lib/tree/playable.ts`, change the `prunePlayable` signature and the per-clade sort. Full replacement of the function:

```typescript
export function prunePlayable(
  tree: TreeData,
  attrs: GenusAttributes,
  capFn: (members: TreeNode[]) => number,
  pinned: Set<string> = new Set(),
): void {
  const byClade = new Map<string, TreeNode[]>();
  for (const n of Object.values(tree.nodes)) {
    if (!n.playable) continue;
    if (!hasClue(attrs[n.id])) {
      n.playable = false;
      continue;
    }
    const a = terminalClade(tree, n.id);
    // Degenerate targets: a terminal clade with <=1 narrowing step of runway makes two-phase
    // warmth unitary/binary (spec 3.3). Exclude them; keeps the phase-1 denominator >= 2.
    // NOTE: pins do NOT bypass this gate (nor the clue gate above) — cap-only override.
    if (tree.nodes[a].branchDepth <= 1) {
      n.playable = false;
      continue;
    }
    const list = byClade.get(a);
    if (list) list.push(n);
    else byClade.set(a, [n]);
  }
  for (const members of byClade.values()) {
    // Pinned genera sort to the TOP of the clade (guaranteed past the cap); ties then fall back to
    // the notability rule (descending sitelinks, ascending id). The trim below keeps the leading
    // `cap` entries, so pins survive and the lowest-ranked NON-pinned winner is evicted.
    members.sort((x, y) => {
      const px = pinned.has(x.id) ? 1 : 0;
      const py = pinned.has(y.id) ? 1 : 0;
      if (px !== py) return py - px;
      return y.sitelinks - x.sitelinks || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    });
    const cap = capFn(members);
    for (let i = cap; i < members.length; i++) members[i].playable = false;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: PASS (all prior tests + the 4 new ones). The existing tests still pass because `pinned` defaults to empty.

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tree/playable.ts src/lib/tree/playable.test.ts
git commit -m "feat(playable): prunePlayable accepts a pinned set (cap-only override)"
```

---

### Task 2: `ALWAYS_PLAYABLE` list + build resolution + report

**Files:**
- Create: `src/lib/tree/always-playable.ts`
- Modify: `scripts/build-tree.ts` (the `prunePlayable` call ~line 165, plus a resolution+report block before it)

**Interfaces:**
- Consumes: `prunePlayable(..., pinned)` from Task 1; the assembled `tree` and `attrs` already in `build-tree.ts`.
- Produces: `ALWAYS_PLAYABLE: string[]` (genus names). Build resolves names → ids, passes the id set to `prunePlayable`, and prints outcomes.

- [ ] **Step 1: Create the list module**

Create `src/lib/tree/always-playable.ts`:

```typescript
// Genera guaranteed into the playable pool past the notability cap. By NAME (resolved to Q-ids at
// build time). A name that doesn't resolve to a clued, non-degenerate genus is WARNED and skipped —
// never force a broken game. Cap-only override; see
// docs/superpowers/specs/2026-07-20-always-playable-list-design.md.
export const ALWAYS_PLAYABLE: string[] = [
  "Tawa", // Ghost Ranch coelophysoid; camp week. Bumped from Theropoda-direct cap by Eodromaeus (#43).
];
```

- [ ] **Step 2: Resolve names + compute the pinned id set in build-tree**

In `scripts/build-tree.ts`, add the import near the other tree imports (top of file):

```typescript
import { ALWAYS_PLAYABLE } from "../src/lib/tree/always-playable";
```

Then, immediately BEFORE the `prunePlayable(tree, attrs, ...)` call (currently ~line 165), insert the resolution block. Note `markPlayable(tree)` runs just above; the clue/degenerate facts are derivable from `tree` + `attrs`:

```typescript
  // Resolve the always-playable names (#46) to ids, cap-only: a pin is honored ONLY if the genus
  // exists, has a clue, and sits in a non-degenerate terminal clade. Report every outcome; a bad
  // pin warns but never fails the build (it's a curation typo, not data corruption).
  const byName = new Map(Object.values(tree.nodes).filter((n) => n.isGenus).map((n) => [n.name, n]));
  const pinned = new Set<string>();
  const pinReport: string[] = [];
  for (const name of ALWAYS_PLAYABLE) {
    const node = byName.get(name);
    if (!node) { pinReport.push(`  ⚠ "${name}": unknown / not a genus — skipped`); continue; }
    if (!hasClue(attrs[node.id])) { pinReport.push(`  ⚠ "${name}" (${node.id}): no paleo-data — skipped`); continue; }
    if (tree.nodes[terminalClade(tree, node.id)].branchDepth <= 1) {
      pinReport.push(`  ⚠ "${name}" (${node.id}): degenerate terminal clade — skipped`); continue;
    }
    pinned.add(node.id);
    pinReport.push(`  ✓ "${name}" (${node.id}): pinned`);
  }
```

`hasClue` and `terminalClade` are NOT currently imported in `build-tree.ts` (only the TYPES
`GenusAttribute`/`GenusAttributes` are, via `import type`). Add these as separate VALUE imports — do
NOT merge `hasClue` into the existing `import type { … }` line (that would break `verbatimModuleSyntax`,
since `hasClue` is a runtime value, not a type):

```typescript
import { hasClue } from "../src/lib/attributes";
import { terminalClade } from "../src/lib/tree/terminal";
```

- [ ] **Step 3: Pass `pinned` into prunePlayable**

Change the existing call:

```typescript
  prunePlayable(tree, attrs, (members) =>
    adaptiveCap(members.map((n) => attrs[n.id]).filter((a): a is GenusAttribute => !!a), DEFAULT_CAP_DIALS),
    pinned,
  );
```

- [ ] **Step 4: Print the pin report**

In the data-quality report block near the end of `main()` (where it logs `playable (pruned):` etc.), add:

```typescript
  console.log(`always-playable pins (${pinned.size}/${ALWAYS_PLAYABLE.length} applied):`);
  for (const line of pinReport) console.log(line);
```

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/tree/always-playable.ts scripts/build-tree.ts
git commit -m "feat(build): resolve ALWAYS_PLAYABLE names into prunePlayable pins with a report"
```

---

### Task 3: Rebuild data and verify Tawa is pinned

**Files:**
- Modify (generated, committed): `src/data/tree.json`, `src/data/genera-index.json`, `src/data/genus-attributes.json`, `src/data/meta.json`

**Interfaces:**
- Consumes: the resolved `ALWAYS_PLAYABLE = ["Tawa"]` + current raws.
- Produces: regenerated committed data with Tawa pinned. No code change.

- [ ] **Step 1: Confirm raws are current**

The raws (`data/raw-taxa.json`, `data/raw-pbdb.json`) were regenerated 2026-07-20. Confirm they still exist and are same-day:

Run: `ls -la data/raw-taxa.json data/raw-pbdb.json`
Expected: both present, mtime 2026-07-20. (If missing/older, per CLAUDE.md re-run `npm run fetch` first — but they should be current from this session.)

- [ ] **Step 2: Build**

Run: `npm run build:data 2>&1 | tail -30`
Expected: the build report includes `always-playable pins (1/1 applied):` with `✓ "Tawa" (Q22113739): pinned`. Playable count is ~799 (Tawa was ALREADY playable pre-#43, so pinning it now is effectively a no-op today — it wins its slot regardless because Eodromaeus isn't promoted yet). GUARD 2 must not trip.

Note: today Tawa is still a natural cap winner (Eodromaeus isn't in the tree until #43). The pin's job is to GUARANTEE Tawa's slot so that when #43 lands, Tawa is protected. So expect the report to show Tawa pinned, and the playable set essentially unchanged from the current committed 799.

- [ ] **Step 3: Verify Tawa is playable and the pin applied**

Run:
```bash
node -e 'const idx=JSON.parse(require("fs").readFileSync("src/data/genera-index.json","utf8"));const t=JSON.parse(require("fs").readFileSync("src/data/tree.json","utf8"));const tawa=Object.values(t.nodes).find(n=>n.name==="Tawa");console.log("Tawa playable:",tawa.playable,"in index:",idx.some(x=>x.name==="Tawa"),"| pool:",idx.length);'
```
Expected: `Tawa playable: true in index: true | pool: 799` (or current count).

- [ ] **Step 4: Full validation**

Run: `npx tsc --noEmit && npx vitest run && npx svelte-check`
Expected: tsc clean, all tests pass, svelte-check clean.

- [ ] **Step 5: Commit**

```bash
git add src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json src/data/meta.json
git commit -m "data: pin Tawa via ALWAYS_PLAYABLE (Closes #46)"
```

---

## Self-review notes

- **Spec coverage:** cap-only override (Task 1 clue/degenerate gates preserved + tested), by-name list (Task 2), pins-sort-to-top / evict-lowest (Task 1 impl + test), build-time resolution + 3-outcome report (Task 2), selection code untouched (no task modifies it), success criteria (Task 3 verify). All covered.
- **The Eodromaeus-bump scenario is NOT directly testable here** — Eodromaeus enters only with #43. Task 1's "pins a cap-bumped genus, evicting the lowest non-pinned winner" test proves the MECHANISM on the fixture (pin TB → TR evicted), which is exactly the Tawa/Siats dynamic. When #43 lands, Tawa's pin will hold against Eodromaeus by the same mechanism.
- **Type consistency:** `prunePlayable(tree, attrs, capFn, pinned?)` signature matches between Task 1 definition and Task 2 call. `ALWAYS_PLAYABLE: string[]` consistent.
