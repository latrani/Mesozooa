# Streak & Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a daily-win streak plus rolling 7/30-day volume, win-ratio, and average-moves stats, surfaced in a header modal and on the daily end-screen.

**Architecture:** A pure, TDD-tested `stats.ts` (types + streak/window/accumulator math) behind a thin `statsStore.svelte.ts` singleton (localStorage, mirrors `dailyStore`/`practiceStore`). The daily and practice stores call `statsStore.record(...)` exactly once on the `playing → won/lost` transition, skipping seeded practice games (marked by a new optional `GameState.seeded`). UI is a `StatsContent` component mounted in both a header `Modal` and the daily end-screen.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite; Vitest for the pure core.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Vitest does NOT catch violations. Run `npx tsc --noEmit` AND `npx svelte-check` before every commit that touches `.ts`/`.svelte`.
- Pure logic is TDD-tested (`stats.ts`); Svelte components validated by build + running.
- No `Date.now()` / `new Date()` inside pure functions — callers inject `t` (epoch ms) and `today` ("YYYY-MM-DD"). `todayString(d?: Date)` already exists in `src/lib/game/daily.ts`.
- localStorage key: `mesozooa:stats:1`. Stores guard `typeof localStorage !== "undefined"` (SSR/test safety), matching `dailyStore`.
- Merge workflow: commit to `main`, do NOT push (Indi pushes). Add `Closes #24` to the final commit only.
- Verify before claiming done: run the exact commands, confirm output.

---

## File Structure

- Create `src/lib/game/stats.ts` — pure types + `emptyStats`, `recordPlay`, `windowStats`, `avgMoves`, `deserializeStats`, `serializeStats`, `dayDiff`.
- Create `src/lib/game/stats.test.ts` — the pure-core test suite.
- Create `src/lib/game/statsStore.svelte.ts` — thin localStorage singleton + derived views + `record`/`reset`.
- Create `src/lib/components/StatsContent.svelte` — the stat readout (mounted twice).
- Create `src/lib/components/StatsPanel.svelte` — header button + `Modal` wrapping `StatsContent`.
- Modify `src/lib/game/types.ts` — add optional `seeded?: true` to `GameState`.
- Modify `src/lib/game/engine-core.ts` — set `seeded` in `newRoundState` when the seed target is used.
- Modify `src/lib/game/dailyStore.svelte.ts` — record on the terminal edge in `guess()`.
- Modify `src/lib/game/practiceStore.svelte.ts` — record on the terminal edge in `guess()` and `forfeit()`.
- Modify `src/App.svelte` — mount `StatsPanel` in the header beside `HowToPlay`.
- Modify `src/lib/game/components/GameBoard.svelte` — mount `StatsContent` in the daily `ended` block.

---

### Task 1: `GameState.seeded` flag

**Files:**
- Modify: `src/lib/game/types.ts:18-25`
- Modify: `src/lib/game/engine-core.ts:78-89`
- Test: `src/lib/game/engine-core.test.ts` (existing; add cases)

**Interfaces:**
- Produces: `GameState.seeded?: true`; `newRoundState(store, rng?, targetId?)` sets `seeded: true` iff `targetId` is provided AND playable (the seeded path is actually taken).

- [ ] **Step 1: Write the failing test**

Add to `src/lib/game/engine-core.test.ts` (import `newRoundState` if not already imported; the file already builds a `store` fixture — reuse it, and pick any playable id via `store.playableGenera()[0].id`):

```ts
describe("newRoundState seeded flag", () => {
  it("marks a seeded round when given a playable target", () => {
    const id = store.playableGenera()[0].id;
    expect(newRoundState(store, Math.random, id).seeded).toBe(true);
  });
  it("leaves seeded undefined for a normal random round", () => {
    expect(newRoundState(store).seeded).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/engine-core.test.ts -t "seeded flag"`
Expected: FAIL (`seeded` is `undefined` in the first case — property doesn't exist yet).

- [ ] **Step 3: Add the field and set it**

In `src/lib/game/types.ts`, add to `GameState` (after `hintsUsed`):

```ts
  hintsUsed: number;
  /** set only when a practice round is started from a seed URL; excluded from stats. */
  seeded?: true;
```

In `src/lib/game/engine-core.ts`, rewrite `newRoundState`'s body:

```ts
export function newRoundState(
  store: TreeStore,
  rng: () => number = Math.random,
  targetId?: string,
): GameState {
  const pool = store.playableGenera();
  const seeded = targetId !== undefined && store.isPlayable(targetId);
  const target = seeded ? targetId! : pool[Math.floor(rng() * pool.length)].id;
  return {
    target,
    guesses: [],
    status: "playing",
    mode: "practice",
    maxGuesses: null,
    hintsUsed: 0,
    ...(seeded ? { seeded: true } : {}),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/engine-core.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/types.ts src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat(stats): mark seeded practice rounds on GameState (#24)"
```

---

### Task 2: Pure `stats.ts` — types, empty, serialize/deserialize

**Files:**
- Create: `src/lib/game/stats.ts`
- Test: `src/lib/game/stats.test.ts`

**Interfaces:**
- Produces:
  - `interface Acc { played: number; won: number; moveSum: number }`
  - `interface StreakRec { current: number; best: number; lastWinDate: string | null }`
  - `interface PlayLog { t: number; mode: GameMode; won: boolean; moves: number }`
  - `interface Stats { version: 1; streak: StreakRec; daily: Acc; overall: Acc; log: PlayLog[] }`
  - `emptyStats(): Stats`
  - `serializeStats(s: Stats): string`
  - `deserializeStats(raw: string | null): Stats` — returns `emptyStats()` on null/garbage/legacy.

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/stats.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { emptyStats, serializeStats, deserializeStats } from "./stats";

describe("emptyStats", () => {
  it("is a zeroed record", () => {
    expect(emptyStats()).toEqual({
      version: 1,
      streak: { current: 0, best: 0, lastWinDate: null },
      daily: { played: 0, won: 0, moveSum: 0 },
      overall: { played: 0, won: 0, moveSum: 0 },
      log: [],
    });
  });
});

describe("serializeStats / deserializeStats", () => {
  it("round-trips", () => {
    const s = emptyStats();
    s.streak.current = 3;
    s.log.push({ t: 100, mode: "daily", won: true, moves: 5 });
    expect(deserializeStats(serializeStats(s))).toEqual(s);
  });
  it("returns emptyStats on null", () => {
    expect(deserializeStats(null)).toEqual(emptyStats());
  });
  it("returns emptyStats on garbage", () => {
    expect(deserializeStats("not json")).toEqual(emptyStats());
    expect(deserializeStats(JSON.stringify({ version: 99 }))).toEqual(emptyStats());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/stats.test.ts`
Expected: FAIL ("Cannot find module ./stats").

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/game/stats.ts`:

```ts
import type { GameMode } from "./types";

export interface Acc {
  played: number;
  won: number;
  moveSum: number; // Σ movesUsed over won games; divided by `won` for average moves
}

export interface StreakRec {
  current: number;
  best: number;
  lastWinDate: string | null; // "YYYY-MM-DD" of the most recent daily win
}

export interface PlayLog {
  t: number; // epoch ms — the only thing rolling windows read
  mode: GameMode;
  won: boolean;
  moves: number; // movesUsed at completion
}

export interface Stats {
  version: 1;
  streak: StreakRec;
  daily: Acc;
  overall: Acc;
  log: PlayLog[];
}

export function emptyStats(): Stats {
  return {
    version: 1,
    streak: { current: 0, best: 0, lastWinDate: null },
    daily: { played: 0, won: 0, moveSum: 0 },
    overall: { played: 0, won: 0, moveSum: 0 },
    log: [],
  };
}

export function serializeStats(s: Stats): string {
  return JSON.stringify(s);
}

function isAcc(a: unknown): a is Acc {
  const r = a as Record<string, unknown>;
  return !!a && typeof r.played === "number" && typeof r.won === "number" && typeof r.moveSum === "number";
}

export function deserializeStats(raw: string | null): Stats {
  if (raw === null) return emptyStats();
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const streak = o.streak as Record<string, unknown> | undefined;
    if (
      o.version === 1 &&
      streak &&
      typeof streak.current === "number" &&
      typeof streak.best === "number" &&
      (streak.lastWinDate === null || typeof streak.lastWinDate === "string") &&
      isAcc(o.daily) &&
      isAcc(o.overall) &&
      Array.isArray(o.log)
    ) {
      return o as unknown as Stats;
    }
    return emptyStats();
  } catch {
    return emptyStats();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/stats.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/stats.ts src/lib/game/stats.test.ts
git commit -m "feat(stats): pure Stats types + empty/serialize/deserialize (#24)"
```

---

### Task 3: `dayDiff` + `windowStats` + `avgMoves`

**Files:**
- Modify: `src/lib/game/stats.ts`
- Test: `src/lib/game/stats.test.ts`

**Interfaces:**
- Consumes: `Stats`, `Acc` from Task 2.
- Produces:
  - `dayDiff(a: string, b: string): number` — whole days from `a` to `b` (both "YYYY-MM-DD"); `dayDiff("2026-07-21","2026-07-22") === 1`.
  - `windowStats(stats, now, days): { played: number; won: number; ratio: number | null }`
  - `avgMoves(acc: Acc): number | null`

- [ ] **Step 1: Write the failing test**

Append to `src/lib/game/stats.test.ts`:

```ts
import { dayDiff, windowStats, avgMoves } from "./stats";

describe("dayDiff", () => {
  it("counts whole days between dates", () => {
    expect(dayDiff("2026-07-21", "2026-07-22")).toBe(1);
    expect(dayDiff("2026-07-22", "2026-07-22")).toBe(0);
    expect(dayDiff("2026-07-22", "2026-07-21")).toBe(-1);
  });
  it("spans month boundaries", () => {
    expect(dayDiff("2026-06-30", "2026-07-01")).toBe(1);
  });
});

describe("windowStats", () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;
  const base = emptyStats();
  base.log = [
    { t: now - 2 * DAY, mode: "daily", won: true, moves: 5 },
    { t: now - 6 * DAY, mode: "practice", won: false, moves: 8 },
    { t: now - 9 * DAY, mode: "daily", won: true, moves: 4 },
  ];
  it("counts only plays within the trailing window", () => {
    expect(windowStats(base, now, 7)).toEqual({ played: 2, won: 1, ratio: 0.5 });
  });
  it("includes a play exactly at the window edge", () => {
    // the 7-day-old play sits exactly on the boundary (now - 7*DAY)
    const s = emptyStats();
    s.log = [{ t: now - 7 * DAY, mode: "daily", won: true, moves: 3 }];
    expect(windowStats(s, now, 7)).toEqual({ played: 1, won: 1, ratio: 1 });
  });
  it("ratio is null with no plays in window", () => {
    expect(windowStats(emptyStats(), now, 7)).toEqual({ played: 0, won: 0, ratio: null });
  });
});

describe("avgMoves", () => {
  it("averages moveSum over wins", () => {
    expect(avgMoves({ played: 5, won: 2, moveSum: 14 })).toBe(7);
  });
  it("is null with zero wins", () => {
    expect(avgMoves({ played: 3, won: 0, moveSum: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/stats.test.ts -t "windowStats"`
Expected: FAIL ("windowStats is not a function").

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/game/stats.ts`:

```ts
// Whole-day difference between two "YYYY-MM-DD" strings (b - a). Parsed as UTC midnight so DST
// never shifts the count. No Date.now(); inputs are explicit.
export function dayDiff(a: string, b: string): number {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

export function windowStats(
  stats: Stats,
  now: number,
  days: number,
): { played: number; won: number; ratio: number | null } {
  const cutoff = now - days * 86_400_000;
  let played = 0;
  let won = 0;
  for (const p of stats.log) {
    if (p.t >= cutoff) {
      played += 1;
      if (p.won) won += 1;
    }
  }
  return { played, won, ratio: played === 0 ? null : won / played };
}

export function avgMoves(acc: Acc): number | null {
  return acc.won === 0 ? null : acc.moveSum / acc.won;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/stats.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/stats.ts src/lib/game/stats.test.ts
git commit -m "feat(stats): dayDiff, windowStats, avgMoves (#24)"
```

---

### Task 4: `recordPlay` — accumulators + streak

**Files:**
- Modify: `src/lib/game/stats.ts`
- Test: `src/lib/game/stats.test.ts`

**Interfaces:**
- Consumes: `Stats`, `PlayLog`, `dayDiff` from Tasks 2–3.
- Produces: `recordPlay(stats, play, today): Stats` — pure; returns a NEW Stats. `play: PlayLog`, `today: string` ("YYYY-MM-DD"). Appends to log, bumps `overall` (and `daily` when `play.mode === "daily"`), and updates the streak on daily plays only.

Streak rules (daily plays only):
- daily **win**: if `lastWinDate === today` → streak unchanged (idempotent same-day guard); else if `lastWinDate` is exactly 1 day before `today` → `current += 1`; else → `current = 1`. Then `best = max(best, current)`, `lastWinDate = today`.
- daily **loss**: `current = 0` (leave `best`, `lastWinDate`).
- practice plays: streak untouched.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/game/stats.test.ts`:

```ts
import { recordPlay } from "./stats";

describe("recordPlay — accumulators", () => {
  it("bumps overall + daily on a daily win, adds moves to both moveSums", () => {
    const s = recordPlay(emptyStats(), { t: 1, mode: "daily", won: true, moves: 6 }, "2026-07-22");
    expect(s.overall).toEqual({ played: 1, won: 1, moveSum: 6 });
    expect(s.daily).toEqual({ played: 1, won: 1, moveSum: 6 });
    expect(s.log).toHaveLength(1);
  });
  it("bumps only overall on a practice play, and only moveSum on a win", () => {
    const win = recordPlay(emptyStats(), { t: 1, mode: "practice", won: true, moves: 9 }, "2026-07-22");
    expect(win.overall).toEqual({ played: 1, won: 1, moveSum: 9 });
    expect(win.daily).toEqual({ played: 0, won: 0, moveSum: 0 });
    const loss = recordPlay(emptyStats(), { t: 1, mode: "practice", won: false, moves: 9 }, "2026-07-22");
    expect(loss.overall).toEqual({ played: 1, won: 0, moveSum: 0 }); // loss adds no moves
  });
  it("does not mutate the input", () => {
    const s0 = emptyStats();
    recordPlay(s0, { t: 1, mode: "daily", won: true, moves: 6 }, "2026-07-22");
    expect(s0).toEqual(emptyStats());
  });
});

describe("recordPlay — streak", () => {
  const dailyWin = (moves = 5): PlayImport => ({ t: 1, mode: "daily", won: true, moves });
  it("starts a streak at 1 on the first daily win", () => {
    const s = recordPlay(emptyStats(), dailyWin(), "2026-07-22");
    expect(s.streak).toEqual({ current: 1, best: 1, lastWinDate: "2026-07-22" });
  });
  it("extends on consecutive days", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-21");
    s = recordPlay(s, dailyWin(), "2026-07-22");
    expect(s.streak).toEqual({ current: 2, best: 2, lastWinDate: "2026-07-22" });
  });
  it("resets to 1 after a gap, keeping best", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-20");
    s = recordPlay(s, dailyWin(), "2026-07-21"); // current 2, best 2
    s = recordPlay(s, dailyWin(), "2026-07-25"); // gap
    expect(s.streak).toEqual({ current: 1, best: 2, lastWinDate: "2026-07-25" });
  });
  it("is idempotent for a second win on the same day", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-22");
    s = recordPlay(s, dailyWin(), "2026-07-22");
    expect(s.streak.current).toBe(1);
  });
  it("resets current to 0 on a daily loss but preserves best", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-21"); // current 1, best 1
    s = recordPlay(s, { t: 2, mode: "daily", won: false, moves: 20 }, "2026-07-22");
    expect(s.streak).toEqual({ current: 0, best: 1, lastWinDate: "2026-07-21" });
  });
  it("ignores practice plays for the streak", () => {
    let s = recordPlay(emptyStats(), dailyWin(), "2026-07-22"); // current 1
    s = recordPlay(s, { t: 3, mode: "practice", won: false, moves: 4 }, "2026-07-22");
    expect(s.streak.current).toBe(1);
  });
});

type PlayImport = import("./stats").PlayLog;
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/stats.test.ts -t "recordPlay"`
Expected: FAIL ("recordPlay is not a function").

- [ ] **Step 3: Write minimal implementation**

Append to `src/lib/game/stats.ts`:

```ts
function bump(acc: Acc, won: boolean, moves: number): Acc {
  return {
    played: acc.played + 1,
    won: acc.won + (won ? 1 : 0),
    moveSum: acc.moveSum + (won ? moves : 0),
  };
}

// Returns a NEW Stats. Not idempotent for the log/accumulators — the caller (the store hook)
// must fire this exactly once per completed game. The same-day guard protects the STREAK only.
export function recordPlay(stats: Stats, play: PlayLog, today: string): Stats {
  const next: Stats = {
    ...stats,
    daily: play.mode === "daily" ? bump(stats.daily, play.won, play.moves) : stats.daily,
    overall: bump(stats.overall, play.won, play.moves),
    log: [...stats.log, play],
    streak: { ...stats.streak },
  };

  if (play.mode === "daily") {
    if (play.won) {
      if (next.streak.lastWinDate === today) {
        // same-day repeat: leave the streak untouched
      } else {
        const consecutive = next.streak.lastWinDate !== null && dayDiff(next.streak.lastWinDate, today) === 1;
        next.streak.current = consecutive ? next.streak.current + 1 : 1;
        next.streak.best = Math.max(next.streak.best, next.streak.current);
        next.streak.lastWinDate = today;
      }
    } else {
      next.streak.current = 0;
    }
  }
  return next;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/stats.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/stats.ts src/lib/game/stats.test.ts
git commit -m "feat(stats): recordPlay — accumulators + streak logic (#24)"
```

---

### Task 5: `statsStore.svelte.ts`

**Files:**
- Create: `src/lib/game/statsStore.svelte.ts`

**Interfaces:**
- Consumes: all of `stats.ts`; `todayString` from `./daily`.
- Produces: `statsStore` singleton with getters `stats`, `streak`, `week`, `month`, `dailyAvg`, `overallAvg`, `allTime`, and methods `record(play: Omit<PlayLog, "t"> & { t?: number })`, `reset()`.
  - `record` stamps `t` with `Date.now()` when omitted, calls `recordPlay(_, play, todayString())`, saves.
  - `week`/`month` = `windowStats(_, Date.now(), 7|30)`.
  - `allTime` = `{ played, won, ratio }` derived from `overall`.

This task has no unit test (Svelte runes module; validated by build + Task 8's live check). Right-sized as its own task because it's the seam every later task consumes.

- [ ] **Step 1: Create the store**

Create `src/lib/game/statsStore.svelte.ts`:

```ts
import type { PlayLog, Stats } from "./stats";
import { emptyStats, deserializeStats, serializeStats, recordPlay, windowStats, avgMoves } from "./stats";
import { todayString } from "./daily";

const STATS_KEY = "mesozooa:stats:1";

function load(): Stats {
  if (typeof localStorage === "undefined") return emptyStats();
  return deserializeStats(localStorage.getItem(STATS_KEY));
}

function createStatsStore() {
  let state = $state<Stats>(load());

  function save() {
    if (typeof localStorage !== "undefined") localStorage.setItem(STATS_KEY, serializeStats(state));
  }

  return {
    get stats(): Stats {
      return state;
    },
    get streak() {
      return state.streak;
    },
    get week() {
      return windowStats(state, Date.now(), 7);
    },
    get month() {
      return windowStats(state, Date.now(), 30);
    },
    get dailyAvg(): number | null {
      return avgMoves(state.daily);
    },
    get overallAvg(): number | null {
      return avgMoves(state.overall);
    },
    get allTime(): { played: number; won: number; ratio: number | null } {
      const o = state.overall;
      return { played: o.played, won: o.won, ratio: o.played === 0 ? null : o.won / o.played };
    },
    /** Log one completed, non-seeded game. Caller fires this exactly once per game. */
    record(play: Omit<PlayLog, "t"> & { t?: number }) {
      const full: PlayLog = { t: play.t ?? Date.now(), mode: play.mode, won: play.won, moves: play.moves };
      state = recordPlay(state, full, todayString());
      save();
    },
    reset() {
      state = emptyStats();
      if (typeof localStorage !== "undefined") localStorage.removeItem(STATS_KEY);
    },
  };
}

export const statsStore = createStatsStore();
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/statsStore.svelte.ts
git commit -m "feat(stats): statsStore singleton over localStorage (#24)"
```

---

### Task 6: Logging hooks in daily + practice stores

**Files:**
- Modify: `src/lib/game/dailyStore.svelte.ts:85-88`
- Modify: `src/lib/game/practiceStore.svelte.ts` (`guess`, `forfeit`)

**Interfaces:**
- Consumes: `statsStore.record`; `movesUsed` from `./engine-core`.
- Produces: no new exports. Each store records once on the `playing → won/lost` edge, skipping `state.seeded`.

The pattern: capture `state.status` before the reducer, compare after; if it just became terminal, record. `movesUsed(state)` gives the `moves` value (guesses + hint costs). Daily is never seeded, so its guard is just the edge; practice guards on `!state.seeded`.

- [ ] **Step 1: Wire the daily store**

In `src/lib/game/dailyStore.svelte.ts`: add imports near the top (the file already imports several names from `./engine-core` — add `movesUsed` there if not present; it is already imported per current source, so only add the statsStore import):

```ts
import { statsStore } from "./statsStore.svelte";
```

Replace the `guess` method (lines ~85-88) with:

```ts
    guess(id: string) {
      const was = state.status;
      state = applyGuess(state, id, treeStore, warmth);
      save();
      if (was === "playing" && state.status !== "playing") {
        statsStore.record({ mode: "daily", won: state.status === "won", moves: movesUsed(state) });
      }
    },
```

(`movesUsed` is already imported in `dailyStore.svelte.ts`. If a build says otherwise, add it to the existing `from "./engine-core"` import list.)

- [ ] **Step 2: Wire the practice store**

In `src/lib/game/practiceStore.svelte.ts`, add the import:

```ts
import { statsStore } from "./statsStore.svelte";
```

`movesUsed` is already imported there. Replace `guess` and `forfeit`:

```ts
    guess(id: string) {
      const was = state.status;
      state = applyGuess(state, id, treeStore, warmth);
      save();
      if (was === "playing" && state.status !== "playing" && !state.seeded) {
        statsStore.record({ mode: "practice", won: state.status === "won", moves: movesUsed(state) });
      }
    },
    hint() {
      state = applyHint(state, treeStore, warmth);
      save();
    },
    forfeit() {
      const was = state.status;
      state = applyForfeit(state);
      save();
      if (was === "playing" && state.status !== "playing" && !state.seeded) {
        statsStore.record({ mode: "practice", won: false, moves: movesUsed(state) });
      }
    },
```

- [ ] **Step 3: Verify type-check + full test suite**

Run: `npx tsc --noEmit && npx svelte-check && npx vitest run`
Expected: 0 errors/warnings; all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/game/dailyStore.svelte.ts src/lib/game/practiceStore.svelte.ts
git commit -m "feat(stats): record completed games on the terminal edge (#24)"
```

---

### Task 7: `StatsContent` + `StatsPanel` components and mounts

**Files:**
- Create: `src/lib/components/StatsContent.svelte`
- Create: `src/lib/components/StatsPanel.svelte`
- Modify: `src/App.svelte` (header, after `<HowToPlay />` at line ~134)
- Modify: `src/lib/game/components/GameBoard.svelte` (daily `ended` block, after line ~98)

**Interfaces:**
- Consumes: `statsStore` (Task 5); `Modal` (`src/lib/components/Modal.svelte`, props `open` (bindable), `title`, `children`).
- Produces: `StatsContent` (no props — reads `statsStore` directly); `StatsPanel` (no props — header button + modal).

- [ ] **Step 1: Create `StatsContent.svelte`**

```svelte
<script lang="ts">
  import { statsStore } from "../game/statsStore.svelte";

  let confirming = $state(false);

  const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
  const avg = (m: number | null) => (m === null ? "—" : m.toFixed(1));

  // Empty state: nothing ever recorded.
  let empty = $derived(statsStore.allTime.played === 0);
</script>

<div class="stats">
  {#if empty}
    <p class="stats-empty">Play the daily to start a streak.</p>
  {:else}
    <div class="streak">
      <span class="big">{statsStore.streak.current}</span>
      <span class="streak-label">day streak</span>
      <span class="streak-best">Best: {statsStore.streak.best}</span>
    </div>

    <dl class="grid">
      <div><dt>Last 7 days</dt><dd>{statsStore.week.played} plays · {pct(statsStore.week.ratio)} won</dd></div>
      <div><dt>Last 30 days</dt><dd>{statsStore.month.played} plays · {pct(statsStore.month.ratio)} won</dd></div>
      <div><dt>Avg moves (daily)</dt><dd>{avg(statsStore.dailyAvg)}</dd></div>
      <div><dt>Avg moves (overall)</dt><dd>{avg(statsStore.overallAvg)}</dd></div>
      <div><dt>All-time</dt><dd>{statsStore.allTime.played} plays · {pct(statsStore.allTime.ratio)} won</dd></div>
    </dl>

    <div class="reset">
      {#if confirming}
        <span class="reset-warn">Erase all stats? This can't be undone.</span>
        <button type="button" class="btn-secondary btn-small" onclick={() => (confirming = false)}>Cancel</button>
        <button type="button" class="btn-secondary btn-small" onclick={() => { statsStore.reset(); confirming = false; }}>Erase</button>
      {:else}
        <button type="button" class="btn-secondary btn-small" onclick={() => (confirming = true)}>Reset stats</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stats { display: flex; flex-direction: column; gap: var(--space-4); }
  .streak { display: flex; align-items: baseline; gap: var(--space-2); }
  .streak .big { font-size: 2.5rem; font-weight: var(--fw-black); color: var(--ink); }
  .streak-label { font-size: var(--type-body); color: var(--ink); }
  .streak-best { margin-left: auto; color: var(--ink-mute); }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2) var(--space-4); margin: 0; }
  .grid dt { color: var(--ink-mute); font-size: var(--type-meta); }
  .grid dd { margin: 0; color: var(--ink); }
  .reset { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .reset-warn { color: var(--ink); font-size: var(--type-meta); }
  .stats-empty { color: var(--ink-mute); }
</style>
```

- [ ] **Step 2: Create `StatsPanel.svelte`**

```svelte
<script lang="ts">
  import Modal from "./Modal.svelte";
  import StatsContent from "./StatsContent.svelte";
  let open = $state(false);
</script>

<button type="button" class="stats-link btn-secondary btn-small" onclick={() => (open = true)}>Stats</button>

<Modal bind:open title="Your stats">
  <StatsContent />
</Modal>

<style>
  .stats-link {
    --btn-secondary-ink: var(--cream);
    align-self: baseline; /* share the tagline baseline, matching HowToPlay */
  }
  .stats-link:hover { color: var(--cream); }
</style>
```

- [ ] **Step 3: Mount `StatsPanel` in the header**

In `src/App.svelte`, add the import with the other component imports (near line 11):

```ts
  import StatsPanel from "./lib/components/StatsPanel.svelte";
```

And add the panel right after `<HowToPlay />` (line ~134):

```svelte
  <HowToPlay />
  <StatsPanel />
```

- [ ] **Step 4: Mount `StatsContent` on the daily end-screen**

In `src/lib/game/components/GameBoard.svelte`, add the import (near line 8):

```ts
  import StatsContent from "../../components/StatsContent.svelte";
```

In the `ended` block, after the closing `</div>` of `.result` (line ~98), add a daily-only mount:

```svelte
      </div>
      {#if store.state.mode === "daily"}
        <div class="end-stats"><StatsContent /></div>
      {/if}
```

Add to the component's `<style>`:

```css
  .end-stats { margin-top: var(--space-4); }
```

- [ ] **Step 5: Verify build + type-check**

Run: `npx tsc --noEmit && npx svelte-check && npm run build`
Expected: 0 errors/warnings; build succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/StatsContent.svelte src/lib/components/StatsPanel.svelte src/App.svelte src/lib/game/components/GameBoard.svelte
git commit -m "feat(stats): StatsContent + StatsPanel, header + daily end-screen mounts (#24)"
```

---

### Task 8: Live verification

**Files:** none (verification only).

**Interfaces:** Consumes the running preview build.

- [ ] **Step 1: Build + preview**

Run: `npm run build && npm run preview -- --port 4323`
(run preview in the background)

- [ ] **Step 2: Verify a completed daily logs once and shows a streak**

Drive the browser (Playwright): navigate `http://localhost:4323/?fresh=1#/daily`, clear `localStorage`, play the daily to a win (or force-lose via 20 guesses). Then read `localStorage['mesozooa:stats:1']` and assert:
- `overall.played === 1`, `daily.played === 1`.
- On a win: `streak.current === 1`, `daily.won === 1`.
- The `.end-stats` block renders the streak on the daily end-screen.

- [ ] **Step 3: Verify seeded practice logs nothing**

Navigate `http://localhost:4323/#/practice/seed?taxon=<a-playable-slug>`, confirm it redirects to `#/practice`, win the game, then assert `localStorage['mesozooa:stats:1']` is unchanged (`overall.played` did not increment) and `state.seeded` was true.

- [ ] **Step 4: Verify normal practice logs, and reset works**

Play a normal practice game to a win → assert `overall.played` incremented but `daily.played` did not, and `streak.current` unchanged. Open the header Stats modal, click "Reset stats" → "Erase", assert the panel returns to the empty state and the key is cleared.

- [ ] **Step 5: Final commit (closes the issue)**

If any doc/notes changed during verification, commit them; otherwise make the issue-closing marker on the last real commit. If all prior commits are already made, create an empty marker only if needed — otherwise amend is not required. Ensure ONE commit in the series contains `Closes #24`:

```bash
git commit --allow-empty -m "chore(stats): verified live — daily logs, seeded skipped, reset works (Closes #24)"
```

---

## Self-Review Notes

- **Spec coverage:** data model (Tasks 2–4), seeded gap (Task 1), pure stats.ts + thin store (Tasks 2–5), record-once-on-edge hook (Task 6), modal + end-screen surface + two-step reset (Task 7), tests (Tasks 1–4 pure; Task 8 live). Rolling windows (Task 3), avg moves daily+overall (Tasks 3–5, 7). All covered.
- **Types consistent:** `Acc`, `StreakRec`, `PlayLog`, `Stats`, `recordPlay(stats, play, today)`, `windowStats(stats, now, days)`, `avgMoves(acc)`, `statsStore.record(...)` used identically across tasks.
- **Out of scope (per spec):** win-distribution histogram, share/export, cross-device sync, log capping — none planned.
