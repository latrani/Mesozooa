<script lang="ts">
  import type { SpecimenView } from "../specimen-view";
  import PaperSlip from "./PaperSlip.svelte";

  // Pure display of a SpecimenView — identical in Daily, Practice and Explore. End-state actions
  // (Share/Stats/New round) live beside the result banner instead (#63).
  let { view, peek = false }: { view: SpecimenView; peek?: boolean } = $props();
</script>

{#if peek}
  <!-- The sheet's title bar: the placard's own title leads, with its note as quiet trailing
       context. Deliberately one flat flex line of text — the old narrow layout was a grid
       vertically centering rows of mismatched height, which is what caused the #22 jitter, and a
       row that holds only text cannot reproduce it. -->
  <span class="peek-row">
    <span class="peek-title">{view.title ?? "? ? ?"}</span>
    {#if view.note}<span class="peek-note">{view.note}</span>{/if}
  </span>
{:else}
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
            <dd class:placeholder={f.value == null}>{f.value ?? "? ? ?"}{#if f.detail}<span class="detail">{f.detail}</span>{/if}</dd>
          </div>
        {/each}
      </dl>
    {/if}

    {#if view.note}<p class="note">{view.note}</p>{/if}

    {#if view.link}
      <a class="wiki" href={view.link.href} target="_blank" rel="noopener noreferrer">{view.link.label}</a>
    {/if}
  </aside>
{/if}

<style>
  .specimen-placard {
    display: flex; flex-direction: column; gap: var(--space-3);
    flex: 0 0 20rem; width: 20rem;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border: 1px solid var(--specimen-edge); border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    padding: var(--space-3) var(--space-4); color: var(--specimen-text);
  }
  .title { font-size: var(--type-title); font-weight: var(--fw-bold); font-family: var(--font-head); }
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
  /* placeholder clue rows during play — quieter + smaller so the un-identified plaque reads calm
     (the museum "coming soon" conceit), without shrinking the identified/solved rows. */
  .field dd.placeholder { opacity: .5; font-size: var(--type-label); font-weight: var(--fw-medium); }
  .field .detail { display: block; opacity: .72; font-size: var(--type-label); }
  /* De-emphasized: honest reference context (genera count), not a primary signal — smaller so it
     reads as minor caption beneath the title. See two-phase warmth work / #41. */
  .note { color: var(--specimen-text-dim); font-size: var(--type-label); }
  .wiki { font-weight: var(--fw-semibold); font-size: var(--type-label); align-self: flex-start; color: var(--sand-200); }
  /* image credit — small, understated provenance; hugs the photo via the figure's 2px gap. */
  .credit { margin: 0; font-size: var(--type-meta); opacity: .55; display: flex; max-width: 100%; }
  .credit-author { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .credit-license { white-space: nowrap; flex: none; }
  .credit a { color: inherit; text-decoration: underline; }

  /* PEEK — the sheet's always-visible row. Fixed-height thumbnail + a text column; no grid,
     no vertical centering of mismatched rows, so there is nothing for the old #22 jitter to
     act on. */
  .peek-row { display: flex; align-items: baseline; gap: var(--space-3); min-width: 0; }
  .peek-title {
    font-family: var(--font-head); font-size: var(--type-heading); font-weight: var(--fw-bold);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .peek-note {
    font-size: var(--type-label); color: var(--specimen-text-dim);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* Inside the sheet the card is already on the specimen ground and full-bleed, so it drops its
     own frame, fixed width and shadow. */
  @media (max-width: 640px) {
    /* the sheet's peek row is the title bar, so the card must not repeat the title below it */
    .title { display: none; }
    .specimen-placard {
      width: 100%; flex: 1 1 auto;
      background: none; border: 0; box-shadow: none; padding: 0;
    }
  }
</style>
