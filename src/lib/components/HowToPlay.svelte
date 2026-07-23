<script lang="ts">
  import Modal from "./Modal.svelte";
  import meta from "../../data/meta.json";
  let open = $state(false);
</script>

<button type="button" class="how-to-play-link btn-secondary btn-secondary-inverse btn-small" onclick={() => (open = true)} aria-label="How to play">
  <span class="label-full">How to play</span><span class="label-short" aria-hidden="true">?</span>
</button>

<Modal bind:open title="How to play">
  <div class="how-to-play-body">
    <p>Find today's dinosaur by its similarity to others.</p>
    <p>Guess any dinosaur, and you'll see the clade that it shares with the one you're hunting for. Try to find the target in the fewest moves!</p>
    <p>You can spend moves on hints to move down the tree. As you get closer, the color of the guess tells you how close the common clade is to the target.</p>
    <p>When you're almost at the end of the tree, a single move will tell you more details about the dino, to help you sort through the genera.</p>
    <p>If you're stuck, or just want to learn more, check out Explore mode to see the whole tree. Not every dinosaur in Explore mode is playable, but every playable dinosaur is in Explore.</p>
    <hr class="rule" />
    <h3 class="about-head">About</h3>
    <p>
      Inspired by <a href="https://metazooa.com" target="_blank" rel="noopener noreferrer">Metazooa</a>.
    </p>
    <p>
      Data from <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a> (CC0),
      the <a href="https://paleobiodb.org" target="_blank" rel="noopener noreferrer">Paleobiology Database</a>,
      and <a href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a>.
      Updated {meta.dataPulledAt}.
    </p>
  </div>
</Modal>

<style>
  .how-to-play-link {
    align-self: baseline;   /* share the tagline's baseline, not the header's center line */
  }
  .how-to-play-body {
    display: flex; flex-direction: column; gap: var(--space-3);
  }
  .rule { border: 0; border-top: 1px solid var(--hairline); width: 100%; margin: var(--space-2) 0 0; }
  .about-head {
    font-family: var(--font-head); font-size: var(--type-heading);
    font-weight: var(--fw-bold); margin: 0;
  }
  .label-short { display: none; }
  /* The two-row phone header gives row 1 enough width for the real label, so the "?" fallback is
     not needed. Kept in the markup (hidden) in case the row tightens again. */
</style>
