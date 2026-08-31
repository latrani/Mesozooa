import type { GameState } from "./types";
import { treeStore } from "./treeData";
import { warmthForTarget, type WarmthProvider } from "./warmth";
import {
  applyGuess,
  applyExploreView,
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
import { serializeGame, deserializeGame, practiceKey, LEGACY_PRACTICE_KEY } from "./persistence";
import { statsStore } from "./statsStore.svelte";
import { tierSetting } from "./tierStore.svelte";
import { TIERS, type Tier } from "../tree/tiers";
import { tierStores } from "./treeData";

// Practice is a single slot: the current round survives reloads (and silent post-deploy
// reloads) exactly like Daily. Solved/forfeited end-state persists; newRound overwrites it.
function loadOrCreate(tier: Tier): GameState {
  if (typeof localStorage !== "undefined") {
    // Medium falls back to the pre-tier key so an in-progress round survives the upgrade.
    const raw =
      localStorage.getItem(practiceKey(tier)) ??
      (tier === "medium" ? localStorage.getItem(LEGACY_PRACTICE_KEY) : null);
    const restored = raw ? deserializeGame(raw, "practice") : null;
    if (restored) return restored;
  }
  return newRoundState(tierStores[tier]);
}

export function createPractice() {
  // One round per tier — switching difficulty parks the round you were on rather than ending it.
  const games = $state<Record<Tier, GameState>>(
    Object.fromEntries(TIERS.map((t) => [t, loadOrCreate(t)])) as Record<Tier, GameState>,
  );
  const tier = $derived(tierSetting.tier);
  const treeStore = $derived(tierSetting.store);
  const state = $derived(games[tier]);
  const warmth = $derived<WarmthProvider>(warmthForTarget(treeStore, state.target));

  function save() {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(practiceKey(tier), serializeGame(games[tier]));
    }
  }

  return {
    get state(): GameState {
      return state;
    },
    /** The lens this round is played against — GameBoard renders from it. */
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
      games[tier] = applyGuess(state, id, treeStore, warmth);
      save();
      if (was === "playing" && games[tier].status !== "playing" && !games[tier].seeded) {
        statsStore.record({
          mode: "practice",
          tier,
          won: games[tier].status === "won",
          moves: movesUsed(games[tier]),
          explored: games[tier].exploreViews?.length ?? 0,
        });
      }
    },
    hint() {
      games[tier] = applyHint(state, treeStore, warmth);
      save();
    },
    /** An Explore lookup made while this round is live (#72). No-ops once the round is over.
        Writes into the ACTIVE tier's slot, so a lookup counts toward the round you are playing
        and not the ones parked in the other tiers. */
    noteExploreView(nodeId: string) {
      const before = games[tier];
      games[tier] = applyExploreView(before, nodeId);
      if (games[tier] !== before) save();
    },
    forfeit() {
      const was = state.status;
      games[tier] = applyForfeit(state);
      save();
      if (was === "playing" && games[tier].status !== "playing" && !games[tier].seeded) {
        statsStore.record({
          mode: "practice",
          tier,
          won: false,
          moves: movesUsed(games[tier]),
          explored: games[tier].exploreViews?.length ?? 0,
        });
      }
    },
    newRound() {
      games[tier] = newRoundState(treeStore);
      save();
    },
    startWith(targetId: string) {
      games[tier] = newRoundState(treeStore, Math.random, targetId);
      save();
    },
  };
}

export const practice = createPractice();
