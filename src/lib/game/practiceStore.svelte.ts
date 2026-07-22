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
import { serializeGame, deserializeGame, PRACTICE_KEY } from "./persistence";
import { statsStore } from "./statsStore.svelte";

// Practice is a single slot: the current round survives reloads (and silent post-deploy
// reloads) exactly like Daily. Solved/forfeited end-state persists; newRound overwrites it.
function loadOrCreate(): GameState {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(PRACTICE_KEY);
    const restored = raw ? deserializeGame(raw, "practice") : null;
    if (restored) return restored;
  }
  return newRoundState(treeStore);
}

export function createPractice() {
  let state = $state<GameState>(loadOrCreate());
  const warmth = $derived<WarmthProvider>(warmthForTarget(treeStore.data, state.target));

  function save() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PRACTICE_KEY, serializeGame(state));
    }
  }

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
    newRound() {
      state = newRoundState(treeStore);
      save();
    },
    startWith(targetId: string) {
      state = newRoundState(treeStore, Math.random, targetId);
      save();
    },
  };
}

export const practice = createPractice();
