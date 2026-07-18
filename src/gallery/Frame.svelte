<script lang="ts">
  // Single full-board state, rendered at the document width (the iframe controls width,
  // so media queries fire correctly). Used by Gallery's responsive frames.
  import GameBoard from "../lib/game/components/GameBoard.svelte";
  import {
    fixtureStore,
    stateEmpty,
    stateBroad,
    stateTerminal,
    stateSolvedWon,
    stateSolvedLost,
  } from "./fixtures";
  import type { GameState } from "../lib/game/types";

  let { stateKey, mode }: { stateKey: string; mode: string } = $props();

  const states: Record<string, GameState> = {
    empty: stateEmpty,
    broad: stateBroad,
    terminal: stateTerminal,
    solvedWon: stateSolvedWon,
    solvedLost: stateSolvedLost,
  };
  let state = $derived(states[stateKey] ?? stateEmpty);
  let daily = $derived(mode === "daily");
  let store = $derived(fixtureStore(state, { daily }));
  let disabled = $derived(state.status !== "playing");
</script>

<main class="frame-main">
  <GameBoard {store} {disabled} onexplore={() => {}} onnew={daily ? undefined : () => {}} />
</main>

<style>
  .frame-main {
    padding: var(--space-2) 0;
  }
</style>
