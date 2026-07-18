<script lang="ts">
  // Component gallery — static "testing views" driven by the REAL components + selectors.
  // Open /gallery.html. Every state is always on-screen; iterate visuals without playing.
  import SpecimenPlacard from "../lib/game/components/SpecimenPlacard.svelte";
  import { specimenView } from "../lib/game/specimen-view";
  import { treeStore } from "../lib/game/treeData";
  import SpineTree from "../lib/game/components/SpineTree.svelte";
  import WarmestTrail from "../lib/game/components/WarmestTrail.svelte";
  import GuessList from "../lib/game/components/GuessList.svelte";
  import GameBoard from "../lib/game/components/GameBoard.svelte";
  import { warmthRampColor } from "../lib/game/warmth-ramp";
  import {
    fixtureStore,
    stateEmpty,
    stateBroad,
    stateTerminal,
    stateDeep,
    stateSolvedWon,
    stateSolvedLost,
  } from "./fixtures";
  import type { GameState } from "../lib/game/types";

  const specimenStates: Array<{ key: string; label: string; state: GameState }> = [
    { key: "empty", label: "empty", state: stateEmpty },
    { key: "broad", label: "broad", state: stateBroad },
    { key: "terminal", label: "terminal + clue", state: stateTerminal },
    { key: "solvedWon", label: "solved — won", state: stateSolvedWon },
    { key: "solvedLost", label: "solved — lost", state: stateSolvedLost },
  ];

  const treeStates: Array<{ label: string; state: GameState }> = [
    { label: "broad (2 guesses)", state: stateBroad },
    { label: "terminal", state: stateTerminal },
    { label: "deep — multi-depth off-spine branches", state: stateDeep },
    { label: "solved", state: stateSolvedWon },
  ];

  const boardStates = specimenStates;

  // token swatches
  const groundTokens = ["--bg-page", "--bg-surface", "--bg-sunk", "--hairline"];
  const inkTokens = ["--ink", "--ink-soft", "--ink-mute"];
  const placardTokens = ["--placard", "--placard-dp", "--placard-edge", "--cream", "--cream-dim"];
  const accentTokens = ["--turq", "--turq-dp", "--mahogany", "--mahogany-hi", "--sand-200", "--sand-400"];
  // Sample the REAL ramp at 11 stops (0%..100%, 10% each) so the gallery shows exactly what
  // the guess bars / specimen chip render, not the raw tokens.
  const warmthSamples = Array.from({ length: 11 }, (_, i) => {
    const f = i / 10;
    return { f, color: warmthRampColor(f) };
  });
  const typeTokens = [
    ["--type-display", "Display 2rem"],
    ["--type-h", "Heading 1.25rem"],
    ["--type-body", "Body 1.05rem"],
    ["--type-label", "Label 0.92rem"],
    ["--type-meta", "Meta 0.78rem"],
    ["--type-eyebrow", "Eyebrow 0.72rem"],
  ];
</script>

<div class="gallery">
  <header class="g-head">
    <h1>Mesozooa — Component Gallery</h1>
    <p>Static testing views, driven by the real components &amp; engine selectors. Not the app; open <code>/index.html</code> to play.</p>
  </header>

  <!-- TOKENS -->
  <section>
    <h2>Design tokens</h2>
    <div class="swatch-row">
      {#each [["Ground", groundTokens], ["Ink", inkTokens], ["Placard", placardTokens], ["Accent", accentTokens]] as [group, toks] (group)}
        <div class="swatch-group">
          <span class="eyebrow">{group}</span>
          {#each toks as t (t)}
            <div class="swatch"><span class="chip" style="background: var({t})"></span><code>{t}</code></div>
          {/each}
        </div>
      {/each}
    </div>
    <div class="swatch-group">
      <span class="eyebrow">Warmth ramp — ore → gem (sampled every 10%)</span>
      <div class="ramp">
        {#each warmthSamples as s (s.f)}
          <span class="ramp-cell" style="background: {s.color}" title={`${Math.round(s.f * 100)}%`}>
            <span class="ramp-pct">{Math.round(s.f * 100)}</span>
          </span>
        {/each}
      </div>
    </div>
    <div class="swatch-group">
      <span class="eyebrow">Type scale</span>
      {#each typeTokens as [t, desc] (t)}
        <div style="font-size: var({t})">{desc} — Tyrannosaurus 640</div>
      {/each}
    </div>
  </section>

  <!-- SPECIMEN -->
  <section>
    <h2>Specimen — all states</h2>
    <div class="panel-row">
      {#each specimenStates as s (s.key)}
        <div class="panel">
          <span class="panel-label">{s.label}</span>
          <div class="panel-body specimen-slot">
            <SpecimenPlacard view={specimenView(s.state, treeStore)}>
              {#snippet action()}
                {#if s.state.status !== "playing"}
                  <div class="actions">
                    <button type="button" class="btn-secondary" onclick={() => {}}>New round</button>
                  </div>
                {/if}
              {/snippet}
            </SpecimenPlacard>
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- TREE -->
  <section>
    <h2>Spine tree — states</h2>
    {#each treeStates as s (s.label)}
      <div class="panel wide">
        <span class="panel-label">{s.label}</span>
        <div class="panel-body">
          <SpineTree revealed={fixtureStore(s.state).revealed} tipId={fixtureStore(s.state).warmestId} showCounts={false} />
        </div>
      </div>
    {/each}
    {#each [{ label: "selection ring — frontier clade", state: stateBroad }, { label: "selection ring — terminal (descenders)", state: stateTerminal }] as s (s.label)}
      <div class="panel wide">
        <span class="panel-label">{s.label}</span>
        <div class="panel-body">
          <SpineTree
            revealed={fixtureStore(s.state).revealed}
            tipId={fixtureStore(s.state).warmestId}
            highlightId={fixtureStore(s.state).warmestId}
            showCounts={false}
          />
        </div>
      </div>
    {/each}
  </section>

  <!-- TRAIL + GUESSES -->
  <section>
    <h2>Trail &amp; guess history</h2>
    <div class="panel wide">
      <span class="panel-label">trail — deep lineage</span>
      <div class="panel-body">
        <WarmestTrail warmestId={fixtureStore(stateSolvedWon).warmestId} onpan={() => {}} />
      </div>
    </div>
    <div class="panel wide">
      <span class="panel-label">guess list — cold/warm/hot + hint</span>
      <div class="panel-body">
        <GuessList guesses={stateTerminal.guesses} onselect={() => {}} />
      </div>
    </div>
    <div class="panel wide">
      <span class="panel-label">guess list — lost (answer reveal row pinned on top)</span>
      <div class="panel-body">
        <GuessList guesses={stateSolvedLost.guesses} revealId={stateSolvedLost.target} onselect={() => {}} />
      </div>
    </div>
  </section>

  <!-- FULL BOARD (desktop) -->
  <section>
    <h2>Full board — desktop</h2>
    {#each boardStates as s (s.key)}
      <div class="panel wide">
        <span class="panel-label">{s.label}</span>
        <div class="panel-body">
          <GameBoard
            store={fixtureStore(s.state, { daily: s.key.startsWith("solved") ? false : false })}
            disabled={s.state.status !== "playing"}
            onexplore={() => {}}
            onnew={() => {}}
          />
        </div>
      </div>
    {/each}
  </section>

  <!-- FULL BOARD (narrow via iframe) -->
  <section>
    <h2>Full board — narrow (420px)</h2>
    <div class="frame-row">
      {#each boardStates as s (s.key)}
        <div class="frame-wrap">
          <span class="panel-label">{s.label}</span>
          <iframe title={"narrow-" + s.key} src={"/gallery.html?frame=" + s.key} width="420" height="760"></iframe>
        </div>
      {/each}
    </div>
  </section>
</div>

<style>
  .gallery { max-width: none; padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-7); }
  .g-head h1 { font-family: var(--font-head); font-size: var(--type-display); font-weight: var(--fw-bold); letter-spacing: .03em; }
  .g-head p { color: var(--ink-soft); font-size: var(--type-label); }
  .g-head code { background: var(--bg-sunk); padding: 0 .3em; border-radius: 4px; }
  section { display: flex; flex-direction: column; gap: var(--space-4); }
  section > h2 { font-size: var(--type-h); font-weight: var(--fw-bold); border-bottom: 1px solid var(--hairline); padding-bottom: var(--space-2); }

  .panel-row { display: flex; flex-wrap: wrap; gap: var(--space-5); align-items: flex-start; }
  .panel { border: 1px dashed var(--hairline); border-radius: var(--radius-card); background: var(--bg-page); }
  .panel.wide { width: 100%; }
  .panel-label { display: block; font-size: var(--type-meta); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: .1em; color: var(--ink-mute); padding: var(--space-2) var(--space-3); border-bottom: 1px dashed var(--hairline); }
  .panel-body { padding: var(--space-4); overflow: auto; }
  .specimen-slot { width: 20rem; }

  .swatch-row { display: flex; flex-wrap: wrap; gap: var(--space-6); }
  .swatch-group { display: flex; flex-direction: column; gap: var(--space-2); }
  .swatch { display: flex; align-items: center; gap: var(--space-2); font-size: var(--type-meta); }
  .swatch .chip { width: 2rem; height: 1.2rem; border-radius: 4px; border: 1px solid var(--hairline); }
  .ramp { display: flex; }
  .ramp-cell {
    width: 3rem; height: 2.4rem; display: flex; align-items: flex-end; justify-content: center;
  }
  .ramp-pct { font-size: var(--type-eyebrow); font-weight: var(--fw-bold); color: var(--cream); opacity: .8; padding-bottom: 2px; }

  .frame-row { display: flex; flex-wrap: wrap; gap: var(--space-5); }
  .frame-wrap { display: flex; flex-direction: column; gap: var(--space-2); }
  .frame-wrap iframe { border: 1px solid var(--hairline); border-radius: var(--radius-card); background: var(--bg-page); }
</style>
