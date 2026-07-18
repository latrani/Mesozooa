<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SpecimenView } from "../specimen-view";
  import PaperSlip from "./PaperSlip.svelte";

  let { view, action }: { view: SpecimenView; action?: Snippet } = $props();
</script>

<aside class="specimen-placard" aria-label="Specimen">
  <h2 class="title">{view.title ?? "? ? ?"}</h2>

  <figure class="figure">
    <div class="shadowbox" class:empty={view.mount.kind !== "photo"}>
      {#if view.mount.kind === "photo"}
        <img class="photo" src={view.mount.url} alt={view.mount.alt} />
      {:else}
        <PaperSlip text={view.mount.text} tilt={view.mount.tilt} />
      {/if}
    </div>
    {#if view.mount.kind === "photo" && view.mount.credit}
      {@const credit = view.mount.credit}
      <figcaption class="credit">
        <span class="credit-author" title={credit.author ?? "Wikimedia Commons"}>{credit.author ?? "Wikimedia Commons"}</span>{#if credit.licenseShort}<span class="credit-license"> · {#if credit.licenseUrl}<a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.licenseShort}</a>{:else}{credit.licenseShort}{/if}</span>{/if}
      </figcaption>
    {/if}
  </figure>

  {#if view.fields.length}
    <dl class="fields">
      {#each view.fields as f (f.label)}
        <div class="field">
          <dt>{f.label}</dt>
          <dd>{f.value ?? "? ? ?"}{#if f.detail}<span class="detail">{f.detail}</span>{/if}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  {#if view.note}<p class="note">{view.note}</p>{/if}

  {#if view.link}
    <a class="wiki" href={view.link.href} target="_blank" rel="noopener noreferrer">{view.link.label}</a>
  {/if}

  {@render action?.()}
</aside>

<style>
  .specimen-placard {
    display: flex; flex-direction: column; gap: var(--space-3);
    flex: 0 0 20rem; width: 20rem;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border: 1px solid var(--specimen-edge); border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    padding: var(--space-5); color: var(--specimen-text);
    --btn-secondary-ink: var(--cream);
  }
  .title { font-size: var(--type-h); font-weight: var(--fw-bold); }
  .figure { margin: 0; display: flex; flex-direction: column; gap: 2px; }
  .shadowbox {
    border-radius: 5px; position: relative; overflow: hidden;
    background: radial-gradient(120% 120% at 50% 30%, #f3e6cf 0%, #e3cba6 100%);
    box-shadow: inset 0 3px 8px rgba(95,44,30,.45), inset 0 -2px 4px rgba(255,255,255,.4);
    border: 3px solid var(--specimen-edge);
  }
  .shadowbox.empty { height: 8.5rem; }
  .photo { display: block; width: 100%; height: auto; }
  .fields { margin: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .field { font-size: var(--type-body); color: var(--specimen-text); }
  .field dt { display: inline; font-weight: var(--fw-bold); }
  .field dt::after { content: ": "; }
  .field dd { display: inline; margin: 0; }
  .field .detail { display: block; opacity: .72; font-size: var(--type-label); }
  .note { color: var(--specimen-text-dim); font-size: var(--type-body); }
  .wiki { font-weight: var(--fw-semibold); font-size: var(--type-label); align-self: flex-start; color: var(--sand-200); }
  /* image credit — small, understated provenance; hugs the photo via the figure's 2px gap. */
  .credit { margin: 0; font-size: var(--type-meta); opacity: .55; display: flex; max-width: 100%; }
  .credit-author { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .credit-license { white-space: nowrap; flex: none; }
  .credit a { color: inherit; text-decoration: underline; }
  :global(.specimen-placard .actions) { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-1); }

  @media (max-width: 640px) {
    /* compact horizontal placard: fixed shadow-box left, everything else stacked right. */
    .specimen-placard {
      width: 100%; display: grid; grid-template-columns: auto 1fr;
      gap: 0 var(--space-3); align-items: center; padding: .6rem .7rem;
    }
    .figure { grid-column: 1; grid-row: 1 / span 4; align-self: center; margin: 0; }
    .shadowbox { width: 84px; height: 64px; }
    .specimen-placard > :not(.figure) { grid-column: 2; align-self: center; }
    :global(.specimen-placard .actions) { grid-column: 1 / -1; }
  }
</style>
