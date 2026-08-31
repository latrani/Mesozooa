<script lang="ts">
  import { statsStore, type StatsView } from "../game/statsStore.svelte";
  import { tierSetting } from "../game/tierStore.svelte";
  import { TIERS, TIER_LABEL, type Tier } from "../tree/tiers";

  // Defaults to the live singleton (the app never passes a source). The gallery passes a frozen
  // fixture view so multiple stats states render side by side on one page.
  let { source }: { source?: StatsView } = $props();

  // Tabs open on the tier you are playing. A fixture `source` pins the panel to that one view
  // (the gallery renders a specific state), so the tabs only appear for the live store.
  let shown = $state<Tier>(tierSetting.tier);
  let live = $derived(source === undefined);
  let view = $derived<StatsView>(source ?? statsStore.viewFor(shown));

  let confirming = $state(false);

  const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);
  const avg = (m: number | null) => (m === null ? "—" : m.toFixed(1));
  // Volume line as a single unit: "6 plays · 83% won" / "1 play · 100% won".
  const volume = (w: { played: number; ratio: number | null }) =>
    `${w.played} ${w.played === 1 ? "play" : "plays"} · ${pct(w.ratio)} won`;

  // Empty state, now PER TIER: an untouched Hard is no evidence about Easy.
  let empty = $derived(view.allTime.played === 0);
</script>

<div class="stats">
  {#if live}
    <div class="tier-tabs" role="tablist" aria-label="Difficulty">
      {#each TIERS as t (t)}
        <button
          type="button"
          role="tab"
          aria-selected={shown === t}
          class="tier-tab"
          class:active={shown === t}
          onclick={() => (shown = t)}>{TIER_LABEL[t]}</button
        >
      {/each}
    </div>
  {/if}
  {#if empty}
    <p class="stats-empty">Play the {live ? TIER_LABEL[shown] : ""} daily to start a streak.</p>
  {:else}
    <div class="streak">
      <span class="big">{view.streak.current}</span>
      <span class="streak-label">day streak</span>
      <span class="streak-best">Best: {view.streak.best}</span>
    </div>

    <dl class="table">
      <dt>Avg moves (daily)</dt><dd>{avg(view.dailyAvg)}</dd>
      <dt>Avg moves (overall)</dt><dd>{avg(view.overallAvg)}</dd>
      <dt>Avg explored</dt><dd>{avg(view.exploredAvg)}</dd>
      <div class="sep" role="separator"></div>
      <dt>Last 7 days</dt><dd>{volume(view.week)}</dd>
      <dt>Last 30 days</dt><dd>{volume(view.month)}</dd>
      <dt>All-time</dt><dd>{volume(view.allTime)}</dd>
    </dl>

    <div class="reset">
      {#if confirming}
        <span class="reset-warn">Erase stats for every difficulty? This can't be undone.</span>
        <button type="button" class="btn-secondary btn-small" onclick={() => (confirming = false)}>Cancel</button>
        <button type="button" class="btn-secondary btn-small" onclick={() => { view.reset(); confirming = false; }}>Erase</button>
      {:else}
        <button type="button" class="btn-secondary btn-small" onclick={() => (confirming = true)}>Reset stats</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .stats { display: flex; flex-direction: column; gap: var(--space-4); }
  .tier-tabs { display: flex; gap: var(--space-1); }
  /* nowrap: the tier names are two words ("Cenozoic Cub"), and a wrapped tab reads as two tabs.
     The dialog shrink-to-fits its content, so this is what widens the panel — up to Modal's own
     cap, which is where the phone (90vw) stops it. */
  .tier-tab {
    flex: 1 1 auto; white-space: nowrap; cursor: pointer;
    padding: var(--space-2) var(--space-3);
    font-family: inherit; font-size: var(--type-label); font-weight: var(--fw-bold);
    color: var(--ink-soft); background: none;
    border: none; border-bottom: 2px solid var(--placard-edge);
  }
  .tier-tab.active { color: var(--ink); border-bottom-color: var(--accent); }
  .streak { display: flex; align-items: baseline; gap: var(--space-2); }
  .streak .big { font-size: 2.5rem; font-weight: var(--fw-black); color: var(--ink); }
  .streak-label { font-size: var(--type-body); color: var(--ink); }
  /* --ink-soft (not --ink-mute): these run at body/meta size, and --ink-mute (3.5:1 on the modal
     surface) is large-text-only per tokens.css. --ink-soft is 6.5:1 — AA-normal — and still reads
     as secondary against the --ink values. */
  .streak-best { margin-left: auto; color: var(--ink-soft); }
  /* label -> value table: labels in a shrink-to-fit first column, values aligned in the second. */
  .table { display: grid; grid-template-columns: auto 1fr; gap: var(--space-2) var(--space-4); margin: 0; align-items: baseline; }
  .table dt { color: var(--ink-soft); font-size: var(--type-body); white-space: nowrap; }
  .table dd { margin: 0; color: var(--ink); white-space: nowrap; }
  /* full-width rule between the averages block and the time-window block */
  .table .sep { grid-column: 1 / -1; height: 1px; background: var(--hairline); margin: var(--space-1) 0; }
  .reset { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
  .reset-warn { color: var(--ink); font-size: var(--type-meta); }
  .stats-empty { color: var(--ink-soft); }
</style>
