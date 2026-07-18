import type { GameState } from "./types";
import { treeStore } from "./treeData";
import { createCountWarmth } from "./warmth";
import {
  applyGuess,
  applyHint,
  applyForfeit,
  newRoundState,
  warmestSharedNodeId,
  revealedNodeIds,
  nextHintRun,
  hintCost,
  movesUsed,
  leafHintActive,
} from "./engine-core";

const warmth = createCountWarmth(treeStore.rootCount);

export function createGame() {
  let state = $state<GameState>(newRoundState(treeStore));
  return {
    get state(): GameState {
      return state;
    },
    get warmestId(): string | null {
      return warmestSharedNodeId(state, treeStore);
    },
    get revealed(): Set<string> {
      return revealedNodeIds(state, treeStore);
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
      if (leafHintActive(state, treeStore)) return !state.guesses.some((g) => g.kind === "leafHint");
      return nextHintRun(state, treeStore).length > 0;
    },
    guess(id: string) {
      state = applyGuess(state, id, treeStore, warmth);
    },
    hint() {
      state = applyHint(state, treeStore, warmth);
    },
    forfeit() {
      state = applyForfeit(state);
    },
    newRound() {
      state = newRoundState(treeStore);
    },
    startWith(targetId: string) {
      state = newRoundState(treeStore, Math.random, targetId);
    },
  };
}

export const game = createGame();
