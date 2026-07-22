// Gallery fixtures — real GameStates built by running the REAL engine, so every
// gallery panel shows exactly what the game would produce (not hand-faked state).
// Dev-only (imported by the gallery entry, never by the app).
import type { GameState } from "../lib/game/types";
import type { GenusAttribute } from "../lib/attributes";
import { treeStore } from "../lib/game/treeData";
import { warmthForTarget, type WarmthProvider } from "../lib/game/warmth";
import {
  newDailyState,
  applyGuess,
  applyHint,
  warmestSharedNodeId,
  revealedNodeIds,
  leafHintActive,
  hintCost,
  movesUsed,
} from "../lib/game/engine-core";
import { clueFor } from "../lib/game/clue";

// A frozen store snapshot matching the structural contract GameBoard/Specimen read.
// No reactivity, no persistence — a fixed view of one GameState via the real selectors.
export interface FixtureStore {
  state: GameState;
  warmestId: string | null;
  revealed: Set<string>;
  clue: GenusAttribute | null;
  guess: (id: string) => void;
  canHint?: boolean;
  hint?: () => void;
  nextHintCost?: number;
  movesRemaining?: number;
  guessesUsed?: number;
  readonly warmthProvider: WarmthProvider;
}

export function fixtureStore(state: GameState, opts: { daily?: boolean } = {}): FixtureStore {
  const base: FixtureStore = {
    state,
    warmestId: warmestSharedNodeId(state, treeStore),
    revealed: revealedNodeIds(state, treeStore),
    clue: state.guesses.some((g) => g.kind === "leafHint") ? clueFor(state.target) : null,
    guess: () => {}, // no-op: gallery states are frozen
    get warmthProvider() {
      return warmthForTarget(treeStore.data, state.target);
    },
  };
  if (opts.daily) {
    base.guessesUsed = state.guesses.length;
    base.nextHintCost = hintCost(state, treeStore);
    base.movesRemaining = state.maxGuesses === null ? Infinity : state.maxGuesses - movesUsed(state);
    base.canHint = false; // frozen
    base.hint = () => {};
  }
  return base;
}

export function warmthFractionOf(state: GameState): number {
  return state.guesses.reduce((m, g) => Math.max(m, g.warmth.fraction), 0);
}

// ---- Build real states by playing the engine against a chosen target ----

// A target genus that HAS siblings + a clue, so the terminal-clue state is exercisable.
// Archaeopteryx: playable, has attributes (Tithonian, Germany). Its terminal clade has siblings.
const TARGET = "Q100196"; // Archaeopteryx

// Every state in this file plays toward the same target, so one provider suffices.
const warmth = warmthForTarget(treeStore.data, TARGET);

function daily(target = TARGET): GameState {
  return newDailyState(target);
}

// Guess a genus by id (must be playable) against the given state.
function g(state: GameState, id: string): GameState {
  return applyGuess(state, id, treeStore, warmth);
}

// Pick a few real playable genera at varying distances from the target for warmth spread.
// These are stable ids from the committed tree.
const FAR = "Q104471803"; // Abitusavis (some avialan) — adjust distance via MRCA naturally
const MID = "Q14330"; // Diplodocus (sauropod) — far from a theropod target => cold
const NEAR = "Q100196"; // Archaeopteryx itself is the target

// EMPTY — no guesses yet.
export const stateEmpty: GameState = daily();

// BROAD — a couple of wrong guesses in different clades (warmth still large).
export const stateBroad: GameState = g(g(daily(), MID), FAR);

// TERMINAL — narrowed until leafHintActive fires (clue shows). Built by walking hints
// down the target lineage from a real guess until the clue triggers.
export const stateTerminal: GameState = (() => {
  let s = g(daily(), FAR); // one real guess to seed
  // apply hints to march down the target lineage until the clue is active (max a few)
  for (let i = 0; i < 6 && !leafHintActive(s, treeStore); i++) {
    const next = applyHint(s, treeStore, warmth);
    if (next === s) break; // no-op guard
    s = next;
  }
  return s;
})();

// DEEP — a spread of guesses that diverge from the target's lineage at MANY different depths,
// so the spine sprouts off-branches at varied attachment depths on both sides. This is the
// crossing-prone shape that exercises deepest-innermost nesting (spine-layout). Guesses are
// picked from the REAL tree by MRCA depth, so it stays valid as data changes (no fragile ids).
export const stateDeep: GameState = (() => {
  const targetPath = treeStore.pathToRoot(TARGET); // target..root
  const targetDepth = treeStore.getNode(TARGET)!.depth;
  // One playable genus per distinct divergence depth: MRCA(guess,target) at depth d, but the
  // guess must NOT be on the target's own lineage (else it wouldn't splay off the spine).
  const onLineage = new Set(targetPath);
  const byDepth = new Map<number, string>();
  for (const genus of treeStore.playableGenera()) {
    if (genus.id === TARGET || onLineage.has(genus.id)) continue;
    const d = treeStore.getNode(treeStore.mrca(genus.id, TARGET))!.depth;
    if (d < targetDepth && !byDepth.has(d)) byDepth.set(d, genus.id);
  }
  // Take up to six shallowest-to-deepest divergence points for a tall, multi-depth spread.
  const picks = [...byDepth.entries()].sort((a, b) => a[0] - b[0]).slice(0, 6).map(([, id]) => id);
  let s = daily();
  for (const id of picks) s = g(s, id);
  return s;
})();

// SOLVED (won) — guess the target.
export const stateSolvedWon: GameState = g(g(daily(), FAR), TARGET);

// SOLVED (lost) — a daily with maxGuesses exhausted without the target.
export const stateSolvedLost: GameState = (() => {
  let s = newDailyState(TARGET, 2); // tiny budget
  s = g(s, MID);
  s = g(s, FAR); // 2 wrong guesses => lost
  return s;
})();

// ---- Stats fixtures: frozen StatsView objects built from real Stats via the pure selectors ----
// StatsContent takes an optional `source: StatsView`; the app uses the live store, the gallery
// feeds these so multiple stats states render at once. Windows use a fixed `now` so "last 7/30
// days" is deterministic (no dependence on the current date).
import type { Stats } from "../lib/game/stats";
import { emptyStats, windowStats, avgMoves, currentStreak } from "../lib/game/stats";
import type { StatsView } from "../lib/game/statsStore.svelte";

// A fixed reference "now"/"today" so window math is stable across days. 2026-07-22.
const STATS_NOW = Date.parse("2026-07-22T12:00:00Z");
const STATS_TODAY = "2026-07-22";
const DAY = 86_400_000;

function statsView(s: Stats): StatsView {
  const o = s.overall;
  return {
    get streak() {
      return { ...s.streak, current: currentStreak(s.streak, STATS_TODAY) };
    },
    get week() {
      return windowStats(s, STATS_NOW, 7);
    },
    get month() {
      return windowStats(s, STATS_NOW, 30);
    },
    get dailyAvg() {
      return avgMoves(s.daily);
    },
    get overallAvg() {
      return avgMoves(s.overall);
    },
    get allTime() {
      return { played: o.played, won: o.won, ratio: o.played === 0 ? null : o.won / o.played };
    },
    reset: () => {}, // frozen — no-op in the gallery
  };
}

// EMPTY — nothing recorded yet (shows the empty-state copy).
export const statsEmpty: StatsView = statsView(emptyStats());

// ACTIVE — a healthy record: a 5-day streak (best 12), mixed recent play, real averages.
export const statsActive: StatsView = statsView(
  (() => {
    const s = emptyStats();
    s.streak = { current: 5, best: 12, lastWinDate: STATS_TODAY };
    s.daily = { played: 40, won: 33, moveSum: 132 }; // avg 4.0 moves/win
    s.overall = { played: 95, won: 71, moveSum: 355 }; // avg 5.0 moves/win
    // A recent-window spread: 6 plays in the last 7 days (5 won), more across 30.
    s.log = [
      { t: STATS_NOW - 1 * DAY, mode: "daily", won: true, moves: 3 },
      { t: STATS_NOW - 2 * DAY, mode: "practice", won: true, moves: 5 },
      { t: STATS_NOW - 3 * DAY, mode: "daily", won: false, moves: 20 },
      { t: STATS_NOW - 4 * DAY, mode: "practice", won: true, moves: 4 },
      { t: STATS_NOW - 5 * DAY, mode: "daily", won: true, moves: 6 },
      { t: STATS_NOW - 6 * DAY, mode: "daily", won: true, moves: 2 },
      { t: STATS_NOW - 12 * DAY, mode: "practice", won: true, moves: 7 },
      { t: STATS_NOW - 20 * DAY, mode: "daily", won: false, moves: 20 },
    ];
    return s;
  })(),
);

// BROKEN STREAK — won days ago but missed since, so the DISPLAYED current is 0 (best preserved).
export const statsBrokenStreak: StatsView = statsView(
  (() => {
    const s = emptyStats();
    s.streak = { current: 7, best: 7, lastWinDate: "2026-07-19" }; // 3 days before STATS_TODAY
    s.daily = { played: 10, won: 8, moveSum: 40 };
    s.overall = { played: 10, won: 8, moveSum: 40 };
    s.log = [{ t: STATS_NOW - 3 * DAY, mode: "daily", won: true, moves: 5 }];
    return s;
  })(),
);

export const STATS_NAMES: Record<string, string> = {
  empty: "Empty (no plays yet)",
  active: "Active — 5-day streak, mixed recent play",
  brokenStreak: "Broken streak — missed a day (current shows 0, best kept)",
};

export const NAMES: Record<string, string> = {
  empty: "Empty (no guesses)",
  broad: "Broad (wrong guesses, large clade)",
  terminal: "Terminal clade reached (clue shows)",
  solvedWon: "Solved — won",
  solvedLost: "Solved — lost (daily out of guesses)",
};
