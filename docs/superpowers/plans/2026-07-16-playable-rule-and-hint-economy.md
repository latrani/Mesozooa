# Playable-rule + adaptive cap + hint economy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the family-ancestor playability gate with a clue-required + diversity-scaled adaptive cap, and unify hint+clue into one depth-scaled-cost button, recording hint usage as a second prestige axis.

**Architecture:** Two phases. Phase 1 is a pure build-pipeline change (playability logic + data regen) shippable on its own — it makes Oviraptor/Argentinosaurus playable. Phase 2 reworks the game engine's hint/clue mechanic and the share format. All pure logic is TDD-tested; Svelte components are validated by build + running.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite, Vitest, tsx for build scripts. No backend; data baked to committed JSON.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Vitest does NOT catch violations; run `npx tsc --noEmit` and `npx svelte-check` before committing.
- **One tree, one source of truth** — game feedback is always a pointer to a node; never introduce a parallel representation.
- **PBDB clue data already exists on disk** (`data/raw-pbdb.json`, 1683 entries). No re-fetch. The build filters it to the playable set.
- **Adaptive-cap dials (spec §Decision 2), exact values:** `CAP_MIN=3`, `CAP_MAX=7`, `AGE_SD_FULL=45`, `LOC_WEIGHT=0.5`, `AGE_WEIGHT=0.5`, `DIVERSITY_GAMMA=1.35`.
- **Hint-cost dials (spec §Decision 3), exact values:** `HINT_COST_MAX=6`, `HINT_COST_MIN=2`.
- **Share glyphs:** grid uses `💡` (one per move a hint cost); score-line tally uses `🔦` (distinct hint presses).
- Run all tests with `npx vitest run`. Single file: `npx vitest run <path>`.

---

## Phase 1 — Data rule + adaptive cap

### Task 1: Drop the family gate in `markPlayable`

**Files:**
- Modify: `src/lib/tree/playable.ts:8-19`
- Test: `src/lib/tree/playable.test.ts:11-26`

**Interfaces:**
- Produces: `markPlayable(tree: TreeData): void` — sets `n.playable = n.isGenus && !!n.wikipediaUrl` (no family check).

- [ ] **Step 1: Rewrite the `markPlayable` describe block to the new rule**

Replace `playable.test.ts:11-26` (the whole `describe("markPlayable", ...)`) with:

```ts
describe("markPlayable", () => {
  it("marks genera with a wikipedia article playable", () => {
    expect(tree.nodes["TR"].playable).toBe(true);
    expect(tree.nodes["TB"].playable).toBe(true);
    expect(tree.nodes["TC"].playable).toBe(true);
  });
  it("marks a genus with an article even without a family ancestor", () => {
    // LO ("Loosey") sits directly under Theropoda, no family — now playable.
    expect(tree.nodes["LO"].playable).toBe(true);
  });
  it("never marks non-genus nodes", () => {
    expect(tree.nodes["TF"].playable).toBe(false);
  });
  it("playableGenera returns exactly the playable set", () => {
    expect(playableGenera(tree).map((n) => n.id).sort()).toEqual(["LO", "TB", "TC", "TR"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: FAIL — `LO` is currently `false` (excluded for no family).

- [ ] **Step 3: Rewrite `markPlayable` and delete `hasFamilyAncestor`**

In `src/lib/tree/playable.ts`, delete the `hasFamilyAncestor` function (lines 8-12) and the `RANK_FAMILY` + `pathToRoot` imports if now unused (keep `pathToRoot` only if still used elsewhere in the file — it is not after this change; `terminalClade` is imported separately). Replace `markPlayable`:

```ts
export function markPlayable(tree: TreeData): void {
  for (const n of Object.values(tree.nodes)) {
    n.playable = n.isGenus && !!n.wikipediaUrl;
  }
}
```

After editing, confirm no dangling imports: the file should still import `terminalClade` (used by `prunePlayable`) and the attribute helpers. Remove `import { RANK_FAMILY } from "./types";` and `import { pathToRoot } from "./mrca";`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: `markPlayable` block PASSES. (The `prunePlayable` block may still pass — it injects its own clue and cap; Task 2 rewrites it.)

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (Catches any orphaned `RANK_FAMILY`/`pathToRoot` import.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/tree/playable.ts src/lib/tree/playable.test.ts
git commit -m "feat(tree): drop family-ancestor gate from markPlayable"
```

---

### Task 2: Diversity-scaled adaptive cap

**Files:**
- Modify: `src/lib/tree/playable.ts` (add `adaptiveCap`, `CapDials`, `DEFAULT_CAP_DIALS`; change `prunePlayable` signature)
- Test: `src/lib/tree/playable.test.ts` (add `adaptiveCap` block; rewrite `prunePlayable` block to inject a `capFn`)

**Interfaces:**
- Produces:
  - `interface CapDials { capMin: number; capMax: number; ageSdFull: number; locWeight: number; ageWeight: number; gamma: number; }`
  - `const DEFAULT_CAP_DIALS: CapDials` (the exact values from Global Constraints)
  - `adaptiveCap(members: GenusAttribute[], dials: CapDials): number` — pure; returns the cap for a terminal clade's leaf-set from its clue-diversity.
  - `prunePlayable(tree: TreeData, attrs: GenusAttributes, capFn: (members: TreeNode[]) => number): void` — signature changes from `(…, cap: number)` to a per-clade cap function.

- [ ] **Step 1: Write failing tests for `adaptiveCap`**

Add to `playable.test.ts`. Import `adaptiveCap`, `DEFAULT_CAP_DIALS`, and `type CapDials` at the top (merge into the existing `./playable` import; use `import type` for `CapDials`... note it must be a separate `import type` line or an inline `type` specifier since `verbatimModuleSyntax` is on):

```ts
import { markPlayable, playableGenera, prunePlayable, adaptiveCap, DEFAULT_CAP_DIALS } from "./playable";
import type { CapDials } from "./playable";
import type { GenusAttribute } from "../attributes";

describe("adaptiveCap", () => {
  const D = DEFAULT_CAP_DIALS;
  const at = (loc: string, start: number, end: number): GenusAttribute => ({
    ageLabel: "x", discoveryLocation: loc, ageStartMa: start, ageEndMa: end,
  });

  it("returns CAP_MAX for a well-spread (diverse) set", () => {
    // many countries, wide age range -> score ~1 -> cap 7
    const members = [
      at("USA", 200, 190), at("China", 150, 140), at("Argentina", 100, 90),
      at("UK", 80, 70), at("Niger", 120, 110), at("Germany", 60, 50),
    ];
    expect(adaptiveCap(members, D)).toBe(7);
  });

  it("returns CAP_MIN for a boring bucket (one country, tight age)", () => {
    // 5/6 China, all ~same age -> low diversity -> cap 3
    const members = [
      at("China", 165, 160), at("China", 164, 159), at("China", 166, 161),
      at("China", 163, 158), at("China", 167, 162), at("Niger", 165, 160),
    ];
    expect(adaptiveCap(members, D)).toBe(3);
  });

  it("clamps within [CAP_MIN, CAP_MAX]", () => {
    const c = adaptiveCap([at("USA", 100, 90), at("China", 80, 70)], D);
    expect(c).toBeGreaterThanOrEqual(D.capMin);
    expect(c).toBeLessThanOrEqual(D.capMax);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: FAIL — `adaptiveCap` not exported.

- [ ] **Step 3: Implement `adaptiveCap` + dials**

Add to `src/lib/tree/playable.ts` (after the imports, before `markPlayable`):

```ts
import type { GenusAttribute } from "../attributes";

export interface CapDials {
  capMin: number;
  capMax: number;
  ageSdFull: number; // Ma stddev of age-midpoints treated as "fully time-diverse"
  locWeight: number;
  ageWeight: number;
  gamma: number; // >1 bends low-diversity sets toward capMin
}

export const DEFAULT_CAP_DIALS: CapDials = {
  capMin: 3,
  capMax: 7,
  ageSdFull: 45,
  locWeight: 0.5,
  ageWeight: 0.5,
  gamma: 1.35,
};

// Cap for a terminal clade's leaf-set, scaled to its clue-diversity: wastebaskets
// (many countries / wide age span) keep a wide cap; boring buckets (one country /
// tight age) shrink toward capMin. Members are the leaf-set's clue attributes.
export function adaptiveCap(members: GenusAttribute[], dials: CapDials): number {
  const n = members.length;
  if (n === 0) return dials.capMax;

  // location dominance: largest single-country share
  const byCountry = new Map<string, number>();
  for (const m of members) {
    const c = m.discoveryLocation ?? "";
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  const dom = Math.max(...byCountry.values()) / n;
  const locDiv = 1 - dom;

  // age spread: stddev of midpoints
  const mids = members
    .map((m) => (m.ageStartMa != null && m.ageEndMa != null ? (m.ageStartMa + m.ageEndMa) / 2 : NaN))
    .filter((x) => !Number.isNaN(x));
  let ageDiv = 0;
  if (mids.length > 0) {
    const mean = mids.reduce((a, b) => a + b, 0) / mids.length;
    const sd = Math.sqrt(mids.reduce((a, b) => a + (b - mean) ** 2, 0) / mids.length);
    ageDiv = Math.min(1, sd / dials.ageSdFull);
  }

  const score = Math.pow(dials.locWeight * locDiv + dials.ageWeight * ageDiv, dials.gamma);
  const raw = Math.round(dials.capMin + (dials.capMax - dials.capMin) * score);
  return Math.max(dials.capMin, Math.min(dials.capMax, raw));
}
```

- [ ] **Step 4: Run to verify `adaptiveCap` tests pass**

Run: `npx vitest run src/lib/tree/playable.test.ts -t adaptiveCap`
Expected: the 3 `adaptiveCap` tests PASS.

- [ ] **Step 5: Change `prunePlayable` to take a `capFn`, rewrite its tests**

Replace the `prunePlayable` body in `playable.ts`. It currently takes `cap: number`; change to a per-clade function:

```ts
// Narrow the base-playable set: require a clue, then keep only the most-notable
// (by sitelinks, ties by ascending id) genera within each terminal clade, up to a
// per-clade cap computed by capFn from that clade's members.
export function prunePlayable(
  tree: TreeData,
  attrs: GenusAttributes,
  capFn: (members: TreeNode[]) => number,
): void {
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
    const cap = capFn(members);
    for (let i = cap; i < members.length; i++) members[i].playable = false;
  }
}
```

Now rewrite the `prunePlayable` describe block in the test to inject a constant `capFn` (this tests the *pruning mechanic*; `adaptiveCap` is tested separately). Replace the block's calls: `prunePlayable(t, clue, 1)` → `prunePlayable(t, clue, () => 1)`, and `prunePlayable(t, clue, 7)` → `prunePlayable(t, clue, () => 7)`. The full rewritten block:

```ts
describe("prunePlayable", () => {
  function freshTree() {
    const t = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
    markPlayable(t); // base playable now: TR, TB, TC, LO (all have wiki)
    t.nodes["TR"].sitelinks = 5;
    t.nodes["TB"].sitelinks = 3;
    t.nodes["TC"].sitelinks = 9;
    t.nodes["LO"].sitelinks = 4;
    return t;
  }
  const clue: GenusAttributes = {
    TR: { ageLabel: "Maastrichtian" },
    TB: { discoveryLocation: "Mongolia" },
    TC: { ageLabel: "Maastrichtian", discoveryLocation: "USA" },
    LO: { ageLabel: "Norian" },
  };

  it("keeps the top-cap most-notable per terminal set", () => {
    const t = freshTree();
    // TR & TB share terminal clade TF; cap 1 -> keep TR (5>3). TC & LO are alone in theirs.
    prunePlayable(t, clue, () => 1);
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["LO", "TC", "TR"]);
  });
  it("keeps everyone when cap >= set size", () => {
    const t = freshTree();
    prunePlayable(t, clue, () => 7);
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["LO", "TB", "TC", "TR"]);
  });
  it("drops genera with no clue regardless of notability", () => {
    const t = freshTree();
    prunePlayable(t, { TR: { ageLabel: "x" }, TB: { ageLabel: "x" }, LO: { ageLabel: "x" } }, () => 7); // TC no clue
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["LO", "TB", "TR"]);
  });
  it("breaks sitelink ties by ascending id", () => {
    const t = freshTree();
    t.nodes["TR"].sitelinks = 3; // tie with TB in clade TF
    prunePlayable(t, clue, () => 1);
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["LO", "TB", "TC"]);
  });
});
```

> Note on `terminalClade`/fixture: in `FIXTURE_RAWS`, TR & TB are under family TF (shared terminal clade); TC is under CF→O; LO is directly under Theropoda (T). Confirm the expected keep-sets against `terminalClade` output when running — if LO's terminal clade coincides with another genus's, adjust the expected arrays to match actual grouping (the mechanic, not the numbers, is what's under test).

- [ ] **Step 6: Run to verify fails, then the whole file passes after edits**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: PASS (all blocks). If a `prunePlayable` expectation mismatches, it's a fixture-grouping detail — read the failure, correct the expected array to the actual terminal-clade grouping, re-run.

- [ ] **Step 7: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/tree/playable.ts src/lib/tree/playable.test.ts
git commit -m "feat(tree): diversity-scaled adaptive cap for prunePlayable"
```

---

### Task 3: Wire dials into the build, regenerate data, fix docs

**Files:**
- Modify: `scripts/build-tree.ts:9,17,25,49`
- Regenerate (committed data): `src/data/tree.json`, `src/data/genera-index.json`, `src/data/genus-attributes.json`
- Modify: `CLAUDE.md` (stale numbers + rule description)

**Interfaces:**
- Consumes: `adaptiveCap`, `DEFAULT_CAP_DIALS` from Task 2; `prunePlayable(tree, attrs, capFn)`.

- [ ] **Step 1: Update the build script**

In `scripts/build-tree.ts`:
- Replace the imports line 4 to add the dials:
  ```ts
  import { markPlayable, prunePlayable, playableGenera, adaptiveCap, DEFAULT_CAP_DIALS } from "../src/lib/tree/playable";
  import type { TreeNode } from "../src/lib/tree/types";
  ```
- Delete line 9 (`const PLAYABLE_CAP = 7;`).
- Change the `markPlayable` comment (line 17) to `// base eligibility: genus + enwiki`.
- Replace line 25 (`prunePlayable(tree, attrs, PLAYABLE_CAP);`) with:
  ```ts
  const capFn = (members: TreeNode[]) => adaptiveCap(members.map((n) => attrs[n.id]), DEFAULT_CAP_DIALS);
  prunePlayable(tree, attrs, capFn); // require clue; diversity-scaled cap per terminal set
  ```
- Replace the log line 49 (`console.log("playable (pruned):  ", playable.length, ...)`) with:
  ```ts
  console.log("playable (pruned):  ", playable.length, `(adaptive cap ${DEFAULT_CAP_DIALS.capMin}-${DEFAULT_CAP_DIALS.capMax})`);
  ```

- [ ] **Step 2: Typecheck the script**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Regenerate the committed data**

Run: `npm run build:data`
Expected output includes `playable (pruned): ~783 (adaptive cap 3-7)` and `root count: 1835`. The exact playable number may drift slightly; anything ~750–820 is expected. Note the printed number for the doc update.

- [ ] **Step 4: Sanity-check the regenerated pool**

Run:
```bash
node -e 'const t=require("./src/data/tree.json");const n=t.nodes;const f=id=>Object.values(n).find(x=>x.name===id);for(const nm of ["Oviraptor","Argentinosaurus","Eoraptor","Dilophosaurus"]){const x=f(nm);console.log(nm, x?("playable="+x.playable):"MISSING");}'
```
Expected: all four `playable=true`.

- [ ] **Step 5: Update CLAUDE.md**

In `CLAUDE.md`, fix these stale facts (search for each):
- "Reference pool ≈ 2,072 Mesozoic genera" → "Reference pool ≈ 1,835 Mesozoic genera" (post-dedupe count).
- "Playable pool = 674" / "674-genus" / "675" references → the actual regenerated count from Step 3 (e.g. "≈ 783").
- The playable-rule description that mentions "terminal sets ≤ CAP=7" and "family" → describe the new rule: "base eligibility = genus + enwiki; pruned to require a paleo clue (age AND location) and a diversity-scaled adaptive cap (3–7 per terminal set, tight on low-diversity 'boring bucket' clades, wide on well-spread ones)."
- CAP being "a build-time dial" → note the dials live in `DEFAULT_CAP_DIALS` (`src/lib/tree/playable.ts`).

- [ ] **Step 6: Commit (data + script + docs together)**

```bash
git add scripts/build-tree.ts src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json CLAUDE.md
git commit -m "build(tree): adaptive-cap dials + regenerate data (~783 playable, family gate removed)"
```

**Phase 1 is shippable here.** Oviraptor & friends are now playable; the hint mechanic is unchanged.

---

## Phase 2 — Hint/clue economy + share

### Task 4: Extend `GuessResult` with `cost` and a `"clue"` kind

**Files:**
- Modify: `src/lib/game/types.ts:6,8-13`
- Test: covered by later tasks (types have no behavior); this task ends at typecheck.

**Interfaces:**
- Produces:
  - `type GuessKind = "guess" | "hint" | "clue"`
  - `GuessResult` gains `cost: number` (guess = 1; hint = depth-scaled; clue = HINT_COST_MIN).

- [ ] **Step 1: Edit the types**

In `src/lib/game/types.ts`:
```ts
export type GuessKind = "guess" | "hint" | "clue";

export interface GuessResult {
  guessId: string;
  sharedNodeId: string;
  warmth: Warmth;
  kind: GuessKind;
  cost: number; // guess-slots this row consumed (guess=1, hint=depth-scaled, clue=HINT_COST_MIN)
}
```

- [ ] **Step 2: Typecheck to see the fallout**

Run: `npx tsc --noEmit`
Expected: errors at every site constructing a `GuessResult` without `cost` (engine-core `applyGuess`/`applyHint`, and the test helper in `share.test.ts`). These are fixed in Tasks 5 & 7. Note them; do not fix yet.

- [ ] **Step 3: Commit the type change**

```bash
git add src/lib/game/types.ts
git commit -m "feat(game): add cost field and clue kind to GuessResult"
```

---

### Task 5: Hint cost function + unified action + budget on sum-of-cost

**Files:**
- Modify: `src/lib/game/engine-core.ts` (remove `MAX_HINTS`; add `HINT_COST_MAX`/`HINT_COST_MIN`, `hintCost`, `movesUsed`; rewrite `applyGuess` cost, `applyHint`→ unified `applyHintOrClue`; guard `won`; skip `"clue"` rows in `revealedNodeIds` and `warmestSharedNodeId`)
- Test: `src/lib/game/engine-core.test.ts` (add tests; adjust existing if any assert `MAX_HINTS`)

**Interfaces:**
- Consumes: `GuessResult.cost`, `GuessKind` `"clue"` (Task 4); `terminalClueActive`, `nextHintNode`, `terminalClade` (existing).
- Produces:
  - `const HINT_COST_MAX = 6`, `const HINT_COST_MIN = 2`
  - `hintCost(state: GameState, store: TreeStore): number` — cost of the *next* hint/clue press. At leaf-terminal → `HINT_COST_MIN`; else depth-scaled from the revealed node's lineage fraction.
  - `movesUsed(state: GameState): number` — sum of `g.cost`.
  - `applyHintOrClue(state, store, warmth): GameState` — replaces `applyHint`. Walks a branch (kind `"hint"`) or reveals the clue (kind `"clue"`), charging `hintCost`.
  - `applyGuess` now sets `cost: 1` on its row and checks `movesUsed >= maxGuesses`.
  - `revealedNodeIds` and `warmestSharedNodeId` ignore `kind === "clue"` rows.

- [ ] **Step 1: Write failing tests for `hintCost`**

Add to `engine-core.test.ts` (create imports as needed). The fixture tree is the shared one used across the game tests — reuse the existing top-of-file setup; if the file lacks a target with a deep lineage, use the fixture's `TR` (Tyrannosaurus, lineage Q430→T→TF→TR).

```ts
import { hintCost, HINT_COST_MAX, HINT_COST_MIN, movesUsed, applyGuess, applyHintOrClue } from "./engine-core";

describe("hintCost", () => {
  it("charges HINT_COST_MAX for a shallow (near-root) next hint", () => {
    // target TR: lineage [Q430,T,TF,TR]; with only a distant guess, next hint node is T (index 1, frac low)
    const s0 = newDailyState("TR", 20);
    const s1 = applyGuess(s0, "TC", store, warmth); // TC shares only Q430 with TR
    expect(hintCost(s1, store)).toBe(HINT_COST_MAX);
  });
  it("charges HINT_COST_MIN at the leaf-terminal state", () => {
    // Once warmth has bottomed at TR's terminal clade, the press yields the clue at MIN cost.
    const s0 = newDailyState("TR", 20);
    const s1 = applyGuess(s0, "TB", store, warmth); // TB shares TF with TR -> warmest at terminal clade
    expect(terminalClueActive(s1, store)).toBe(true);
    expect(hintCost(s1, store)).toBe(HINT_COST_MIN);
  });
});
```

> When implementing, verify the fixture warmth actually makes `terminalClueActive` true after guessing `TB`. If the fixture's counts differ, pick the guess that lands warmth at TR's terminal clade (read `terminalClade(tree,"TR")` and guess a sibling under it). Adjust the guess id in the test to match; the *assertion* (MIN at leaf-terminal, MAX when shallow) is the contract.

- [ ] **Step 2: Run to verify fails**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: FAIL — `hintCost` not exported.

- [ ] **Step 3: Implement cost constants, `hintCost`, `movesUsed`**

In `engine-core.ts`: delete `export const MAX_HINTS = 3;` (line 6). Add:

```ts
export const HINT_COST_MAX = 6; // a shallow (near-root) hint costs this many guess-slots
export const HINT_COST_MIN = 2; // a leaf-adjacent hint, and the clue, cost this — nothing is free

// Total guess-slots consumed so far (guesses=1 each, hints/clue carry their own cost).
export function movesUsed(state: GameState): number {
  return state.guesses.reduce((sum, g) => sum + (g.cost ?? 1), 0);
}

// Cost of the NEXT hint/clue press. At the leaf-terminal state the press yields the clue at
// HINT_COST_MIN. Otherwise it walks one branch down; cost scales by how far along the target's
// root->leaf lineage the revealed node sits (shallow=MAX, leaf-adjacent=MIN).
export function hintCost(state: GameState, store: TreeStore): number {
  if (terminalClueActive(state, store)) return HINT_COST_MIN;
  const nodeId = nextHintNode(state, store);
  if (nodeId === null) return HINT_COST_MIN;
  const lineage = store.pathToRoot(state.target).slice().reverse(); // root..target
  const idx = lineage.indexOf(nodeId);
  const denom = lineage.length - 1;
  const frac = denom > 0 ? idx / denom : 1;
  const raw = Math.ceil(HINT_COST_MAX - (HINT_COST_MAX - HINT_COST_MIN) * frac);
  return Math.max(HINT_COST_MIN, Math.min(HINT_COST_MAX, raw));
}
```

- [ ] **Step 4: Set `cost` on `applyGuess`, switch its budget check to `movesUsed`**

In `applyGuess` (engine-core.ts:39-49), add `cost: 1` to the `result` object and change the lost-check:

```ts
  const result: GuessResult = {
    guessId,
    sharedNodeId,
    warmth: warmth.warmth(sharedNode),
    kind: "guess",
    cost: 1,
  };
  const guesses = [...state.guesses, result];
  let status: GameStatus = state.status;
  if (guessId === state.target) status = "won";
  else if (state.maxGuesses !== null && movesUsedOf(guesses) >= state.maxGuesses) status = "lost";
  return { ...state, guesses, status };
```

Add a tiny local helper near `movesUsed` so both callers share it (or inline the reduce). Define:
```ts
function movesUsedOf(guesses: GuessResult[]): number {
  return guesses.reduce((sum, g) => sum + (g.cost ?? 1), 0);
}
```
and have `movesUsed(state)` delegate: `return movesUsedOf(state.guesses);`

- [ ] **Step 5: Replace `applyHint` with `applyHintOrClue`**

Replace the whole `applyHint` function (engine-core.ts:140-163):

```ts
export function applyHintOrClue(
  state: GameState,
  store: TreeStore,
  warmth: WarmthProvider,
): GameState {
  if (state.status !== "playing") return state;
  if (!state.guesses.some((g) => g.kind === "guess")) return state; // need a real guess first

  const cost = hintCost(state, store);

  // Leaf-terminal: reveal the clue (no tree node) rather than spoil the answer.
  if (terminalClueActive(state, store)) {
    if (state.guesses.some((g) => g.kind === "clue")) return state; // clue already taken
    const result: GuessResult = {
      guessId: state.target,        // referenced for clueFor(); NOT revealed on the tree
      sharedNodeId: state.target,
      warmth: warmth.warmth(store.getNode(state.target)!),
      kind: "clue",
      cost,
    };
    const guesses = [...state.guesses, result];
    const status: GameStatus =
      state.maxGuesses !== null && movesUsedOf(guesses) >= state.maxGuesses ? "lost" : state.status;
    return { ...state, guesses, hintsUsed: state.hintsUsed + 1, status };
  }

  // Otherwise walk one branch down the target lineage.
  const nodeId = nextHintNode(state, store);
  if (nodeId === null) return state;
  const node = store.getNode(nodeId)!;
  const result: GuessResult = {
    guessId: nodeId,
    sharedNodeId: nodeId,
    warmth: warmth.warmth(node),
    kind: "hint",
    cost,
  };
  const guesses = [...state.guesses, result];
  const status: GameStatus =
    state.maxGuesses !== null && movesUsedOf(guesses) >= state.maxGuesses ? "lost" : state.status;
  return { ...state, guesses, hintsUsed: state.hintsUsed + 1, status };
}
```

- [ ] **Step 6: Make `revealedNodeIds` and `warmestSharedNodeId` ignore clue rows**

In `revealedNodeIds` (engine-core.ts:120-126), skip clue rows:
```ts
export function revealedNodeIds(state: GameState, store: TreeStore): Set<string> {
  const ids = new Set<string>();
  for (const g of state.guesses) {
    if (g.kind === "clue") continue; // clue reveals no tree node
    for (const id of store.pathToRoot(g.guessId)) ids.add(id);
  }
  return ids;
}
```
In `warmestSharedNodeId` (engine-core.ts:62-74), skip clue rows so the clue's `sharedNodeId=target` never counts as "warmest":
```ts
export function warmestSharedNodeId(state: GameState, store: TreeStore): string | null {
  const rows = state.guesses.filter((g) => g.kind !== "clue");
  if (rows.length === 0) return null;
  let bestId = rows[0].sharedNodeId;
  let bestCount = store.getNode(bestId)!.descendantGenusCount;
  for (const g of rows) {
    const count = store.getNode(g.sharedNodeId)!.descendantGenusCount;
    if (count < bestCount) { bestCount = count; bestId = g.sharedNodeId; }
  }
  return bestId;
}
```

- [ ] **Step 7: Add a test proving the clue press does not reveal the target**

Add to `engine-core.test.ts`:
```ts
it("clue press records a clue row without revealing the target on the tree", () => {
  const s0 = newDailyState("TR", 20);
  const s1 = applyGuess(s0, "TB", store, warmth); // lands at terminal clade
  const s2 = applyHintOrClue(s1, store, warmth);
  expect(s2.guesses.at(-1)!.kind).toBe("clue");
  expect(revealedNodeIds(s2, store).has("TR")).toBe(false); // target not spoiled
  expect(movesUsed(s2)).toBe(1 + HINT_COST_MIN); // guess(1) + clue(MIN)
});
```

- [ ] **Step 8: Run the engine tests**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: PASS. Fix any existing test that referenced `MAX_HINTS`/`applyHint` (rename to `applyHintOrClue`; drop `MAX_HINTS` assertions).

- [ ] **Step 9: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat(game): unified hint/clue with depth-scaled cost, sum-of-cost budget"
```

---

### Task 6: Persistence — backfill `cost` on legacy saves

**Files:**
- Modify: `src/lib/game/persistence.ts:19-51`
- Test: `src/lib/game/persistence.test.ts` (add a legacy-save test; create the file if absent — check first with `ls src/lib/game/persistence.test.ts`)

**Interfaces:**
- Consumes: `GuessResult.cost` (Task 4).
- Produces: `deserializeDaily` backfills `cost` on rows that lack it (old saves) so `movesUsed` stays correct.

- [ ] **Step 1: Write a failing test for legacy backfill**

Add (or create the test file with the standard imports):
```ts
import { describe, it, expect } from "vitest";
import { deserializeDaily } from "./persistence";

it("backfills cost on legacy rows lacking it", () => {
  const legacy = JSON.stringify({
    target: "T",
    guesses: [
      { guessId: "a", sharedNodeId: "s", warmth: { value: 1, display: "", fraction: 0.2 }, kind: "guess" },
      { guessId: "b", sharedNodeId: "s", warmth: { value: 1, display: "", fraction: 0.5 }, kind: "hint" },
    ],
    status: "playing",
    mode: "daily",
    maxGuesses: 20,
    hintsUsed: 1,
  });
  const state = deserializeDaily(legacy);
  expect(state).not.toBeNull();
  expect(state!.guesses[0].cost).toBe(1); // guess backfills to 1
  expect(state!.guesses[1].cost).toBeGreaterThanOrEqual(1); // hint backfills to a positive cost
});
```

- [ ] **Step 2: Run to verify fails**

Run: `npx vitest run src/lib/game/persistence.test.ts`
Expected: FAIL — `cost` is `undefined` on the parsed rows.

- [ ] **Step 3: Backfill in `deserializeDaily`**

Keep `isValidGuessRow` tolerant of a missing `cost` (do not require it — legacy saves lack it). After the validation passes, map a backfill before returning:

```ts
export function deserializeDaily(json: string): GameState | null {
  try {
    const obj = JSON.parse(json);
    if (
      obj &&
      typeof obj.target === "string" &&
      Array.isArray(obj.guesses) &&
      obj.guesses.every(isValidGuessRow) &&
      typeof obj.status === "string" &&
      obj.mode === "daily" &&
      typeof obj.hintsUsed === "number" &&
      (obj.maxGuesses === null || typeof obj.maxGuesses === "number")
    ) {
      const guesses = (obj.guesses as GuessResult[]).map((g) => ({
        ...g,
        // Legacy saves predate per-row cost. Guesses cost 1; legacy hints predate the
        // depth-scaled model — charge the minimum so restored budgets stay sane.
        cost: typeof g.cost === "number" ? g.cost : g.kind === "guess" ? 1 : 2,
      }));
      return { ...(obj as GameState), guesses };
    }
    return null;
  } catch {
    return null;
  }
}
```

Also update `isValidGuessRow` to accept the `"clue"` kind (new saves will have it): change the kind check to `(r.kind === "guess" || r.kind === "hint" || r.kind === "clue")`.

- [ ] **Step 4: Run to verify passes**

Run: `npx vitest run src/lib/game/persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/persistence.ts src/lib/game/persistence.test.ts
git commit -m "feat(game): backfill cost + accept clue kind in daily persistence"
```

---

### Task 7: Share — expand hints by cost, add 🔦 tally

**Files:**
- Modify: `src/lib/game/share.ts:12-24`
- Test: `src/lib/game/share.test.ts` (update helper + assertions)

**Interfaces:**
- Consumes: `GuessResult.cost`, `movesUsed` (delegate or reimplement locally), `kind === "clue"`.
- Produces: `buildShareText` — score line `Mesozooa <date>  <movesUsed>/<cap> · 🔦<hintPresses>` (tally omitted when zero); grid expands each hint/clue row to `cost` × `💡`.

- [ ] **Step 1: Update the test helper and add cost-expansion assertions**

In `share.test.ts`, the `g()` helper must set `cost`. Replace it and add tests:
```ts
function g(fraction: number, kind: "guess" | "hint" | "clue" = "guess", guessId = "x", cost = 1): GuessResult {
  return { guessId, sharedNodeId: "s", warmth: { value: 1, display: "", fraction }, kind, cost };
}
```
Add:
```ts
it("expands a hint into cost-many 💡 and tallies presses with 🔦", () => {
  const state: GameState = {
    target: "T",
    guesses: [g(0.1), g(0.5, "hint", "h", 4), g(1, "guess", "T")],
    status: "won", mode: "daily", maxGuesses: 25, hintsUsed: 1,
  };
  const text = buildShareText(state, "2026-07-16");
  // movesUsed = 1 + 4 + 1 = 6
  expect(text.split("\n")[0]).toBe("Mesozooa 2026-07-16  6/25 · 🔦1");
  expect([...text].filter((c) => c === "💡").length).toBe(4); // 4 lightbulbs for the cost-4 hint
});
it("omits the 🔦 tally when no hints were used", () => {
  const state: GameState = {
    target: "T", guesses: [g(0.1), g(1, "guess", "T")],
    status: "won", mode: "daily", maxGuesses: 25, hintsUsed: 0,
  };
  expect(buildShareText(state, "2026-07-16").split("\n")[0]).toBe("Mesozooa 2026-07-16  2/25");
});
```
Existing tests that assert `3/20` etc. still hold for guess-only states (each guess cost 1, movesUsed == length). Leave them; they now also implicitly confirm no `· 🔦` suffix when `hintsUsed` is 0.

- [ ] **Step 2: Run to verify fails**

Run: `npx vitest run src/lib/game/share.test.ts`
Expected: FAIL — old score line lacks the tally / grid doesn't expand by cost.

- [ ] **Step 3: Rewrite `buildShareText`**

```ts
import type { GameState } from "./types";
import { DAILY_MAX_GUESSES } from "./engine-core";

function bucket(fraction: number): string {
  if (fraction >= 0.8) return "🟥";
  if (fraction >= 0.6) return "🟧";
  if (fraction >= 0.4) return "🟨";
  if (fraction >= 0.2) return "🟩";
  return "🟦";
}

export function buildShareText(state: GameState, dateStr: string): string {
  const won = state.status === "won";
  const cap = state.maxGuesses ?? DAILY_MAX_GUESSES;
  const moves = state.guesses.reduce((sum, g) => sum + (g.cost ?? 1), 0);
  const hintPresses = state.guesses.filter((g) => g.kind === "hint" || g.kind === "clue").length;
  const score = won ? `${moves}/${cap}` : `X/${cap}`;
  const tally = hintPresses > 0 ? ` · 🔦${hintPresses}` : "";

  // Grid: a hint/clue row expands to cost-many 💡 (visualizes moves spent on help).
  const emojis: string[] = [];
  for (const r of state.guesses) {
    if (r.kind === "hint" || r.kind === "clue") {
      for (let i = 0; i < (r.cost ?? 1); i++) emojis.push("💡");
    } else if (won && r.guessId === state.target) {
      emojis.push("🎯");
    } else {
      emojis.push(bucket(r.warmth.fraction));
    }
  }
  const rows: string[] = [];
  for (let i = 0; i < emojis.length; i += 5) rows.push(emojis.slice(i, i + 5).join(""));
  return `Mesozooa ${dateStr}  ${score}${tally}\n${rows.join("\n")}`;
}
```

- [ ] **Step 4: Run to verify passes**

Run: `npx vitest run src/lib/game/share.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/share.ts src/lib/game/share.test.ts
git commit -m "feat(game): share expands hints by cost, adds 🔦 hint tally"
```

---

### Task 8: Stores — rework hint/clue getters and budget

**Files:**
- Modify: `src/lib/game/dailyStore.svelte.ts:4-17,63-88`
- Modify: `src/lib/game/gameStore.svelte.ts:4,22-31`

**Interfaces:**
- Consumes: `applyHintOrClue`, `hintCost`, `movesUsed`, `terminalClueActive`, `nextHintNode`, `HINT_COST_MIN` (engine-core); `clueFor` (existing).
- Produces (store getters used by GameBoard in Task 9):
  - `canHint: boolean` — playing, has a real guess, and either a next branch exists OR a not-yet-taken clue is available.
  - `nextHintCost: number` — `hintCost(state, store)`.
  - `movesUsed: number`, and `movesRemaining: number` (= `maxGuesses − movesUsed`).
  - `hint()` calls `applyHintOrClue`.
  - `clue` getter: show the clue once a `"clue"` row exists in state (button-triggered), not on `terminalClueActive`.

- [ ] **Step 1: Rewrite the daily store's hint region**

In `dailyStore.svelte.ts`, update imports (remove `MAX_HINTS` and `applyHint`; add `applyHintOrClue`, `hintCost`, `movesUsed`):
```ts
import {
  applyGuess,
  applyHintOrClue,
  newDailyState,
  warmestSharedNodeId,
  revealedNodeIds,
  nextHintNode,
  refreshWarmth,
  hintCost,
  movesUsed,
  terminalClueActive,
} from "./engine-core";
```
Replace the getters/actions (lines 63-88):
```ts
    get clue(): GenusAttribute | null {
      // Button-triggered: show once a clue row has been recorded.
      return state.guesses.some((g) => g.kind === "clue") ? clueFor(state.target) : null;
    },
    get guessesUsed(): number {
      return state.guesses.length;
    },
    get movesUsed(): number {
      return movesUsed(state);
    },
    get movesRemaining(): number {
      return state.maxGuesses === null ? Infinity : state.maxGuesses - movesUsed(state);
    },
    get nextHintCost(): number {
      return hintCost(state, treeStore);
    },
    get canHint(): boolean {
      if (state.status !== "playing") return false;
      if (!state.guesses.some((g) => g.kind === "guess")) return false;
      if (this.movesRemaining < this.nextHintCost) return false; // can't afford it
      // clue available (leaf-terminal, not yet taken) OR a branch remains to walk
      if (terminalClueActive(state, treeStore)) return !state.guesses.some((g) => g.kind === "clue");
      return nextHintNode(state, treeStore) !== null;
    },
    guess(id: string) {
      state = applyGuess(state, id, treeStore, warmth);
      save();
    },
    hint() {
      state = applyHintOrClue(state, treeStore, warmth);
      save();
    },
```

- [ ] **Step 2: Rewrite the practice store's clue getter + add hint support**

In `gameStore.svelte.ts`, update the import (add `applyHintOrClue`, `hintCost`, `movesUsed`, `nextHintNode`) and replace the `clue` getter + add a `hint()` (practice is unlimited: `maxGuesses` null, so cost never ends the game but still records for parity):
```ts
    get clue(): GenusAttribute | null {
      return state.guesses.some((g) => g.kind === "clue") ? clueFor(state.target) : null;
    },
    get nextHintCost(): number {
      return hintCost(state, treeStore);
    },
    get canHint(): boolean {
      if (state.status !== "playing") return false;
      if (!state.guesses.some((g) => g.kind === "guess")) return false;
      if (terminalClueActive(state, treeStore)) return !state.guesses.some((g) => g.kind === "clue");
      return nextHintNode(state, treeStore) !== null;
    },
    guess(id: string) {
      state = applyGuess(state, id, treeStore, warmth);
    },
    hint() {
      state = applyHintOrClue(state, treeStore, warmth);
    },
    newRound() {
      state = newRoundState(treeStore);
    },
```
(Keep the existing `terminalClueActive` import; add the new ones.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`svelte.ts` files are typechecked by tsc here.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/dailyStore.svelte.ts src/lib/game/gameStore.svelte.ts
git commit -m "feat(game): store getters for unified hint/clue + move budget"
```

---

### Task 9: Components — button label, history cost, specimen clue-on-demand

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte` (the typed `store` prop shape at lines 17-27, and the button at 132-135)
- Modify: `src/lib/game/components/GuessList.svelte:31-42` (show hint/clue cost on the row)
- Modify: `src/gallery/fixtures.ts` (the `FixtureStore` interface ~line 20-32, the `clue:` line, and the daily branch's `hintsRemaining`)

**Interfaces:**
- Consumes store getters from Task 8: `canHint`, `nextHintCost`, `movesRemaining`, `hint()`, `clue`.

- [ ] **Step 1: Update the GameBoard `store` prop type + hint button**

In `GameBoard.svelte`, the `store` prop is a typed structural interface (lines 17-27). In that block, replace `hintsRemaining?: number;` with:
```ts
      nextHintCost?: number;
      movesRemaining?: number;
```
Then update the button (lines 132-135) to show the *cost of the next press* and switch label to clue at the leaf-terminal state. Since the store knows whether the next press is a clue (via `nextHintCost` and the clue getter is empty until pressed), use a simple label that covers both:
```svelte
        {#if store.hint}
          <button type="button" class="btn-secondary" onclick={() => store.hint?.()} disabled={!store.canHint}>
            Hint{#if store.nextHintCost != null} (−{store.nextHintCost}){/if}
          </button>
        {/if}
```
If the board shows a remaining-budget number sourced from `hintsRemaining`, point it at `movesRemaining` instead. Search the file for `hintsRemaining` and replace remaining usages with `movesRemaining` (guess budget) — the end-state "with N hints" line at :124 keeps reading `hintsUsed` and is unchanged.

- [ ] **Step 2: Show hint/clue cost in the guess history**

In `GuessList.svelte`, the row currently tags hints with `hint`. Extend the tag to cover clue and show cost. Replace the hint-tag span (around line 33):
```svelte
        <button type="button" class="link guess-name" onclick={() => onselect(g.guessId)}>{displayName(guess?.name)}</button>{#if g.kind === "hint"} <span class="hint-tag">hint −{g.cost}</span>{:else if g.kind === "clue"} <span class="hint-tag">clue −{g.cost}</span>{/if}
```
For a `"clue"` row, `onselect(g.guessId)` would point at the target — undesirable (it's not a revealed node). Guard the clue row's name so it isn't a spoiler link; render plain text instead:
```svelte
      <span class="name-cell">
        {#if g.kind === "clue"}
          <span class="guess-name">Field clue</span> <span class="hint-tag">clue −{g.cost}</span>
        {:else}
          <button type="button" class="link guess-name" onclick={() => onselect(g.guessId)}>{displayName(guess?.name)}</button>{#if g.kind === "hint"} <span class="hint-tag">hint −{g.cost}</span>{/if}
        {/if}
      </span>
```
Also guard the `bar`/`clade` cells for a clue row: a clue has `sharedNodeId = target`, so the "shared:" cell would spoil. Wrap the `{#if !isWin}` clade span to also exclude clue rows: `{#if !isWin && g.kind !== "clue"}`. For the bar, a clue row should render an empty/again neutral bar — set its width to 0 for clue rows:
```svelte
      <span class="bar">
        <span class="fill" class:gem={isWin || g.warmth.fraction >= 0.7}
          style="width: {g.kind === "clue" ? 0 : isWin ? 100 : Math.round(g.warmth.fraction * 100)}%; background: {warmthRampColor(isWin ? 1 : g.warmth.fraction)}"></span>
      </span>
```

- [ ] **Step 3: Fix the stale gallery fixture**

`src/gallery/fixtures.ts` has a `FixtureStore` interface (~lines 20-32) mirroring GameBoard's `store` shape, plus a `fixtureStore()` builder. Three edits:

1. In the `FixtureStore` interface, replace `hintsRemaining?: number;` with:
   ```ts
   nextHintCost?: number;
   movesRemaining?: number;
   ```
2. In the builder's `daily` branch, replace `base.hintsRemaining = 3 - state.hintsUsed;` with:
   ```ts
   base.nextHintCost = 4;
   base.movesRemaining = 25 - state.guesses.reduce((s, g) => s + (g.cost ?? 1), 0);
   ```
3. The `clue:` line currently reads `terminalClueActive(state, treeStore) ? clueFor(...) : null`. To match the new button-triggered model, change it to fire on a recorded clue row:
   ```ts
   clue: state.guesses.some((g) => g.kind === "clue") ? clueFor(state.target) : null,
   ```
   (Gallery fixtures that want to *show* a clue add a `"clue"` row to their state; this keeps the gallery honest to the real mechanic.)

- [ ] **Step 4: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: 0 errors, 0 warnings.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 6: Manual verification (user drives — Playwright is off this session)**

Load the dev server, play a Daily:
- Guess a couple dinos → warmth narrows.
- Press Hint away from the answer → a branch reveals, budget drops by the shown cost (higher near the root).
- Narrow to the terminal clade → Hint button now delivers the **clue** (age + location) in the specimen, does NOT reveal the target, costs 2.
- History shows `hint −N` / `clue −2` tags.
- Win → share text shows `<moves>/<cap> · 🔦<presses>` and cost-many 💡 in the grid.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte src/lib/game/components/GuessList.svelte src/gallery/fixtures.ts
git commit -m "feat(game): unified hint/clue button, cost in history, clue-on-demand"
```

---

## Self-review notes (addressed)

- **Spec coverage:** Decision 1 → Task 1; Decision 2 → Tasks 2–3; Decision 3 → Tasks 4–5, 8–9; Decision 4 → Tasks 4, 7, 9; docs → Task 3. Persistence migration (spec file-list) → Task 6.
- **`"clue"` modeling:** resolved to a new `GuessKind` (spec update, confirmed with user). Clue rows are skipped by `revealedNodeIds` + `warmestSharedNodeId` (Task 5) and rendered non-spoilery in history (Task 9).
- **Budget number:** `DAILY_MAX_GUESSES` kept at its current value; now covers hint costs. Flagged for playtest — bump to ~25 is a one-line dial change, out of scope for correctness.
- **Fixture-count caveats:** Tasks 2 & 5 flag that exact expected keep-sets / warmth-trigger guesses depend on `terminalClade` output over `FIXTURE_RAWS`; the implementer verifies against actual grouping and adjusts the concrete ids while preserving the asserted contract.
```
