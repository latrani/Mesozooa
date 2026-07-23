<script lang="ts">
  // Component gallery — static "testing views" driven by the REAL components + selectors.
  // Open /gallery.html. Every state is always on-screen; iterate visuals without playing.
  import SpecimenPlacard from "../lib/game/components/SpecimenPlacard.svelte";
  import { specimenView } from "../lib/game/specimen-view";
  import { treeStore } from "../lib/game/treeData";
  import SpineTree from "../lib/game/components/SpineTree.svelte";
  import GuessList from "../lib/game/components/GuessList.svelte";
  import { warmthRampColor } from "../lib/game/warmth-ramp";
  import { warmthForTarget } from "../lib/game/warmth";
  import HowToPlay from "../lib/components/HowToPlay.svelte";
  import StatsContent from "../lib/components/StatsContent.svelte";
  import { buildShareText, buildShareParts } from "../lib/game/share";
  import {
    fixtureStore,
    stateEmpty,
    stateBroad,
    stateTerminal,
    stateDeep,
    stateSolvedWon,
    stateSolvedLost,
    statsEmpty,
    statsActive,
    statsBrokenStreak,
    STATS_NAMES,
  } from "./fixtures";
  import type { GameState } from "../lib/game/types";
  import type { StatsView } from "../lib/game/statsStore.svelte";

  const statsStates: Array<{ key: string; source: StatsView }> = [
    { key: "empty", source: statsEmpty },
    { key: "active", source: statsActive },
    { key: "brokenStreak", source: statsBrokenStreak },
  ];

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
    ["--type-display", "Display 2rem / 32px"],
    ["--type-title", "Title 1.4rem / 22.4px"],
    ["--type-heading", "Heading 1.2rem / 19.2px"],
    ["--type-body", "Body 1rem / 16px"],
    ["--type-label", "Label 0.9rem / 14.4px"],
    ["--type-meta", "Meta 0.8rem / 12.8px"],
  ];

  const sampleShareText = buildShareText(stateSolvedWon, "2026-07-18");
  const sampleShareParts = buildShareParts(stateSolvedWon, "2026-07-18");

  // Per-fixture-state provider for the standalone SpineTree panels below (GameBoard reads its
  // own store.warmthProvider; these panels drive SpineTree directly with a raw revealed/tipId).
  const galleryWarmth = (state: GameState) => warmthForTarget(treeStore.data, state.target);

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

  <!-- BUTTONS — the opaque surface+ink pairs; each role must stay legible without borrowing the
       ground behind it (#64). Hover each in-browser: the tint mixes into the OPAQUE surface. -->
  <section>
    <h2>Buttons</h2>
    <div class="panel-row">
      <div class="panel">
        <span class="panel-label">primary — on light</span>
        <div class="panel-body btn-slot">
          <button type="button" class="btn-primary">Copy and close</button>
          <button type="button" class="btn-primary" disabled>Disabled</button>
        </div>
      </div>
      <div class="panel">
        <span class="panel-label">secondary — on light</span>
        <div class="panel-body btn-slot">
          <button type="button" class="btn-secondary">Hint</button>
          <button type="button" class="btn-secondary" disabled>Disabled</button>
        </div>
      </div>
      <div class="panel">
        <span class="panel-label">secondary-inverse — on dark</span>
        <!-- placard ground = the real dark surface the header/sheet paint behind their buttons -->
        <div class="panel-body btn-slot dark">
          <button type="button" class="btn-secondary btn-secondary-inverse">How to play</button>
          <button type="button" class="btn-secondary btn-secondary-inverse" disabled>Disabled</button>
        </div>
      </div>
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
            <SpecimenPlacard view={specimenView(s.state, treeStore)} />
          </div>
        </div>
      {/each}
    </div>
  </section>

  <!-- STATS -->
  <section>
    <h2>Streak &amp; stats — all states</h2>
    <div class="panel-row">
      {#each statsStates as s (s.key)}
        <div class="panel">
          <span class="panel-label">{STATS_NAMES[s.key]}</span>
          <div class="panel-body stats-slot">
            <StatsContent source={s.source} />
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
          <SpineTree
            revealed={fixtureStore(s.state).revealed}
            tipId={fixtureStore(s.state).warmestId}
            showCounts={false}
            warmthProvider={galleryWarmth(s.state)}
          />
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
            warmthProvider={galleryWarmth(s.state)}
          />
        </div>
      </div>
    {/each}
  </section>

  <!-- GUESSES -->
  <section>
    <h2>Guess history</h2>
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

  <!-- FULL BOARD (desktop via iframe — like the phone frames below. The desktop placard is now a
       position:fixed layer (#65); an iframe gives each board its OWN viewport so the fixed placard
       is contained in its panel instead of escaping to the gallery window and stacking. The iframe
       width (>640px) fires the desktop layout; the short height exercises the scroll-when-tall. -->
  <section>
    <h2>Full board — desktop</h2>
    <div class="frame-col">
      {#each boardStates as s (s.key)}
        <div class="frame-wrap">
          <span class="panel-label">{s.label}</span>
          <iframe title={"desktop-" + s.key} src={"/gallery.html?frame=" + s.key} width="1000" height="560"></iframe>
        </div>
      {/each}
    </div>
  </section>

  <!-- FULL BOARD (phone via iframe — the iframe's own viewport makes media queries AND
       viewport.isPhone fire against 390px, not the gallery window) -->
  <section>
    <h2>Full board — phone (390px)</h2>
    <div class="frame-row">
      {#each boardStates as s (s.key)}
        <div class="frame-wrap">
          <span class="panel-label">{s.label}</span>
          <iframe title={"phone-" + s.key} src={"/gallery.html?frame=" + s.key} width="390" height="740"></iframe>
        </div>
      {/each}
    </div>
  </section>

  <!-- MODAL & SHARING -->
  <section>
    <h2>Modal &amp; sharing</h2>
    <p>Click to open the live How-to-play modal:</p>
    <div style="background: var(--placard); padding: var(--space-3); display: inline-block;">
      <HowToPlay />
    </div>
    <p>Share preview (paragraph-spaced blocks, framed on the lighter page ground):</p>
    <div style="display: flex; flex-direction: column; gap: var(--space-3); background: var(--bg-page); border: 1px solid var(--placard-edge); border-radius: var(--radius-card); padding: var(--space-4); line-height: 1.4; max-width: 20rem;">
      <p style="margin: 0;">{sampleShareParts.headline}</p>
      <p style="margin: 0;">{sampleShareParts.score}</p>
      <pre style="margin: 0; white-space: pre;">{sampleShareParts.grid.join("\n")}</pre>
    </div>
    <p>Copied clipboard text (compact single line breaks):</p>
    <pre style="white-space: pre; line-height: 1.4;">{sampleShareText}</pre>
  </section>
</div>

<style>
  /* Lay the light board color over the terracotta body ground (base.css only does this for #app,
     not the gallery's #gallery mount) so the gallery is readable, without touching the load-bearing
     terracotta body bg that feeds the Safari/Orion window-chrome tint. */
  .gallery { max-width: none; padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-7);
    min-height: 100dvh; background: var(--bg-page); }

  .g-head h1 { font-family: var(--font-head); font-size: var(--type-display); font-weight: var(--fw-bold); letter-spacing: .03em; }
  .g-head p { color: var(--ink-soft); font-size: var(--type-label); }
  .g-head code { background: var(--bg-sunk); padding: 0 .3em; border-radius: 4px; }
  section { display: flex; flex-direction: column; gap: var(--space-4); }
  section > h2 { font-size: var(--type-heading); font-weight: var(--fw-bold); border-bottom: 1px solid var(--hairline); padding-bottom: var(--space-2); }

  .panel-row { display: flex; flex-wrap: wrap; gap: var(--space-5); align-items: flex-start; }
  .panel { border: 1px dashed var(--hairline); border-radius: var(--radius-card); background: var(--bg-page); }
  .panel.wide { width: 100%; }
  .panel-label { display: block; font-size: var(--type-meta); font-weight: var(--fw-bold); text-transform: uppercase; letter-spacing: .1em; color: var(--ink-mute); padding: var(--space-2) var(--space-3); border-bottom: 1px dashed var(--hairline); }
  .panel-body { padding: var(--space-4); overflow: auto; }
  .specimen-slot { width: 20rem; }
  .btn-slot { display: flex; gap: var(--space-3); align-items: center; }
  /* the dark ground the inverse pair is meant to sit on (mirrors header/sheet) */
  .btn-slot.dark { background: var(--placard); border-radius: var(--radius-card); }
  /* Stats render inside the Modal, which sits on --bg-surface — match it so the dark --ink text
     has the same contrast context it ships with. */
  .stats-slot { width: 20rem; background: var(--bg-surface); border-radius: var(--radius-card); }

  .swatch-row { display: flex; flex-wrap: wrap; gap: var(--space-6); }
  .swatch-group { display: flex; flex-direction: column; gap: var(--space-2); }
  .swatch { display: flex; align-items: center; gap: var(--space-2); font-size: var(--type-meta); }
  .swatch .chip { width: 2rem; height: 1.2rem; border-radius: 4px; border: 1px solid var(--hairline); }
  .ramp { display: flex; }
  .ramp-cell {
    width: 3rem; height: 2.4rem; display: flex; align-items: flex-end; justify-content: center;
  }
  .ramp-pct { font-size: var(--type-meta); font-weight: var(--fw-bold); color: var(--cream); opacity: .8; padding-bottom: 2px; }

  .frame-row { display: flex; flex-wrap: wrap; gap: var(--space-5); }
  /* desktop boards are wide, so they stack vertically rather than sitting side-by-side */
  .frame-col { display: flex; flex-direction: column; gap: var(--space-5); }
  .frame-wrap { display: flex; flex-direction: column; gap: var(--space-2); }
  .frame-wrap iframe { border: 1px solid var(--hairline); border-radius: var(--radius-card); background: var(--bg-page); }
</style>
