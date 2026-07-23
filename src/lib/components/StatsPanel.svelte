<script lang="ts">
  import Modal from "./Modal.svelte";
  import StatsContent from "./StatsContent.svelte";
  import { statsModal } from "./statsModal.svelte";
</script>

<button type="button" class="stats-link btn-secondary btn-small" onclick={() => (statsModal.open = true)}>Stats</button>

<Modal bind:open={statsModal.open} title="Your stats">
  <StatsContent />
</Modal>

<style>
  .stats-link {
    --btn-secondary-ink: var(--cream);
    align-self: baseline; /* share the tagline baseline, matching HowToPlay */
  }
  .stats-link:hover { color: var(--cream); }
</style>
