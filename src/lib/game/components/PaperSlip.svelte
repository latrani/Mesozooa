<script lang="ts">
  // A little curator's slip laid on the specimen mount — a handwritten note on lighter paper,
  // faintly shadowed and tilted. Absolutely positioned; the host mount must be position:relative.
  let { text, tilt = -4 }: { text: string; tilt?: number } = $props();
</script>

<span class="paper-slip" style="--slip-tilt: {tilt}deg">{text}</span>

<style>
  .paper-slip {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(var(--slip-tilt));
    padding: 0.7rem 1.4rem;
    background: #faf6fc; /* lighter than the tan mount, so it reads as a slip laid on top */
    color: #6a5947; /* pen-ink brown */
    font-family: var(--font-hand);
    font-size: var(--type-title);
    line-height: 1.1;
    white-space: nowrap;
    border-radius: 2px;
    box-shadow: 0 2px 5px rgba(70, 40, 22, 0.22); /* faint lift off the mount */
    pointer-events: none;
  }
</style>
