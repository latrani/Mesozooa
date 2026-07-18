# Mesozooa Game Completion (Plan 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Mesozooa game — add a deterministic Daily mode with a 20-guess budget, hints, an emoji share grid, and localStorage persistence — reusing the existing engine and components, behind a three-tab nav (Daily · Practice · Explore).

**Architecture:** Extend the pure `engine-core`/`GameState` (mode, budget, hints, lost status) and add pure modules for the deterministic daily answer, persistence, and share text — all TDD-tested. Extract a shared `GameBoard` from the practice game and add `Daily`/`Practice` surfaces plus a `dailyStore` singleton. Practice behavior is preserved; the game/daily/explorer stores are module singletons so tab switches keep state.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vite 6, Vitest 2. Extends the merged foundation, game (`src/lib/game/`), and explorer (`src/lib/explorer/`).

## Global Constraints

- **Reuse, behavior-preserving.** Extend/reuse existing engine + components. Practice mode must behave exactly as before (guarded by existing tests). The daily reuses the same warmth/trail/tree machinery as guesses.
- **One tree, one source of truth.** All feedback (guesses AND hints) references nodes from the shared `treeStore`; a hint's `sharedNodeId` is a real ancestor of the target, flowing through the existing `warmestSharedNodeId`/`revealedNodeIds`.
- **Daily determinism.** `dailyAnswer` = FNV-1a hash of the local `YYYY-MM-DD` date, mod the playable pool sorted by numeric QID. The date uses LOCAL components (`getFullYear/getMonth/getDate`), never `toISOString()` (UTC drift).
- **Budget & hints.** Daily: 20-guess budget (`maxGuesses`); `status` becomes `"lost"` when the budget is exhausted without a win. `MAX_HINTS = 3`; a hint requires ≥1 prior guess, consumes one guess, reveals the next node down the target's lineage from the current warmest clade, and never wins. Practice: unlimited, never lost.
- **Persistence.** Daily state persists per date under `mesozooa:daily:1:<YYYY-MM-DD>`; completed dailies are read-only. Practice is not persisted. No streak/stats store (deferred).
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Every task runs `npx tsc --noEmit` clean before commit. Component (.svelte) tasks also pass `npx svelte-check --tsconfig ./tsconfig.json` (0 errors) and `npm run build`, and keep all existing tests green.
- **Function first; styling deferred.** New markup is minimal (semantic class hooks only). No CSS polish. Hint rows / budget / share button ship unstyled.
- **Test fixture:** pure-logic tests use the foundation `FIXTURE_RAWS` (playable TR, TB, TC; Q430 count 4; O/CF count 1) or small literals. Reuse it.

---

### Task 1: Extend engine — mode, budget, hints, lost (`types` + `engine-core`)

**Files:**
- Modify: `src/lib/game/types.ts`, `src/lib/game/engine-core.ts`, `src/lib/game/engine-core.test.ts`

**Interfaces:**
- Produces: `GameMode`, `GuessKind`; `GameStatus` gains `"lost"`; `GuessResult` gains `kind`; `GameState` gains `mode`/`maxGuesses`/`hintsUsed`. New engine exports: `newDailyState(target, maxGuesses?)`, `applyHint(state, store, warmth)`, `nextHintNode(state, store)`, `MAX_HINTS`. `applyGuess` now stamps `kind:"guess"` and sets `"lost"` on budget exhaustion.

- [ ] **Step 1: Extend the types**

Replace `src/lib/game/types.ts` with:
```ts
export interface Warmth {
  value: number;
  display: string;
  fraction: number;
}

export type GuessKind = "guess" | "hint";

export interface GuessResult {
  guessId: string;
  sharedNodeId: string;
  warmth: Warmth;
  kind: GuessKind;
}

export type GameMode = "practice" | "daily";
export type GameStatus = "playing" | "won" | "lost";

export interface GameState {
  target: string;
  guesses: GuessResult[];
  status: GameStatus;
  mode: GameMode;
  maxGuesses: number | null;
  hintsUsed: number;
}
```

- [ ] **Step 2: Replace the engine test (existing cases updated + new)**

Replace `src/lib/game/engine-core.test.ts` with:
```ts
import { describe, it, expect } from "vitest";
import {
  applyGuess,
  applyHint,
  newRoundState,
  newDailyState,
  warmestSharedNodeId,
  revealedNodeIds,
  nextHintNode,
  MAX_HINTS,
} from "./engine-core";
import { createTreeStore } from "./treeStore";
import { createCountWarmth } from "./warmth";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";
import type { GameState } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);
const warmth = createCountWarmth(store.rootCount);

const practice = (target: string): GameState => ({
  target,
  guesses: [],
  status: "playing",
  mode: "practice",
  maxGuesses: null,
  hintsUsed: 0,
});

describe("applyGuess", () => {
  it("appends a guess result referencing mrca(guess, target)", () => {
    const s = applyGuess(practice("TC"), "TR", store, warmth);
    expect(s.guesses).toHaveLength(1);
    expect(s.guesses[0].sharedNodeId).toBe("Q430");
    expect(s.guesses[0].kind).toBe("guess");
    expect(s.guesses[0].warmth.value).toBe(4);
    expect(s.status).toBe("playing");
  });
  it("wins when the guess is the target", () => {
    expect(applyGuess(practice("TC"), "TC", store, warmth).status).toBe("won");
  });
  it("rejects a non-playable id", () => {
    expect(() => applyGuess(practice("TC"), "LO", store, warmth)).toThrow();
  });
  it("no-ops a duplicate guess", () => {
    const s1 = applyGuess(practice("TC"), "TR", store, warmth);
    expect(applyGuess(s1, "TR", store, warmth).guesses).toHaveLength(1);
  });
  it("practice is never lost (unlimited)", () => {
    let s = practice("TC");
    for (const id of ["TR", "TB"]) s = applyGuess(s, id, store, warmth);
    expect(s.status).toBe("playing");
  });
});

describe("daily budget", () => {
  it("is lost when the budget is exhausted without a win", () => {
    let s = newDailyState("TC", 2);
    s = applyGuess(s, "TR", store, warmth);
    expect(s.status).toBe("playing");
    s = applyGuess(s, "TB", store, warmth);
    expect(s.status).toBe("lost");
  });
  it("a winning final guess wins, not loses", () => {
    let s = newDailyState("TC", 2);
    s = applyGuess(s, "TR", store, warmth);
    s = applyGuess(s, "TC", store, warmth);
    expect(s.status).toBe("won");
  });
});

describe("nextHintNode", () => {
  it("returns the next node down the target lineage from the warmest clade", () => {
    let s = newDailyState("TC");
    s = applyGuess(s, "TR", store, warmth); // mrca(TR,TC)=Q430
    expect(nextHintNode(s, store)).toBe("O"); // Q430 -> O toward TC
  });
  it("is null with no guesses", () => {
    expect(nextHintNode(newDailyState("TC"), store)).toBeNull();
  });
});

describe("applyHint", () => {
  it("no-ops without a prior guess", () => {
    const s = applyHint(newDailyState("TC"), store, warmth);
    expect(s.guesses).toHaveLength(0);
    expect(s.hintsUsed).toBe(0);
  });
  it("appends a hint step and increments hintsUsed", () => {
    let s = newDailyState("TC");
    s = applyGuess(s, "TR", store, warmth);
    s = applyHint(s, store, warmth);
    expect(s.guesses).toHaveLength(2);
    expect(s.guesses[1].kind).toBe("hint");
    expect(s.guesses[1].sharedNodeId).toBe("O");
    expect(s.hintsUsed).toBe(1);
    expect(s.status).toBe("playing");
  });
  it("walks one step deeper each hint", () => {
    let s = newDailyState("TC");
    s = applyGuess(s, "TR", store, warmth);
    s = applyHint(s, store, warmth); // -> O
    s = applyHint(s, store, warmth); // -> CF
    expect(s.guesses[2].sharedNodeId).toBe("CF");
  });
  it("no-ops once hints are exhausted", () => {
    let s = newDailyState("TC");
    s = applyGuess(s, "TR", store, warmth);
    for (let i = 0; i < MAX_HINTS; i++) s = applyHint(s, store, warmth);
    const before = s.guesses.length;
    s = applyHint(s, store, warmth);
    expect(s.guesses).toHaveLength(before);
    expect(s.hintsUsed).toBe(MAX_HINTS);
  });
  it("counts toward the budget and can lose the game", () => {
    let s = newDailyState("TC", 2);
    s = applyGuess(s, "TR", store, warmth);
    s = applyHint(s, store, warmth);
    expect(s.status).toBe("lost");
  });
  it("no-ops when the game is over", () => {
    const won = applyGuess(newDailyState("TC"), "TC", store, warmth);
    expect(applyHint(won, store, warmth)).toBe(won);
  });
});

describe("selectors with hint rows", () => {
  it("warmest and revealed include the hinted clade", () => {
    let s = newDailyState("TC");
    s = applyGuess(s, "TR", store, warmth);
    s = applyHint(s, store, warmth); // reveals O (count 1)
    expect(warmestSharedNodeId(s, store)).toBe("O");
    expect(revealedNodeIds(s, store).has("O")).toBe(true);
  });
});

describe("newRoundState", () => {
  it("creates a playing practice state", () => {
    const s = newRoundState(store, () => 0);
    expect(s.mode).toBe("practice");
    expect(s.maxGuesses).toBeNull();
    expect(s.status).toBe("playing");
    expect(store.isPlayable(s.target)).toBe(true);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- engine-core`
Expected: FAIL — new exports (`applyHint`, `newDailyState`, `nextHintNode`, `MAX_HINTS`) missing; type errors on new fields.

- [ ] **Step 4: Replace the engine implementation**

Replace `src/lib/game/engine-core.ts` with:
```ts
import type { GameState, GameStatus, GuessResult } from "./types";
import type { TreeStore } from "./treeStore";
import type { WarmthProvider } from "./warmth";

export const MAX_HINTS = 3;

export function applyGuess(
  state: GameState,
  guessId: string,
  store: TreeStore,
  warmth: WarmthProvider,
): GameState {
  if (state.status !== "playing") return state;
  if (!store.isPlayable(guessId)) {
    throw new Error(`Not a playable genus: ${guessId}`);
  }
  if (state.guesses.some((g) => g.guessId === guessId)) return state;

  const sharedNodeId = store.mrca(guessId, state.target);
  const sharedNode = store.getNode(sharedNodeId)!;
  const result: GuessResult = {
    guessId,
    sharedNodeId,
    warmth: warmth.warmth(sharedNode),
    kind: "guess",
  };
  const guesses = [...state.guesses, result];
  let status: GameStatus = state.status;
  if (guessId === state.target) status = "won";
  else if (state.maxGuesses !== null && guesses.length >= state.maxGuesses) status = "lost";
  return { ...state, guesses, status };
}

export function newRoundState(store: TreeStore, rng: () => number = Math.random): GameState {
  const pool = store.playableGenera();
  const target = pool[Math.floor(rng() * pool.length)].id;
  return { target, guesses: [], status: "playing", mode: "practice", maxGuesses: null, hintsUsed: 0 };
}

export function newDailyState(target: string, maxGuesses = 20): GameState {
  return { target, guesses: [], status: "playing", mode: "daily", maxGuesses, hintsUsed: 0 };
}

export function warmestSharedNodeId(state: GameState, store: TreeStore): string | null {
  if (state.guesses.length === 0) return null;
  let bestId = state.guesses[0].sharedNodeId;
  let bestCount = store.getNode(bestId)!.descendantGenusCount;
  for (const g of state.guesses) {
    const count = store.getNode(g.sharedNodeId)!.descendantGenusCount;
    if (count < bestCount) {
      bestCount = count;
      bestId = g.sharedNodeId;
    }
  }
  return bestId;
}

export function revealedNodeIds(state: GameState, store: TreeStore): Set<string> {
  const ids = new Set<string>();
  for (const g of state.guesses) {
    for (const id of store.pathToRoot(g.guessId)) ids.add(id);
  }
  return ids;
}

// The next node one step down the target's true lineage from the current warmest clade.
export function nextHintNode(state: GameState, store: TreeStore): string | null {
  const w = warmestSharedNodeId(state, store);
  if (w === null) return null;
  const rootToTarget = store.pathToRoot(state.target).slice().reverse();
  const idx = rootToTarget.indexOf(w);
  if (idx === -1 || idx + 1 >= rootToTarget.length) return null;
  return rootToTarget[idx + 1];
}

export function applyHint(
  state: GameState,
  store: TreeStore,
  warmth: WarmthProvider,
): GameState {
  if (state.status !== "playing") return state;
  if (state.hintsUsed >= MAX_HINTS) return state;
  if (!state.guesses.some((g) => g.kind === "guess")) return state; // need a real guess first
  const nodeId = nextHintNode(state, store);
  if (nodeId === null) return state;

  const node = store.getNode(nodeId)!;
  const result: GuessResult = {
    guessId: nodeId,
    sharedNodeId: nodeId,
    warmth: warmth.warmth(node),
    kind: "hint",
  };
  const guesses = [...state.guesses, result];
  const hintsUsed = state.hintsUsed + 1;
  let status: GameStatus = state.status;
  if (state.maxGuesses !== null && guesses.length >= state.maxGuesses) status = "lost";
  return { ...state, guesses, hintsUsed, status };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- engine-core`
Expected: PASS.

- [ ] **Step 6: Type-check and commit**

Run: `npx tsc --noEmit` → clean (components read GameState but don't construct it, so no breakage).
```bash
git add src/lib/game/types.ts src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat: engine support for daily mode, budget, and hints"
```

---

### Task 2: Deterministic daily answer (`daily.ts`)

**Files:**
- Create: `src/lib/game/daily.ts`, `src/lib/game/daily.test.ts`

**Interfaces:**
- Produces: `hashDate(s): number` (FNV-1a 32-bit), `dailyAnswer(dateStr, pool: {id:string}[]): string` (pool sorted internally by numeric QID; index by hash), `todayString(d?: Date): string` (local `YYYY-MM-DD`).

- [ ] **Step 1: Write the failing test**

`src/lib/game/daily.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { hashDate, dailyAnswer, todayString } from "./daily";

describe("hashDate", () => {
  it("is deterministic", () => {
    expect(hashDate("2026-07-12")).toBe(hashDate("2026-07-12"));
  });
  it("differs for different dates", () => {
    expect(hashDate("2026-07-12")).not.toBe(hashDate("2026-07-13"));
  });
});

describe("dailyAnswer", () => {
  const pool = [{ id: "Q100" }, { id: "Q9" }, { id: "Q30" }];
  it("returns an id from the pool", () => {
    expect(pool.map((p) => p.id)).toContain(dailyAnswer("2026-07-12", pool));
  });
  it("is deterministic for a given date", () => {
    expect(dailyAnswer("2026-07-12", pool)).toBe(dailyAnswer("2026-07-12", pool));
  });
  it("is stable regardless of input order (sorts by numeric QID)", () => {
    const shuffled = [{ id: "Q30" }, { id: "Q100" }, { id: "Q9" }];
    expect(dailyAnswer("2026-07-12", pool)).toBe(dailyAnswer("2026-07-12", shuffled));
  });
  it("can differ across dates", () => {
    const answers = new Set(
      ["2026-07-12", "2026-07-13", "2026-07-14", "2026-07-15"].map((d) => dailyAnswer(d, pool)),
    );
    expect(answers.size).toBeGreaterThan(1);
  });
});

describe("todayString", () => {
  it("formats local date components zero-padded", () => {
    // Local Jan 5 2026 -> "2026-01-05" (month is 0-indexed in Date)
    expect(todayString(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- daily`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/game/daily.ts`:
```ts
function qnum(id: string): number {
  const m = id.match(/\d+/);
  return m ? Number(m[0]) : 0;
}

export function hashDate(s: string): number {
  let h = 2166136261; // FNV-1a offset basis
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function dailyAnswer(dateStr: string, pool: { id: string }[]): string {
  const sorted = [...pool].sort((a, b) => qnum(a.id) - qnum(b.id));
  return sorted[hashDate(dateStr) % sorted.length].id;
}

export function todayString(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- daily`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/game/daily.ts src/lib/game/daily.test.ts
git commit -m "feat: deterministic daily answer"
```

---

### Task 3: Daily persistence (`persistence.ts`)

**Files:**
- Create: `src/lib/game/persistence.ts`, `src/lib/game/persistence.test.ts`

**Interfaces:**
- Consumes: `GameState` from `./types`.
- Produces: `serializeDaily(state): string`, `deserializeDaily(json): GameState | null` (returns `null` on malformed/incomplete JSON).

- [ ] **Step 1: Write the failing test**

`src/lib/game/persistence.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { serializeDaily, deserializeDaily } from "./persistence";
import type { GameState } from "./types";

const sample: GameState = {
  target: "Q100",
  guesses: [
    { guessId: "Q9", sharedNodeId: "Q1", warmth: { value: 5, display: "5 genera", fraction: 0.3 }, kind: "guess" },
  ],
  status: "playing",
  mode: "daily",
  maxGuesses: 20,
  hintsUsed: 0,
};

describe("serializeDaily / deserializeDaily", () => {
  it("round-trips a daily state", () => {
    expect(deserializeDaily(serializeDaily(sample))).toEqual(sample);
  });
  it("returns null on non-JSON", () => {
    expect(deserializeDaily("not json")).toBeNull();
  });
  it("returns null when required fields are missing", () => {
    expect(deserializeDaily(JSON.stringify({ target: "Q1" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- persistence`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/game/persistence.ts`:
```ts
import type { GameState } from "./types";

export function serializeDaily(state: GameState): string {
  return JSON.stringify(state);
}

export function deserializeDaily(json: string): GameState | null {
  try {
    const obj = JSON.parse(json);
    if (
      obj &&
      typeof obj.target === "string" &&
      Array.isArray(obj.guesses) &&
      typeof obj.status === "string" &&
      typeof obj.mode === "string" &&
      typeof obj.hintsUsed === "number" &&
      (obj.maxGuesses === null || typeof obj.maxGuesses === "number")
    ) {
      return obj as GameState;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- persistence`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/game/persistence.ts src/lib/game/persistence.test.ts
git commit -m "feat: daily state serialization"
```

---

### Task 4: Share grid (`share.ts`)

**Files:**
- Create: `src/lib/game/share.ts`, `src/lib/game/share.test.ts`

**Interfaces:**
- Consumes: `GameState` from `./types`.
- Produces: `buildShareText(state, dateStr): string` — header + emoji grid (warmth buckets, `💡` hint, `🎯` winning guess, `X/20` on loss, 5 per line).

- [ ] **Step 1: Write the failing test**

`src/lib/game/share.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildShareText } from "./share";
import type { GameState, GuessResult } from "./types";

function g(fraction: number, kind: "guess" | "hint" = "guess", guessId = "x"): GuessResult {
  return { guessId, sharedNodeId: "s", warmth: { value: 1, display: "", fraction }, kind };
}

describe("buildShareText", () => {
  it("headers a win with n/20 and marks the winning guess", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.5, "hint"), g(1, "guess", "T")],
      status: "won",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 1,
    };
    const text = buildShareText(state, "2026-07-12");
    expect(text.split("\n")[0]).toBe("Mesozooa 2026-07-12  3/20");
    expect(text).toContain("🟦"); // cold guess
    expect(text).toContain("💡"); // hint
    expect(text).toContain("🎯"); // winning guess
  });
  it("headers a loss with X/20 and no target marker", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.9)],
      status: "lost",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 0,
    };
    const text = buildShareText(state, "2026-07-12");
    expect(text.split("\n")[0]).toBe("Mesozooa 2026-07-12  X/20");
    expect(text).not.toContain("🎯");
    expect(text).toContain("🟥"); // hot guess
  });
  it("wraps emoji 5 per line", () => {
    const state: GameState = {
      target: "T",
      guesses: [g(0.1), g(0.1), g(0.1), g(0.1), g(0.1), g(0.1)],
      status: "lost",
      mode: "daily",
      maxGuesses: 20,
      hintsUsed: 0,
    };
    const lines = buildShareText(state, "2026-07-12").split("\n");
    expect([...lines[1]].length).toBe(5); // 5 emoji on the first grid line
    expect([...lines[2]].length).toBe(1); // 1 on the second
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- share`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`src/lib/game/share.ts`:
```ts
import type { GameState } from "./types";

function bucket(fraction: number): string {
  if (fraction >= 0.8) return "🟥";
  if (fraction >= 0.6) return "🟧";
  if (fraction >= 0.4) return "🟨";
  if (fraction >= 0.2) return "🟩";
  return "🟦";
}

export function buildShareText(state: GameState, dateStr: string): string {
  const won = state.status === "won";
  const score = won ? `${state.guesses.length}/20` : "X/20";
  const emojis = state.guesses.map((r) => {
    if (r.kind === "hint") return "💡";
    if (won && r.guessId === state.target) return "🎯";
    return bucket(r.warmth.fraction);
  });
  const rows: string[] = [];
  for (let i = 0; i < emojis.length; i += 5) rows.push(emojis.slice(i, i + 5).join(""));
  return `Mesozooa ${dateStr}  ${score}\n${rows.join("\n")}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- share`
Expected: PASS.

- [ ] **Step 5: Type-check and commit**

Run: `npx tsc --noEmit` → clean.
```bash
git add src/lib/game/share.ts src/lib/game/share.test.ts
git commit -m "feat: emoji share grid"
```

---

### Task 5: Daily store singleton (`dailyStore.svelte.ts`)

**Files:**
- Create: `src/lib/game/dailyStore.svelte.ts`

**Interfaces:**
- Consumes: `treeStore`, `createCountWarmth`, `engine-core` (`applyGuess`/`applyHint`/`newDailyState`/`warmestSharedNodeId`/`revealedNodeIds`/`MAX_HINTS`), `daily` (`dailyAnswer`/`todayString`), `persistence` (`serializeDaily`/`deserializeDaily`).
- Produces: `daily` singleton — getters `date`, `state`, `warmestId`, `revealed`, `guessesUsed`, `hintsRemaining`, `canHint`; methods `guess(id)`, `hint()`. Loads today's persisted state or a fresh daily; saves to `localStorage` after each action.

- [ ] **Step 1: Write the store**

`src/lib/game/dailyStore.svelte.ts`:
```ts
import type { GameState } from "./types";
import { treeStore } from "./treeData";
import { createCountWarmth } from "./warmth";
import {
  applyGuess,
  applyHint,
  newDailyState,
  warmestSharedNodeId,
  revealedNodeIds,
  MAX_HINTS,
} from "./engine-core";
import { dailyAnswer, todayString } from "./daily";
import { serializeDaily, deserializeDaily } from "./persistence";

const warmth = createCountWarmth(treeStore.rootCount);

function storageKey(date: string): string {
  return `mesozooa:daily:1:${date}`;
}

function loadOrCreate(date: string): GameState {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(storageKey(date));
    const restored = raw ? deserializeDaily(raw) : null;
    if (restored) return restored;
  }
  const pool = treeStore.playableGenera().map((n) => ({ id: n.id }));
  return newDailyState(dailyAnswer(date, pool));
}

function createDaily() {
  const date = todayString();
  let state = $state<GameState>(loadOrCreate(date));

  function save() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(storageKey(date), serializeDaily(state));
    }
  }

  return {
    date,
    get state(): GameState {
      return state;
    },
    get warmestId(): string | null {
      return warmestSharedNodeId(state, treeStore);
    },
    get revealed(): Set<string> {
      return revealedNodeIds(state, treeStore);
    },
    get guessesUsed(): number {
      return state.guesses.length;
    },
    get hintsRemaining(): number {
      return MAX_HINTS - state.hintsUsed;
    },
    get canHint(): boolean {
      return (
        state.status === "playing" &&
        state.hintsUsed < MAX_HINTS &&
        state.guesses.some((g) => g.kind === "guess")
      );
    },
    guess(id: string) {
      state = applyGuess(state, id, treeStore, warmth);
      save();
    },
    hint() {
      state = applyHint(state, treeStore, warmth);
      save();
    },
  };
}

export const daily = createDaily();
```

- [ ] **Step 2: Type-check, compile-check, build**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → all suites pass.

- [ ] **Step 3: Verify the daily logic on real data**

Run:
```bash
cat > _smoke.ts <<'TS'
import { treeStore } from "./src/lib/game/treeData";
import { dailyAnswer, todayString } from "./src/lib/game/daily";
import { createCountWarmth } from "./src/lib/game/warmth";
import { applyGuess, applyHint, newDailyState, warmestSharedNodeId } from "./src/lib/game/engine-core";
import { buildShareText } from "./src/lib/game/share";
const w = createCountWarmth(treeStore.rootCount);
const date = todayString();
const target = dailyAnswer(date, treeStore.playableGenera().map((n) => ({ id: n.id })));
console.log("daily", date, "->", treeStore.getNode(target)!.name);
let s = newDailyState(target);
const other = treeStore.playableGenera().find((n) => n.id !== target)!;
s = applyGuess(s, other.id, treeStore, w);
s = applyHint(s, treeStore, w);
const wid = warmestSharedNodeId(s, treeStore)!;
console.log("after guess+hint: warmest", treeStore.getNode(wid)!.name, "| hintsUsed", s.hintsUsed);
s = applyGuess(s, target, treeStore, w);
console.log("status", s.status, "\n" + buildShareText(s, date));
if (s.status !== "won") throw new Error("expected win");
TS
npx tsx _smoke.ts; rm -f _smoke.ts
```
Expected: prints a real dino name, the warmest clade advances after the hint (`hintsUsed 1`), status `won`, and a share grid.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/dailyStore.svelte.ts
git commit -m "feat: daily store with persistence"
```

---

### Task 6: Extract `GameBoard`; add `Practice` (behavior-preserving)

**Files:**
- Create: `src/lib/game/components/GameBoard.svelte`, `src/lib/game/components/Practice.svelte`
- Modify: `src/App.svelte`
- Delete: `src/lib/game/components/Game.svelte`

**Interfaces:**
- `GameBoard` (props: `store: { state; warmestId; revealed; guess(id) }`, `disabled: boolean`) — the shared board (SearchBox when not disabled, WarmestTrail, GuessList, TreeView); manages `highlightId` internally and resets it when guesses clear.
- `Practice` (no props) — the practice singleton + `GameBoard` + RevealCard on win + "New round".
- `App` renders `Practice` for the play view (until the nav task).

- [ ] **Step 1: Write `GameBoard.svelte`**

`src/lib/game/components/GameBoard.svelte`:
```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import type { GameState } from "../types";
  import SearchBox from "./SearchBox.svelte";
  import GuessList from "./GuessList.svelte";
  import WarmestTrail from "./WarmestTrail.svelte";
  import TreeView from "./TreeView.svelte";

  let {
    store,
    disabled,
  }: {
    store: { state: GameState; warmestId: string | null; revealed: Set<string>; guess: (id: string) => void };
    disabled: boolean;
  } = $props();

  const playableEntries = treeStore.playableGenera().map((n) => ({ id: n.id, name: n.name }));
  let highlightId = $state<string | null>(null);

  // Reset the highlight when a new round clears the guesses.
  $effect(() => {
    if (store.state.guesses.length === 0) highlightId = null;
  });

  let emphasizedPath = $derived(
    store.warmestId ? new Set(treeStore.pathToRoot(store.warmestId)) : new Set<string>(),
  );

  let nodeTooltips = $derived.by(() => {
    const map = new Map<string, string[]>();
    for (const g of store.state.guesses) {
      const name = treeStore.getNode(g.guessId)?.name ?? g.guessId;
      const list = map.get(g.sharedNodeId) ?? [];
      list.push(name);
      map.set(g.sharedNodeId, list);
    }
    return map;
  });
</script>

{#if !disabled}
  <SearchBox entries={playableEntries} onpick={(id) => store.guess(id)} placeholder="Guess a dinosaur…" />
{/if}

<WarmestTrail warmestId={store.warmestId} />

<div class="board">
  <GuessList guesses={store.state.guesses} onselect={(id) => (highlightId = id)} />
  <TreeView
    revealed={store.revealed}
    {emphasizedPath}
    {nodeTooltips}
    {highlightId}
    emptyLabel="Make a guess to start revealing the tree."
  />
</div>
```

- [ ] **Step 2: Write `Practice.svelte`**

`src/lib/game/components/Practice.svelte`:
```svelte
<script lang="ts">
  import { game } from "../gameStore.svelte";
  import GameBoard from "./GameBoard.svelte";
  import RevealCard from "./RevealCard.svelte";
</script>

<main class="game">
  <header>
    <h1>Mesozooa</h1>
    <button type="button" onclick={() => game.newRound()}>New round</button>
  </header>

  {#if game.state.status === "won"}
    <RevealCard
      targetId={game.state.target}
      guessCount={game.state.guesses.length}
      onnew={() => game.newRound()}
    />
  {/if}

  <GameBoard store={game} disabled={game.state.status === "won"} />
</main>
```

- [ ] **Step 3: Point `App.svelte` at `Practice`**

Replace `src/App.svelte` with:
```svelte
<script lang="ts">
  import Practice from "./lib/game/components/Practice.svelte";
  import Explorer from "./lib/explorer/components/Explorer.svelte";

  let mode = $state<"play" | "explore">("play");
</script>

<nav class="modes">
  <button type="button" class:active={mode === "play"} onclick={() => (mode = "play")}>Play</button>
  <button type="button" class:active={mode === "explore"} onclick={() => (mode = "explore")}>Explore</button>
</nav>

{#if mode === "play"}
  <Practice />
{:else}
  <Explorer />
{/if}
```

- [ ] **Step 4: Delete the old `Game.svelte`**

Run: `git rm src/lib/game/components/Game.svelte`

- [ ] **Step 5: Verify (practice behavior preserved)**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → all suites pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/GameBoard.svelte src/lib/game/components/Practice.svelte src/App.svelte
git commit -m "refactor: extract shared GameBoard; Practice surface"
```

---

### Task 7: Daily surface (`Daily.svelte`)

**Files:**
- Create: `src/lib/game/components/Daily.svelte`

**Interfaces:**
- Consumes: `daily` singleton, `buildShareText`, `GameBoard`, `TaxonCard`.
- Produces: `Daily` (no props) — budget indicator, Hint button (disabled per `canHint`), the shared `GameBoard` (disabled unless playing), and a result section (outcome + `TaxonCard` + Share button) when the daily is over.

- [ ] **Step 1: Write `Daily.svelte`**

`src/lib/game/components/Daily.svelte`:
```svelte
<script lang="ts">
  import { daily } from "../dailyStore.svelte";
  import { buildShareText } from "../share";
  import GameBoard from "./GameBoard.svelte";
  import TaxonCard from "./TaxonCard.svelte";

  let copied = $state(false);

  async function share() {
    try {
      await navigator.clipboard.writeText(buildShareText(daily.state, daily.date));
      copied = true;
      setTimeout(() => (copied = false), 1500);
    } catch {
      // clipboard unavailable; no-op
    }
  }
</script>

<main class="daily">
  <header>
    <h1>Mesozooa — Daily</h1>
    <span class="budget">{daily.guessesUsed}/20</span>
  </header>

  {#if daily.state.status === "playing"}
    <button type="button" onclick={() => daily.hint()} disabled={!daily.canHint}>
      Hint ({daily.hintsRemaining} left)
    </button>
  {:else}
    <section class="result">
      <p class="outcome">{daily.state.status === "won" ? "Solved!" : "Out of guesses — the answer:"}</p>
      <TaxonCard taxonId={daily.state.target} />
      <button type="button" onclick={share}>{copied ? "Copied!" : "Share"}</button>
    </section>
  {/if}

  <GameBoard store={daily} disabled={daily.state.status !== "playing"} />
</main>
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → all suites pass.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/Daily.svelte
git commit -m "feat: daily surface with hints and share"
```

---

### Task 8: Three-tab navigation + final verification

**Files:**
- Modify: `src/App.svelte`

**Interfaces:**
- `App` renders a three-tab nav — Daily · Practice · Explore (Daily default) — each rendering its surface. The stores are singletons, so switching tabs preserves state.

- [ ] **Step 1: Wire the three tabs**

Replace `src/App.svelte` with:
```svelte
<script lang="ts">
  import Daily from "./lib/game/components/Daily.svelte";
  import Practice from "./lib/game/components/Practice.svelte";
  import Explorer from "./lib/explorer/components/Explorer.svelte";

  let tab = $state<"daily" | "practice" | "explore">("daily");
</script>

<nav class="modes">
  <button type="button" class:active={tab === "daily"} onclick={() => (tab = "daily")}>Daily</button>
  <button type="button" class:active={tab === "practice"} onclick={() => (tab = "practice")}>Practice</button>
  <button type="button" class:active={tab === "explore"} onclick={() => (tab = "explore")}>Explore</button>
</nav>

{#if tab === "daily"}
  <Daily />
{:else if tab === "practice"}
  <Practice />
{:else}
  <Explorer />
{/if}
```

- [ ] **Step 2: Verify gates**

Run: `npx tsc --noEmit` → clean.
Run: `npx svelte-check --tsconfig ./tsconfig.json` → 0 errors.
Run: `npm run build` → succeeds.
Run: `npm test` → all suites pass.

- [ ] **Step 3: Verify the full daily experience in the app**

Run: `npm run dev` and open the printed URL. Verify:
- **Daily** is the default tab; it shows today's dino puzzle with an `n/20` budget.
- Guessing works; after ≥1 guess the **Hint** button enables; taking a hint reveals the next clade toward the target, advances the warmest trail/tree, decrements "N left", and increments the budget count.
- Winning shows "Solved!" + the target card + **Share** (copies the emoji grid); losing after 20 shows the answer + Share.
- **Reload the page** mid-daily: progress is restored (persistence). A completed daily stays completed and read-only.
- **Practice** tab: unlimited "New round" game, unchanged. **Explore** tab: unchanged. Switching tabs preserves each surface's state.
(Stop the dev server when done.)

- [ ] **Step 4: Commit**

```bash
git add src/App.svelte
git commit -m "feat: Daily/Practice/Explore three-tab nav"
```

---

## Notes for later (not implemented here)

- **Leaf-disambiguation (KNOWN PAIN):** once the search is narrowed to a small clade, distinguishing the sibling genera (leaves) is the hardest, most frustrating part of the game — warmth can't separate siblings (same clade → same warmth). The hint extreme case (a hint revealing the target genus when the warmest clade is already its parent) is one symptom. This deserves its OWN future design pass (e.g. a distinct among-siblings hint, or showing distinguishing info — temporal range / size / region — for genera in the narrowed clade). Do not patch it inside this plan.
- **Look-and-feel pass:** styles the tabs, budget, hint button, hint rows (currently indistinct from guesses beyond `kind`), share button, and the daily result; plus all carry-forward cosmetics from earlier plans.
- **Streak/stats, historical-daily snapshotting, deep-link state:** deferred.
