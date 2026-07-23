<script lang="ts">
  import { practice } from "../practiceStore.svelte";
  import { nav } from "../../nav.svelte";
  import GameBoard from "./GameBoard.svelte";
</script>

<main class="practice">
  <GameBoard
    store={practice}
    disabled={practice.state.status !== "playing"}
    onexplore={(id) => nav.exploreAround(id)}
    onnew={() => practice.newRound()}
  />
</main>

<style>
  .practice { padding-top: 0; }
  @media (min-width: 641px) {
    .practice { display: flex; flex-direction: column; min-height: 0; }
  }
</style>
