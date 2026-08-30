import type { GameState } from "./types";
import { treeStore } from "./treeData";
import { warmthForTarget, type WarmthProvider } from "./warmth";
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
import dailyCalendar from "../../data/daily-calendar.json";
import { serializeGame, deserializeGame, dailyKey, legacyDailyKey, staleDailyKeys } from "./persistence";
import { statsStore } from "./statsStore.svelte";
import { tierSetting } from "./tierStore.svelte";
import { TIERS, type Tier } from "../tree/tiers";
import { tierStores } from "./treeData";

// Drop persisted state from earlier days so keys don't accumulate.
function pruneStale(today: string): void {
  if (typeof localStorage === "undefined") return;
  for (const key of staleDailyKeys(Object.keys(localStorage), today)) {
    localStorage.removeItem(key);
  }
}

function loadOrCreate(date: string, tier: Tier): GameState {
  const store = tierStores[tier];
  if (typeof localStorage !== "undefined") {
    // Medium falls back to the pre-tier key, so an in-progress game survives the upgrade.
    const raw =
      localStorage.getItem(dailyKey(tier, date)) ??
      (tier === "medium" ? localStorage.getItem(legacyDailyKey(date)) : null);
    const restored = raw ? deserializeGame(raw, "daily") : null;
    // Recompute stored warmth so restored games reflect the current warmth model — and, now, the
    // tier's lens.
    if (restored) return refreshWarmth(restored, store, warmthForTarget(store, restored.target));
  }
  // Each tier draws from its own pool, so each already gets its own answer of the day.
  const pool = store.playableGenera().map((n) => ({ id: n.id }));
  return newDailyState(dailyAnswer(date, pool, dailyCalendar as Record<string, string>));
}

function createDaily() {
  const date = todayString();
  pruneStale(date);
  // One game per tier, built eagerly. Switching difficulty then reads a different slot rather
  // than reloading, so neither game is ever lost.
  const games = $state<Record<Tier, GameState>>(
    Object.fromEntries(TIERS.map((t) => [t, loadOrCreate(date, t)])) as Record<Tier, GameState>,
  );
  const tier = $derived(tierSetting.tier);
  const treeStore = $derived(tierSetting.store);
  const state = $derived(games[tier]);
  const warmth = $derived<WarmthProvider>(warmthForTarget(treeStore, state.target));

  function save() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(dailyKey(tier, date), serializeGame(games[tier]));
    }
  }

  return {
    date,
    get state(): GameState {
      return state;
    },
    /** The lens this game is played against — GameBoard renders from it. */
    get tree() {
      return treeStore;
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
      const was = state.status;
      games[tier] = applyGuess(state, id, treeStore, warmth);
      save();
      if (was === "playing" && games[tier].status !== "playing") {
        // Stats are still global across tiers; per-tier streaks are slice 4.
        statsStore.record({ mode: "daily", won: games[tier].status === "won", moves: movesUsed(games[tier]) });
      }
    },
    hint() {
      games[tier] = applyHint(state, treeStore, warmth);
      save();
    },
  };
}

export const daily = createDaily();
