import type { GameState } from "./types";
import { treeStore } from "./treeData";
import { createCountWarmth } from "./warmth";
import {
  applyGuess,
  applyHint,
  newDailyState,
  warmestSharedNodeId,
  revealedNodeIds,
  nextHintRun,
  refreshWarmth,
  hintCost,
  movesUsed,
  leafHintActive,
} from "./engine-core";
import { dailyAnswer, todayString } from "./daily";
import { serializeDaily, deserializeDaily, dailyKey, staleDailyKeys } from "./persistence";

const warmth = createCountWarmth(treeStore.rootCount);

// Drop persisted state from earlier days so keys don't accumulate.
function pruneStale(today: string): void {
  if (typeof localStorage === "undefined") return;
  for (const key of staleDailyKeys(Object.keys(localStorage), today)) {
    localStorage.removeItem(key);
  }
}

function loadOrCreate(date: string): GameState {
  if (typeof localStorage !== "undefined") {
    const raw = localStorage.getItem(dailyKey(date));
    const restored = raw ? deserializeDaily(raw) : null;
    // Recompute stored warmth so restored games reflect the current warmth model.
    if (restored) return refreshWarmth(restored, treeStore, warmth);
  }
  const pool = treeStore.playableGenera().map((n) => ({ id: n.id }));
  return newDailyState(dailyAnswer(date, pool));
}

function createDaily() {
  const date = todayString();
  pruneStale(date);
  let state = $state<GameState>(loadOrCreate(date));

  function save() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(dailyKey(date), serializeDaily(state));
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
      if (this.movesRemaining <= this.nextHintCost) return false; // need a move left to guess after the hint
      // clue available (leaf-terminal, not yet taken) OR a branch remains to walk
      if (leafHintActive(state, treeStore)) return !state.guesses.some((g) => g.kind === "leafHint");
      return nextHintRun(state, treeStore).length > 0;
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
