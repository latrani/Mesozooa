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

export const NAMES: Record<string, string> = {
  empty: "Empty (no guesses)",
  broad: "Broad (wrong guesses, large clade)",
  terminal: "Terminal clade reached (clue shows)",
  solvedWon: "Solved — won",
  solvedLost: "Solved — lost (daily out of guesses)",
};
