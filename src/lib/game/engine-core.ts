import type { GameState, GameStatus, GuessResult } from "./types";
import type { TreeStore } from "./treeStore";
import type { WarmthProvider } from "./warmth";
import { terminalClade } from "../tree/terminal";

export const DAILY_MAX_GUESSES = 20;

export const HINT_COST_MAX = 6; // a shallow (near-root) hint costs this many guess-slots
export const HINT_COST_MIN = 2; // a leaf-adjacent branch hint costs this — nothing is free
export const LEAF_HINT_COST = 1; // the clue (leaf hint) costs a single move

// Total guess-slots consumed by a set of rows (guesses=1 each, hints/clue carry their own cost).
function movesUsedOf(guesses: GuessResult[]): number {
  return guesses.reduce((sum, g) => sum + (g.cost ?? 1), 0);
}

// Total guess-slots consumed so far.
export function movesUsed(state: GameState): number {
  return movesUsedOf(state.guesses);
}

// A game that's been started but not finished — drives the "in progress" nav label (#3).
export function hasProgress(state: GameState): boolean {
  return state.guesses.length > 0 && state.status === "playing";
}

// Recompute every guess's warmth from the current provider + tree. Used on load so restored
// games reflect the current warmth model (fractions are otherwise frozen at guess time). Keys
// off each row's sharedNodeId, so guess identity and status are untouched.
export function refreshWarmth(
  state: GameState,
  store: TreeStore,
  warmth: WarmthProvider,
): GameState {
  if (state.guesses.length === 0) return state;
  const guesses = state.guesses.map((g) => {
    const node = store.getNode(g.sharedNodeId);
    return node ? { ...g, warmth: warmth.warmth(node) } : g;
  });
  return { ...state, guesses };
}

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
  if (state.guesses.some((g) => g.kind === "guess" && g.guessId === guessId)) return state;

  const sharedNodeId = store.mrca(guessId, state.target);
  const sharedNode = store.getNode(sharedNodeId)!;
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
}

// Give-up: end the round as a loss so the answer is revealed. Used by Practice (unbounded, so
// there's no "out of guesses" loss to reach otherwise); a no-op once the round is over.
export function applyForfeit(state: GameState): GameState {
  if (state.status !== "playing") return state;
  return { ...state, status: "lost" };
}

export function newRoundState(
  store: TreeStore,
  rng: () => number = Math.random,
  targetId?: string,
): GameState {
  const pool = store.playableGenera();
  const target =
    targetId && store.isPlayable(targetId)
      ? targetId
      : pool[Math.floor(rng() * pool.length)].id;
  return { target, guesses: [], status: "playing", mode: "practice", maxGuesses: null, hintsUsed: 0 };
}

export function newDailyState(target: string, maxGuesses = DAILY_MAX_GUESSES): GameState {
  return { target, guesses: [], status: "playing", mode: "daily", maxGuesses, hintsUsed: 0 };
}

export function warmestSharedNodeId(state: GameState, store: TreeStore): string | null {
  const rows = state.guesses.filter((g) => g.kind !== "leafHint");
  if (rows.length === 0) return null;
  let bestId = rows[0].sharedNodeId;
  let bestCount = store.getNode(bestId)!.descendantGenusCount;
  for (const g of rows) {
    const count = store.getNode(g.sharedNodeId)!.descendantGenusCount;
    if (count < bestCount) {
      bestCount = count;
      bestId = g.sharedNodeId;
    }
  }
  return bestId;
}

// True once warmth has bottomed out at (or, via hints, below) the target's terminal clade —
// the state in which the available hint is a leaf-hint (which surfaces the paleo-data) rather
// than a branch walk. Count-based, so a monotypic node below the terminal clade still counts.
export function leafHintActive(state: GameState, store: TreeStore): boolean {
  if (state.status !== "playing") return false;
  const warmestId = warmestSharedNodeId(state, store);
  if (warmestId === null) return false;
  const terminalId = terminalClade(store.data, state.target);
  const warmestCount = store.getNode(warmestId)!.descendantGenusCount;
  const terminalCount = store.getNode(terminalId)!.descendantGenusCount;
  return warmestCount <= terminalCount;
}

export type SpecimenState =
  | { kind: "empty" }
  | { kind: "broad" }
  | { kind: "terminal" }
  | { kind: "solved"; outcome: "won" | "lost"; targetId: string; guessCount: number };

// The specimen's progression (spec §5): broad -> terminal (+clue) -> solved.
export function specimenState(state: GameState, store: TreeStore): SpecimenState {
  if (state.status !== "playing") {
    const guessCount = state.guesses.filter((g) => g.kind === "guess").length;
    return {
      kind: "solved",
      outcome: state.status,
      targetId: state.target,
      guessCount,
    };
  }
  const warmestId = warmestSharedNodeId(state, store);
  if (warmestId === null) return { kind: "empty" };
  if (leafHintActive(state, store)) {
    return { kind: "terminal" };
  }
  return { kind: "broad" };
}

export function revealedNodeIds(state: GameState, store: TreeStore): Set<string> {
  const ids = new Set<string>();
  for (const g of state.guesses) {
    if (g.kind === "leafHint") continue; // leaf hint reveals no tree node
    for (const id of store.pathToRoot(g.guessId)) ids.add(id);
  }
  // Once the round is over, the answer belongs on the tree: on a win it's already in via the
  // winning guess; on a loss the target was never guessed, so add its lineage explicitly.
  // Guarded on the ended state so a mid-play hint/clue never spoils the target.
  if (state.status !== "playing") {
    for (const id of store.pathToRoot(state.target)) ids.add(id);
  }
  return ids;
}

// The run of lineage nodes from just below the deepest revealed node down to (and INCLUDING)
// the next node whose descendantGenusCount is strictly less than the deepest revealed node's —
// the next genuine narrowing. Usually one node; through a monotypic run it's [..intermediates,
// branchPoint]. Empty when nothing narrows below the deepest revealed node. When the caller has
// verified !leafHintActive, the final node is always a clade (the terminal clade or above),
// never the target genus.
export function nextHintRun(state: GameState, store: TreeStore): string[] {
  const rootToTarget = store.pathToRoot(state.target).slice().reverse();
  const revealed = revealedNodeIds(state, store);
  let deepest = -1;
  for (let i = 0; i < rootToTarget.length; i++) {
    if (revealed.has(rootToTarget[i])) deepest = i;
  }
  if (deepest === -1 || deepest + 1 >= rootToTarget.length) return [];
  const deepestCount = store.getNode(rootToTarget[deepest])!.descendantGenusCount;
  const run: string[] = [];
  for (let i = deepest + 1; i < rootToTarget.length; i++) {
    const id = rootToTarget[i];
    run.push(id);
    if (store.getNode(id)!.descendantGenusCount < deepestCount) break; // strict narrowing → done
  }
  return run;
}

// Cost of the NEXT hint/clue press. At the leaf-terminal state the press yields the clue at
// LEAF_HINT_COST (a single move). Otherwise it walks a run down to the next narrowing branch point; cost scales
// by how far along the target's root->leaf lineage that branch point sits (shallow=MAX,
// leaf-adjacent=MIN).
export function hintCost(state: GameState, store: TreeStore): number {
  if (leafHintActive(state, store)) return LEAF_HINT_COST;
  const run = nextHintRun(state, store);
  if (run.length === 0) return HINT_COST_MIN;
  const nodeId = run[run.length - 1];
  const lineage = store.pathToRoot(state.target).slice().reverse(); // root..target
  const idx = lineage.indexOf(nodeId);
  const denom = lineage.length - 1;
  const frac = denom > 0 ? idx / denom : 1;
  const raw = Math.ceil(HINT_COST_MAX - (HINT_COST_MAX - HINT_COST_MIN) * frac);
  return Math.max(HINT_COST_MIN, Math.min(HINT_COST_MAX, raw));
}

export function applyHint(
  state: GameState,
  store: TreeStore,
  warmth: WarmthProvider,
): GameState {
  if (state.status !== "playing") return state;
  if (!state.guesses.some((g) => g.kind === "guess")) return state; // need a real guess first

  const cost = hintCost(state, store);

  // Leaf-terminal: record a leaf hint that reveals the clue (no tree node) rather than spoil the answer.
  if (leafHintActive(state, store)) {
    if (state.guesses.some((g) => g.kind === "leafHint")) return state; // leaf hint already taken
    const result: GuessResult = {
      guessId: state.target, // referenced for clueFor(); NOT revealed on the tree
      sharedNodeId: state.target,
      warmth: warmth.warmth(store.getNode(state.target)!),
      kind: "leafHint",
      cost,
    };
    const guesses = [...state.guesses, result];
    const status: GameStatus =
      state.maxGuesses !== null && movesUsedOf(guesses) >= state.maxGuesses ? "lost" : state.status;
    return { ...state, guesses, hintsUsed: state.hintsUsed + 1, status };
  }

  // Otherwise walk a run down the target lineage to the next narrowing branch point (skipping
  // monotypic no-op nodes); the branch point is the recorded row, the run reveals for free.
  const run = nextHintRun(state, store);
  if (run.length === 0) return state;
  const nodeId = run[run.length - 1]; // branch point; pathToRoot(nodeId) reveals the whole run
  const node = store.getNode(nodeId)!;
  const result: GuessResult = {
    guessId: nodeId,
    sharedNodeId: nodeId,
    warmth: warmth.warmth(node),
    kind: "branchHint",
    cost,
  };
  const guesses = [...state.guesses, result];
  const status: GameStatus =
    state.maxGuesses !== null && movesUsedOf(guesses) >= state.maxGuesses ? "lost" : state.status;
  return { ...state, guesses, hintsUsed: state.hintsUsed + 1, status };
}
