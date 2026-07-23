<script lang="ts">
  import { nav } from "./lib/nav.svelte";
  import { explorer } from "./lib/explorer/explorerStore.svelte";
  import { treeStore } from "./lib/game/treeData";
  import { taxonSlug, resolveTaxonRef } from "./lib/explorer/explorer-core";
  import { formatHash, parseHash, type Route } from "./lib/route";
  import { hasProgress } from "./lib/game/engine-core";
  import { daily } from "./lib/game/dailyStore.svelte";
  import { practice } from "./lib/game/practiceStore.svelte";
  import meta from "./data/meta.json";
  import Daily from "./lib/game/components/Daily.svelte";
  import Practice from "./lib/game/components/Practice.svelte";
  import Explorer from "./lib/explorer/components/Explorer.svelte";
  import HowToPlay from "./lib/components/HowToPlay.svelte";
  import StatsPanel from "./lib/components/StatsPanel.svelte";
  // Claw mark for the header, inlined so it inherits the header's cream color. ?raw gives the
  // file text; strip the wrapper to the drawing so a CSS `fill` reaches its (fill-less) path.
  import clawSvg from "./assets/claw.svg?raw";
  const clawViewBox = clawSvg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 255 305";
  const clawInner = clawSvg.replace(/[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
  // Outside the tree (header, PWA icon, favicon) the footprint is flipped 180° so it reads as an
  // "M" for Mesozooa; the upright footprint stays in the circle in the tree view (genus.svg).
  const [vx, vy, vw, vh] = clawViewBox.split(/\s+/).map(Number);
  const clawSpin = `rotate(180 ${vx + vw / 2} ${vy + vh / 2})`;

  const rootId = treeStore.data.rootId;

  // Slug for the URL: explore's focus, unless it's the tree root (bare #/explore there).
  function currentTaxonSlug(): string | undefined {
    if (nav.tab !== "explore" || explorer.highlightId === rootId) return undefined;
    return taxonSlug(treeStore, explorer.highlightId);
  }
  // Canonical hash for the live app state (reactively tracks tab + explore focus).
  const currentHash = () => formatHash(nav.tab, currentTaxonSlug());
  // Canonical hash a parsed route resolves to — same slug pipeline, so Q-id/case/root
  // all normalize to the same string the write side produces. This is the loop guard.
  function canonicalFor(route: Route): string {
    let slug: string | undefined;
    if (route.tab === "explore" && route.taxon) {
      const id = resolveTaxonRef(treeStore, route.taxon);
      if (id && id !== rootId) slug = taxonSlug(treeStore, id);
    }
    return formatHash(route.tab, slug);
  }

  // Read the URL on load, before first paint.
  nav.hydrate();

  // --- active-mode indicator -------------------------------------------------------------
  // One bar owned by the <nav>, positioned by BOTH insets (left + right) rather than
  // left + width. That's what buys the squash-and-stretch: the two edges get different
  // transition durations, so the leading edge sprints ahead, the trailing edge dawdles, and
  // the bar is momentarily longer than either label before snapping to its new width.
  const modes = $derived([
    { tab: "daily" as const, label: "Daily", progress: hasProgress(daily.state) },
    { tab: "practice" as const, label: "Practice", progress: hasProgress(practice.state) },
    { tab: "explore" as const, label: "Explore", progress: false },
  ]);

  let navEl = $state<HTMLElement>();
  const btns: (HTMLButtonElement | undefined)[] = [];
  let indL = $state(0);
  let indR = $state(0);
  let dir = $state<"left" | "right">("right");
  // Gates the transition until after the first measurement, so the bar doesn't fly in from
  // left: 0 on every page load.
  let ready = $state(false);
  let lastMid = 0;

  function measure() {
    const el = btns[modes.findIndex((m) => m.tab === nav.tab)];
    if (!el || !navEl) return;
    const mid = el.offsetLeft + el.offsetWidth / 2;
    // Direction comes from the bar's own midpoint travel, NOT from the tab index. That way one
    // rule covers both cases: a tab click, and a re-layout that shoves the active button
    // sideways without anyone clicking (see the ResizeObserver below). Equal midpoints (a pure
    // re-measure) leave the previous direction alone.
    if (ready && mid !== lastMid) dir = mid > lastMid ? "right" : "left";
    lastMid = mid;
    indL = el.offsetLeft;
    indR = navEl.clientWidth - (el.offsetLeft + el.offsetWidth);
  }

  // Re-measure on tab change and on either label gaining/losing its "in progress" suffix.
  $effect(() => {
    void [nav.tab, modes];
    measure();
  });

  // The other re-measure triggers, which are the ones you'd never think to enumerate: window
  // resize, the Arsenal webfont swapping in after first paint (every button changes width), and
  // — the sneaky one — hasProgress flipping on a button that ISN'T active. Daily sits first, so
  // "Daily — in progress" appearing shoves Practice and Explore rightward while you're standing
  // on one of them; the bar has to follow with no click involved. Observing the buttons as well
  // as the nav catches the case where two labels change and the nav's own width nets out the same.
  $effect(() => {
    if (!navEl) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(navEl);
    for (const b of btns) if (b) ro.observe(b);
    const raf = requestAnimationFrame(() => (ready = true));
    return () => {
      ro.disconnect();
      cancelAnimationFrame(raf);
    };
  });

  // Write: mirror app state into the hash, only when it actually differs.
  $effect(() => {
    const h = currentHash();
    if (location.hash !== h) location.hash = h;
  });

  // Read: back/forward or hand-edited URL. Apply only when it's a genuinely new state,
  // so our own writes (and equivalent refs) don't bounce back through nav.apply.
  $effect(() => {
    const onHash = () => {
      const route = parseHash(location.hash);
      // Seed is an ACTION, not a state: its canonical form is #/practice (== currentHash while
      // on practice), so the guard would wrongly skip it. Always apply — nav.apply seeds then
      // redirects to a clean #/practice.
      if (route.seed || canonicalFor(route) !== currentHash()) nav.apply(route);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  });
</script>

<header class="app-header">
  <span class="brand">
    <svg class="brand-claw" viewBox={clawViewBox} aria-hidden="true"><g transform={clawSpin}>{@html clawInner}</g></svg>
    <span class="wordmark">Mesozooa</span>
  </span>
  <span class="tagline">Find today's dinosaur!</span>
  <HowToPlay />
  <StatsPanel />
  <nav
    class="modes"
    class:ready
    bind:this={navEl}
    data-dir={dir}
    style="--ind-l: {indL}px; --ind-r: {indR}px"
  >
    {#each modes as m, i (m.tab)}
      <button
        type="button"
        bind:this={btns[i]}
        class:active={nav.tab === m.tab}
        aria-current={nav.tab === m.tab ? "page" : undefined}
        onclick={() => nav.set(m.tab)}>{m.label}{#if m.progress}<span class="progress-dot" aria-hidden="true"></span><span class="sr-only"> in progress</span>{/if}</button
      >
    {/each}
    <!-- decorative: aria-current on the buttons already carries "which mode am I in" -->
    <span class="indicator" aria-hidden="true"></span>
  </nav>
</header>

{#if nav.tab === "daily"}
  <Daily />
{:else if nav.tab === "practice"}
  <Practice />
{:else}
  <Explorer />
{/if}

<footer class="app-footer">
  <span>
    Inspired by <a href="https://metazooa.com" target="_blank" rel="noopener noreferrer">Metazooa</a>
    · Data: <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a> (CC0), <a href="https://paleobiodb.org" target="_blank" rel="noopener noreferrer">Paleobiology Database</a>, <a href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a>. Updated {meta.dataPulledAt}
  </span>
</footer>

<style>
  .app-header {
    display: flex;
    /* baseline so the wordmark and tagline sit on one line; the claw and nav opt back out to
       center (align-self) so only the two text runs share a baseline. */
    align-items: baseline;
    gap: var(--space-5);
    /* vertical padding halved from the side padding */
    padding: var(--space-2) var(--space-5);
    /* edge-to-edge terracotta placard casting a soft shadow DOWN onto the tree below, so the
       tree canvas reads as inset. z-index keeps the shadow above the canvas. */
    position: relative; z-index: 4;
    background: linear-gradient(var(--placard), var(--placard-dp));
    border-bottom: 1px solid var(--placard-edge);
    box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35);
    color: var(--cream);
  }
  .brand {
    display: flex;
    /* baseline so the wordmark defines this cluster's baseline (which the tagline aligns to) */
    align-items: baseline;
    gap: var(--space-4);
  }
  .brand-claw {
    height: 1.6rem;
    width: auto;
    fill: var(--cream);   /* claw path has no fill of its own, so it inherits this */
    flex: none;
    align-self: center;   /* icon centers on the wordmark rather than dropping to its baseline */
  }
  .wordmark {
    font-family: var(--font-head);
    font-size: var(--type-display);
    font-weight: var(--fw-bold);   /* Arsenal ships 700 as its bold */
    letter-spacing: .03em;         /* expanded, signage feel (no scaleX distortion) */
    color: var(--cream);
  }
  .tagline {
    font-size: var(--type-body);
    font-weight: var(--fw-medium);
    color: var(--cream-dim);
    font-weight: bold;
  }
  /* Phone: one header row, and the claw carries the brand alone. It is already rotated 180deg
     outside the tree specifically so it reads as an "M", so the wordmark is redundant at this
     width and the ~40px a second row would cost is 8% of the tree's height budget. */
  .modes {
    display: flex;
    gap: var(--space-5);
    margin-left: auto;
    align-self: center;   /* keep the nav vertically centered, out of the baseline row */
    font-size: var(--type-heading);
    position: relative;   /* the sliding indicator positions against this */
    /* --- the two knobs -------------------------------------------------------------------
       --ind-dur: how long the whole slide takes (the TRAILING edge's duration, so it's what
         you feel as the overall speed). Local on purpose: --dur is shared app-wide, so tuning
         the nav there would retime every other transition too.
       --ind-lead: the LEADING edge's duration. The gap between the two IS the stretch — the
         smaller the fraction, the further the bar shoots ahead before its back edge catches up.
         Set it equal to --ind-dur for a rigid glide with no squash at all. */
    --ind-dur: 750ms;
    --ind-lead: calc(var(--ind-dur) * .3);
  }
  .modes button {
    background: none; border: 0; cursor: pointer;
    font-weight: var(--fw-semibold);
    color: var(--cream-dim);
    padding: .15rem 0; position: relative;
    /* nowrap: the progress dot is an inline-block after the label, so without this it wraps to a
       second line, doubling the button's height and lifting its text off the other tabs' baseline
       (which also inflates the whole header). */
    white-space: nowrap;
  }
  .modes button:hover { color: var(--cream); }
  .modes button.active { color: var(--cream); }
  .progress-dot {
    display: inline-block; width: .4em; height: .4em; margin-left: .35em;
    border-radius: 50%; background: var(--accent); vertical-align: middle;
  }
  /* Visually-hidden but announced. The dot alone is decorative; the state has to survive as real
     text in the button's accessible name, which is what the old " in progress" suffix did. */
  .sr-only {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
  /* One bar for all three tabs, driven by measured insets (see the script). Both edges are
     positioned, so animating them at different speeds stretches the bar mid-flight. */
  .indicator {
    position: absolute; bottom: -4px; height: 3px;
    left: var(--ind-l); right: var(--ind-r);
    background: var(--accent); border-radius: 2px;
    pointer-events: none;
  }
  /* .ready gates the transition past the first measurement, so no fly-in on load. Travelling
     right, the right edge leads (short duration) and the left edge trails (long); mirrored
     going left. base.css flattens all of this under prefers-reduced-motion. */
  .modes.ready .indicator {
    transition: left var(--ind-dur) var(--ease), right var(--ind-dur) var(--ease);
  }
  .modes.ready[data-dir="right"] .indicator { transition-duration: var(--ind-dur), var(--ind-lead); }
  .modes.ready[data-dir="left"] .indicator { transition-duration: var(--ind-lead), var(--ind-dur); }
  /* slim attribution footer — muted, right-aligned, no divider; one unit of top padding */
  .app-footer {
    display: flex; justify-content: flex-end; text-align: right;
    /* no top padding: the bottom placard above already pads; footer only needs to clear the
       viewport edge below. Both are --bg-surface, so they read as one continuous strip. */
    padding: var(--space-1) var(--space-5);
    font-size: var(--type-meta); color: var(--ink-mute);
    background: linear-gradient(var(--placard-dp), var(--placard));
    border-top: 1px solid var(--placard-edge);
    box-shadow: 0 6px 16px -8px rgba(51, 38, 26, 0.35);
    color: var(--cream);
  }
  .app-footer a { color: var(--cream-dim); font-weight: var(--fw-semibold); }
  .app-footer a:hover { color: var(--cream); }
  /* Phone: the attribution strip wraps to ~4 lines of --type-meta, roughly 10% of the tree's
     height budget, for text nobody reads in a strip. It lives in How to play > About instead;
     per-image CC credits stay on the specimen card, so the license obligation is met either way. */
  /* Phone. This block MUST stay after the base .modes rule: a media query adds no specificity, so
     when it sat earlier in the file the later `.modes { gap: var(--space-5); font-size: var(--type-heading) }`
     silently won and neither the tighter gap nor the smaller label ever applied. That overflowed
     the header and clipped the "Explore" tab off the right edge. */
  @media (max-width: 640px) {
    .tagline { display: none; }
    /* Two rows. Row 1 is identity plus utilities; row 2 is the mode switcher, given the full width
       so the three tabs spread across it instead of huddling at the right edge. The vertical cost
       is affordable: measured at 390x844 the tree still clears its budget. */
    .app-header {
      flex-wrap: wrap; align-items: center;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-2) var(--space-3);
    }
    /* 32px is a desktop signage size; at 390px it alone pushes the utilities onto a third row.
       --type-title keeps the wordmark clearly dominant while leaving room for both buttons. */
    .wordmark { font-size: var(--type-title); }
    .brand { gap: var(--space-3); }
    .modes {
      flex: 0 0 100%; margin-left: 0;
      justify-content: space-between; gap: var(--space-2);
      font-size: var(--type-body);
    }
    .app-footer { display: none; }
  }
</style>
