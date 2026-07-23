<script lang="ts">
  import Modal from "./Modal.svelte";
  import StatsContent from "./StatsContent.svelte";
  import { statsModal } from "./statsModal.svelte";
</script>

<button type="button" class="stats-link btn-secondary btn-secondary-inverse btn-small" onclick={() => (statsModal.open = true)}>Stats</button>

<Modal bind:open={statsModal.open} title="Your stats">
  <StatsContent />
</Modal>

<style>
  .stats-link {
    align-self: center;
  }
</style>
