import type { GameState } from "./types";
import { treeStore } from "./treeData";
import { warmthForTarget, type WarmthProvider } from "./warmth";
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

export function createGame() {
  let state = $state<GameState>(newRoundState(treeStore));
  const warmth = $derived<WarmthProvider>(warmthForTarget(treeStore.data, state.target));
  return {
    get state(): GameState {
      return state;
    },
    get warmthProvider(): WarmthProvider {
      return warmth;
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
