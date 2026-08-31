# Difficulty Modes — Slice 2: Tier Data + Pools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the three tier pools — Easy (the curated 100), Medium (status quo), Hard (every genus with good data) — with `Easy ⊆ Medium ⊆ Hard` true by construction, and guard the Easy set's playability with a test over the real committed data.

**Architecture:** One pure `resolveTiers(tree, attrs, easyNames)` assigns each genus a monotone rank (0 easy / 1 medium / 2 hard), so pool membership is a comparison and nesting cannot break. `EASY_SET` is a name list resolved against the tree, pin-style: a name that resolves bypasses every gate. `treeData.ts` builds one lensed store per tier.

**Tech Stack:** TypeScript, Vitest. No new dependencies. Builds directly on slice 1's lens.

## Deviation from the spec: tiers are derived, not baked

The spec says "bake a tier ordinal per genus in `tree.json`". This slice derives it at runtime instead. Reasons:

- **Everything the pools need is already committed.** Medium is the `playable` flag; Hard is article + image + clue + non-degenerate, all readable from `tree.json` + `genus-attributes.json`; Easy is a name list. Nothing requires a rebuild.
- **Baking would strand the feature.** `build:data` regenerates every committed artifact from gitignored machine-local raws, so it must never run without a fresh `fetch` (CLAUDE.md). Making slices 3–5 wait on a full pipeline run buys nothing.
- **The cost is nil.** One pass over ~1,800 genera per tier at store construction, alongside the lens passes slice 1 already added.

What is genuinely lost is the build-time report. That is recovered — and strengthened — by Task 4: the Easy set is audited by a **test over the committed data**, so a typo or a data refresh that maroons a member fails `npm test` rather than printing a warning someone has to notice. If the report is later wanted in build output too, it is a one-line call to the same function.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` and `npx svelte-check` before committing.
- **Do NOT run `npm run build:data`** — the raws are absent here, and a stale-raw build silently degrades committed data.
- **Nesting is structural, not asserted.** `Easy ⊆ Medium ⊆ Hard` must follow from the rank being monotone, never from a runtime check that could be forgotten.
- **A resolved Easy name bypasses every gate** — clue, image, degenerate-clade, notability cap. That is what makes the set authoritative; it is the same rule `ALWAYS_PLAYABLE` pins already follow.
- Pure logic is TDD-tested: write the test first, watch it fail, then implement.

---

### Task 1: `EASY_SET` — the curated 100

**Files:**
- Create: `src/lib/tree/easy-set.ts`

- [x] **Step 1: Write the list**

The 100 names from the design spec appendix, with the curation edit applied: Agilisaurus and Cryolophosaurus cut, Procompsognathus and Shuvuuia added. Document per entry group why the edit exists, and mark the two accepted marooned members so a later editor does not "fix" them.

---

### Task 2: `resolveTiers` — the monotone rank

**Files:**
- Create: `src/lib/tree/tiers.ts`
- Create: `src/lib/tree/tiers.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type Tier = "easy" | "medium" | "hard";
  export type TierRank = 0 | 1 | 2;
  export interface TierResolution {
    rankOf(id: string): TierRank | undefined;  // undefined = in no pool
    pool(tier: Tier): string[];
    unresolved: string[];  // EASY_SET names matching no genus
  }
  export function resolveTiers(tree: TreeData, attrs: GenusAttributes, easyNames: readonly string[]): TierResolution;
  ```

- [x] **Step 1: Write the failing tests**

Rank rules, each its own test: an Easy name ranks 0 even when it fails every gate (no clue, no image); a `playable` genus ranks 1; a genus that is only hard-eligible ranks 2; a genus failing all three is `undefined`. Then the invariant tests: `pool("easy") ⊆ pool("medium") ⊆ pool("hard")`, and an unresolvable Easy name lands in `unresolved` rather than throwing.

- [x] **Step 2: Implement**

`rank = 0` if the name resolves from `EASY_SET`; else `1` if `node.playable`; else `2` if hard-eligible; else absent. `pool(tier)` returns every genus whose rank `<=` that tier's index — so nesting is the ordering itself, not a check.

Hard eligibility mirrors `prunePlayable`'s gates minus the cap: genus + `wikipediaUrl` + `imageUrl` + `hasClue` + true-tree terminal clade `branchDepth > 1`.

---

### Task 3: One store per tier

**Files:**
- Modify: `src/lib/game/treeData.ts`

- [x] **Step 1: Build the three stores**

Resolve tiers once at module load, then `createTreeStore(tree, pool)` per tier. Keep the existing `treeStore` export pointing at Medium so every current consumer is untouched — slice 3 switches them onto the active tier.

---

### Task 4: Audit the Easy set against real data

The guard that replaces the build-time report, and the reason the deviation above is safe.

**Files:**
- Create: `src/lib/tree/easy-set.test.ts`

- [x] **Step 1: Assert the set resolves**

Every `EASY_SET` name resolves to a genus in the committed tree; `unresolved` is empty; the set is exactly 100 and free of duplicates.

- [x] **Step 2: Assert the curation gate**

For each Easy member, compute its induced terminal clade under the Easy lens and the number of Easy members sharing its full clue inside that clade. Fail when a member has terminal clade > 10 **AND** clue survivors > 1 — the pair, not either alone, since Dilophosaurus sits at 48 with a unique clue and plays fine. Assert the known-good shape too: exactly 2 members over the size threshold, and ≥ 95 of 100 clue-unique.

---

## Verification

- [x] `npx vitest run` — all green
- [x] `npx tsc --noEmit` and `npx svelte-check` — clean
- [x] `npm run build` — succeeds
- [x] Pool sizes match the spec: Easy 100, Medium 734, Hard 1,170
- [x] App still plays a Practice round end to end (Medium is unchanged)

## What this slice deliberately does NOT do

- No UI, no tier setting, no persistence — slice 3.
- No change to `build-tree.ts` or any committed data file.
- `treeStore` still means Medium, so nothing user-visible changes.
