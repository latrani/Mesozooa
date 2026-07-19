<script lang="ts">
  import { nav } from "./lib/nav.svelte";
  import { explorer } from "./lib/explorer/explorerStore.svelte";
  import { treeStore } from "./lib/game/treeData";
  import { taxonSlug, resolveTaxonRef } from "./lib/explorer/explorer-core";
  import { formatHash, parseHash, type Route } from "./lib/route";
  import { hasProgress } from "./lib/game/engine-core";
  import { daily } from "./lib/game/dailyStore.svelte";
  import { game } from "./lib/game/gameStore.svelte";
  import meta from "./data/meta.json";
  import Daily from "./lib/game/components/Daily.svelte";
  import Practice from "./lib/game/components/Practice.svelte";
  import Explorer from "./lib/explorer/components/Explorer.svelte";
  import HowToPlay from "./lib/components/HowToPlay.svelte";
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
  <nav class="modes">
    <button type="button" class:active={nav.tab === "daily"} onclick={() => nav.set("daily")}>Daily{#if hasProgress(daily.state)}{" — in progress"}{/if}</button>
    <button type="button" class:active={nav.tab === "practice"} onclick={() => nav.set("practice")}>Practice{#if hasProgress(game.state)}{" — in progress"}{/if}</button>
    <button type="button" class:active={nav.tab === "explore"} onclick={() => nav.set("explore")}>Explore</button>
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
    · Data: <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer">Wikidata</a> (CC0)
    · <a href="https://paleobiodb.org" target="_blank" rel="noopener noreferrer">Paleobiology Database</a>
    · <a href="https://en.wikipedia.org" target="_blank" rel="noopener noreferrer">Wikipedia</a>
    · updated {meta.dataPulledAt}
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
    padding: var(--space-3) var(--space-5);
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
    gap: var(--space-2);
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
  }
  /* on narrow screens the nav needs the room — drop the tagline before it crowds */
  @media (max-width: 640px) {
    .tagline { display: none; }
  }
  .modes {
    display: flex;
    gap: var(--space-5);
    margin-left: auto;
    align-self: center;   /* keep the nav vertically centered, out of the baseline row */
    font-size: var(--type-body);
  }
  .modes button {
    background: none; border: 0; cursor: pointer;
    font-weight: var(--fw-semibold);
    color: var(--cream-dim);
    padding: .15rem 0; position: relative;
  }
  .modes button:hover { color: var(--cream); }
  .modes button.active { color: var(--cream); }
  .modes button.active::after {
    content: ""; position: absolute; left: 0; right: 0; bottom: -4px;
    height: 3px; background: var(--accent); border-radius: 2px;
  }
  /* slim attribution footer — muted, right-aligned, no divider; one unit of top padding */
  .app-footer {
    display: flex; justify-content: flex-end; text-align: right;
    /* no top padding: the bottom placard above already pads; footer only needs to clear the
       viewport edge below. Both are --bg-surface, so they read as one continuous strip. */
    padding: 0 var(--space-5) var(--space-2);
    font-size: var(--type-meta); color: var(--ink-mute);
    background: var(--bg-surface);
  }
  .app-footer a { color: var(--ink-soft); font-weight: var(--fw-semibold); }
  .app-footer a:hover { color: var(--mahogany); }
</style>
