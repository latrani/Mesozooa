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
  /* The board expects a locked, full-height shell (base.css does this for #app in the real app).
     The gallery mounts into #gallery, so the frame supplies the same contract itself. */
  .frame-main {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
</style>
