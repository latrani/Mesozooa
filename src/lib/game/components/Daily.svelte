<script lang="ts">
  import { daily } from "../dailyStore.svelte";
  import { nav } from "../../nav.svelte";
  import GameBoard from "./GameBoard.svelte";
</script>

<main class="daily">
  <GameBoard
    store={daily}
    disabled={daily.state.status !== "playing"}
    onexplore={(id) => nav.exploreAround(id)}
  />
</main>

<style>
  .daily { padding-top: var(--space-2); }
  @media (min-width: 641px) {
    /* fill the viewport slot from base.css so GameBoard can peg its own bottom region */
    .daily { padding-top: 0; display: flex; flex-direction: column; min-height: 0; }
  }
</style>
