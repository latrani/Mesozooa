<script lang="ts">
  import { treeStore } from "../treeData";
  import { layoutSpine, centerOffsetFor } from "../spine-layout";
  import { displayName } from "../displayName";
  import { scrollFade } from "../../actions/scrollFade";
  import { warmthRampColor } from "../warmth-ramp";
  import {
    ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAULT, clampZoom, zoomStep, scrollForZoom,
  } from "../zoom";
  import { PinchGesture } from "@use-gesture/vanilla";
  // The node glyphs stay authored in src/assets/*.svg (edit them in a vector tool, re-export,
  // and this picks the change up on rebuild/HMR). ?raw gives the file text; we lift out its
  // viewBox + inner markup to build a recolorable <symbol> below.
  import genusSvg from "../../../assets/genus.svg?raw";
  import cladeSvg from "../../../assets/clade.svg?raw";

  function glyphParts(raw: string): { viewBox: string; inner: string } {
    const viewBox = raw.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
    // strip the xml decl / doctype / outer <svg …> wrapper and the closing tag, leaving the
    // <g>/<path> content. (The outer <svg>'s fill-rule is reapplied on the symbol wrapper.)
    const inner = raw.replace(/[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");
    return { viewBox, inner };
  }
  const genusGlyph = glyphParts(genusSvg);
  const cladeGlyph = glyphParts(cladeSvg);

  // Node glyph sizing (px). Both glyphs are discs now (a footprint / a pair of tracks carved out
  // of the disc); size just balances their visual weight.
  const GLYPH_GENUS = 24;
  const GLYPH_CLADE = 24;
  // Vertical nudge for each glyph, in px (negative = up, positive = down), for optical seating on
  // the row line. Per-glyph so the two discs can be trimmed independently.
  const GLYPH_OFFSET_Y_GENUS = 0;
  const GLYPH_OFFSET_Y_CLADE = 0;
  // Page-color separation so a glyph doesn't meld into the branch line it sits on: each glyph
  // rides a page-color backing disc (drawn just under it) that fills its carved-out cutouts — so
  // neither the branch line nor the tucked selection-ring corner shows through — and peeks
  // OUTLINE_PX past the glyph edge as a separating halo (0 = disc flush with the glyph).
  const OUTLINE_PX = 0;

  let {
    revealed,
    tipId,
    highlightId = null,
    guessWarmth = new Map<string, number>(),
    onnodeselect,
    emptyLabel = "Make a guess to start revealing the tree.",
    rightInset = 0,
    nodeColor,
    showCounts = true,
    gradeByPlayable = false,
    linkLabels = false,
    warmthProvider,
  }: {
    revealed: Set<string>;
    tipId: string | null;
    highlightId?: string | null;
    /** guessId -> warmth fraction, so a guessed genus dot matches its warmth-bar color */
    guessWarmth?: Map<string, number>;
    onnodeselect?: (id: string) => void;
    /** per-node color for segments/dots/ring; null => structural default. Absent => warmth. */
    nodeColor?: (id: string, isGenusDot: boolean) => string | null;
    emptyLabel?: string;
    /** px of the scroller's right edge covered by a floating overlay (the specimen);
        centering targets the visible area LEFT of it. */
    rightInset?: number;
    /** show the descendant-genus count beside each clade label. On in Explore (the faithful
        reference cladogram); off in the game, where it's a confusing non-playable signal. */
    showCounts?: boolean;
    /** grade genus labels by playability. On in Explore, so a name scanned here is worth
        carrying to the guess box; off in the game, whose pool is playable-only anyway. */
    gradeByPlayable?: boolean;
    /** underline labels to advertise them as links. On for the game's end state, where node
        clicks become portals into Explore — a new affordance appearing mid-session, so it has
        to announce itself. Off in Explore, where clicking the tree IS the mode. */
    linkLabels?: boolean;
    /** drives on-spine node warmth colors; built per-game (target-aware). Absent in Explore,
        which injects nodeColor instead and never reaches ownWarmthColor. */
    warmthProvider?: import("../warmth").WarmthProvider;
  } = $props();

  // Warmth along the spine: a node's own warmth (two-phase spine depth) drives its color,
  // so the spine grows cold->warm from root to frontier. Guessed genus dots instead use the
  // guess's warmth fraction (matching its bar). Off-spine context stays neutral.
  // Resolve a node's color: injected nodeColor wins; otherwise the built-in warmth default
  // (guess warmth for a guessed genus dot, own-warmth for spine nodes, null off-spine).
  function ownWarmthColor(id: string): string {
    const node = treeStore.getNode(id);
    return node && warmthProvider
      ? warmthRampColor(warmthProvider.warmth(node).fraction)
      : "var(--node-context)";
  }
  function colorOf(id: string, onSpine: boolean, isGenusDot: boolean): string | null {
    // Per the spec contract, the injected nodeColor receives the node's isGenus flag; the
    // built-in fallback below keeps using on-spine membership (own-warmth for spine nodes).
    if (nodeColor) return nodeColor(id, isGenusDot);
    if (guessWarmth.has(id)) return warmthRampColor(guessWarmth.get(id)!);
    if (onSpine) return ownWarmthColor(id);
    return null;
  }
  // stable, CSS-selector-safe gradient id per spine segment
  function gradId(parentId: string, childId: string): string {
    return `sg-${parentId}-${childId}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  }

  const X_GAP = 200;
  const Y_GAP = 52;
  // The label is one box unit: name (+ count) centered inside a rounded box whose BOTTOM edge
  // sits on the row line (y=0). Selection just fills/borders that box. Fixed height keeps the
  // text centering deterministic (so it never shifts when selected) and gives descenders room.
  const RING_H = 28; // box height
  const RING_PAD_X = 14; // horizontal padding between the label text and the box sides
  const LABEL_OFFSET = 0; // box's left edge, measured from the glyph CENTER (node origin) — so
  //                          labels line up in one column regardless of genus/clade glyph size
  // Alphabetic baseline offset that optically centers the label in the box: box center is
  // -RING_H/2; the baseline sits ~half a cap-height below that. CAP_HALF is tuned by eye.
  const CAP_HALF = 5;
  const LABEL_BASELINE_DY = -RING_H / 2 + CAP_HALF;
  const PAD = 28;
  const LABEL_PAD = 16;
  // Decorative "stem": the spine trails a short way left of Dinosauria to the content edge.
  // The always-on left scroll-fade mask softens where it meets the edge, so it reads as
  // trailing off into deep time rather than hard-stopping.
  const STEM = 40;
  const CORNER_RADIUS = 16; // radius of the rounded elbow where a branch's riser meets its arm

  let layout = $derived(layoutSpine(treeStore, revealed, tipId));
  let posOf = $derived(new Map(layout.nodes.map((n) => [n.id, n])));

  // A revealed clade whose children are NOT in the layout is "collapsed" — mark it so we can
  // draw a short right-fading stub ("more here"). Genera never get a stub.
  let hasLaidOutChildren = $derived(new Set(layout.edges.map((e) => e.parentId)));
  function isExpandable(id: string): boolean {
    const node = treeStore.getNode(id);
    return !!node && !node.isGenus && !hasLaidOutChildren.has(id);
  }
  let contentWidth = $derived(layout.nodes.length ? STEM + layout.width * X_GAP + PAD * 2 + 140 : 0);
  // The specimen clearance is a FIXED-px runway (a spacer element after the SVG), NOT canvas baked
  // into the viewBox — so it stays a constant screen-px gutter at every zoom (issue #32). The SVG
  // draws the tree only (0..contentWidth); `runway` is the scroll distance past its right edge.
  let runway = $derived(contentWidth ? rightInset : 0);
  // Total scrollable content width at zoom=1: scaled tree + fixed runway. centerOffsetFor and the
  // scroll-fade dependency read this.
  let scrollWidth = $derived(contentWidth ? contentWidth + runway : 0);
  let vbH = $derived((layout.maxY - layout.minY) * Y_GAP + PAD * 2 + LABEL_PAD);

  let scroller = $state<HTMLDivElement | null>(null);
  let zoom = $state(ZOOM_DEFAULT);
  const px = (x: number) => STEM + PAD + x * X_GAP;
  const py = (y: number) => PAD + LABEL_PAD + (y - layout.minY) * Y_GAP;

  // bbox of the highlighted label, in the node's local coords — backs the ring rect. Measured on a
  // rAF, NOT synchronously: the count <tspan> is appended after the name, and a synchronous getBBox()
  // at highlight-time can run before that tspan is laid out — yielding a box that fits only the name,
  // so the ring falls short of the count (intermittently, by layout-race). Deferring to the next
  // frame guarantees the full text (name + count) is measured.
  let labelBox = $state<{ x: number; y: number; width: number; height: number } | null>(null);
  function measureLabel(el: SVGTextElement, active: boolean) {
    const measure = (on: boolean) => {
      if (on) requestAnimationFrame(() => { labelBox = el.getBBox(); });
    };
    measure(active);
    return { update: measure };
  }

  function edgePath(parentId: string, childId: string): string {
    const p = posOf.get(parentId)!;
    const c = posOf.get(childId)!;
    // Square cladogram: diverge at the ANCESTOR marker — vertical riser at the parent's x,
    // then horizontal to the child. Keeps branches off the spine (they leave perpendicular).
    const x0 = px(p.x), y0 = py(p.y);
    const cx = px(p.x), cy = py(c.y); // the elbow corner
    const x1 = px(c.x);
    const dy = cy - y0; // riser direction: +down / -up (0 when child shares the parent's row)
    // A same-row child has no riser, so no corner to round — draw the straight arm.
    if (dy === 0) return `M ${x0} ${y0} H ${x1}`;
    // Round the elbow with a quadratic whose control point is the sharp corner; clamp the radius
    // to half of each leg so short segments don't over-round or overshoot.
    const dirY = Math.sign(dy);
    const r = Math.min(CORNER_RADIUS, Math.abs(dy) / 2, (x1 - cx) / 2);
    return `M ${x0} ${y0} V ${cy - r * dirY} Q ${cx} ${cy} ${cx + r} ${cy} H ${x1}`;
  }

  // Prefers-reduced-motion => instant; otherwise the browser eases to a stop.
  const reduceMotion =
    typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

  function scrollToNode(id: string) {
    if (!scroller) return;
    const n = posOf.get(id);
    if (!n) return;
    const left = centerOffsetFor(n.depth, {
      xGap: X_GAP,
      pad: STEM + PAD, // node x-origin includes the left stem offset
      contentWidth: scrollWidth, // includes the trailing bleed so the clamp allows scrolling into it
      viewportWidth: scroller.clientWidth,
      rightInset,
    });
    // Vertical: center the node's row in the viewport, clamped to the scrollable range. The
    // spine can splay tall in Explore, so the tip may sit far down the SVG — center it too.
    const rawTop = py(n.y) - scroller.clientHeight / 2;
    const maxTop = Math.max(0, vbH - scroller.clientHeight);
    const top = Math.min(Math.max(0, rawTop), maxTop);
    scroller.scrollTo({ left, top, behavior: reduceMotion ? "auto" : "smooth" });
  }

  // Exposed for the trail scrubber (Plan 2).
  export function panTo(id: string) {
    if (zoom !== ZOOM_DEFAULT) {
      zoom = ZOOM_DEFAULT;
      // wait for the SVG to resize back to 1:1 before centering on the target
      requestAnimationFrame(() => scrollToNode(id));
      return;
    }
    scrollToNode(id);
  }

  // Sole mutator of zoom. Clamps, then keeps `origin` fixed under the pointer. The scroll is set
  // on the next frame so the SVG has resized to the new zoom before we clamp scrollLeft/Top.
  //
  // `from` is the (scroll, zoom) baseline the anchor math maps FROM. It defaults to the live
  // scroller state, but a pinch passes a FIXED gesturestart snapshot: WebKit fires gesturechange
  // 100+ times per pinch (often several per frame), and chaining each step off the live,
  // integer-rounded scrollLeft compounds sub-pixel error until the anchor walks into the top-left
  // corner and sticks (the WebKit-only pinch drift). Mapping every event absolutely from the same
  // start baseline + cumulative scale makes 140 events as exact as one.
  function applyZoom(
    nextZoom: number,
    origin: { x: number; y: number },
    from?: { scroll: { left: number; top: number }; zoom: number },
  ) {
    if (!scroller) return;
    const oldZoom = from ? from.zoom : zoom;
    const z = clampZoom(nextZoom);
    if (z === oldZoom) return;
    const target = scrollForZoom({
      origin,
      oldZoom,
      newZoom: z,
      scroll: from ? from.scroll : { left: scroller.scrollLeft, top: scroller.scrollTop },
      viewport: { w: scroller.clientWidth, h: scroller.clientHeight },
      content: { w: contentWidth, h: vbH }, // tree-only; runway is the separate fixed gutter
      runway,
    });
    zoom = z;
    requestAnimationFrame(() => scroller?.scrollTo({ left: target.left, top: target.top }));
  }

  // Return to the default view: 1:1, re-centered on the current tip.
  function resetZoom() {
    zoom = ZOOM_DEFAULT;
    requestAnimationFrame(() => { if (tipId) scrollToNode(tipId); });
  }

  // Button helpers zoom around the viewport center.
  function zoomButton(dir: 1 | -1) {
    if (!scroller) return;
    applyZoom(zoomStep(zoom, dir), { x: scroller.clientWidth / 2, y: scroller.clientHeight / 2 });
  }

  // Center the tip whenever it changes, or when rightInset settles (it's 0 until the floating
  // overlay is measured post-mount). The game's tip only ever deepens, so "on change" doesn't
  // regress its forward-follow feel; Explore's tip jumps freely, giving click-to-center.
  let lastTipId: string | null = null;
  let lastInset = -1;
  $effect(() => {
    const d = tipId ? (posOf.get(tipId)?.depth ?? -1) : -1;
    void scrollWidth; // re-run when the scrollable width changes too
    if (scroller && tipId && d >= 0) {
      if (tipId !== lastTipId) {
        resetZoom(); // navigation -> back to the default view, which re-centers on the new tip
      } else if (rightInset !== lastInset) {
        scrollToNode(tipId);
      }
    }
    lastTipId = tipId;
    lastInset = rightInset;
  });

  // Pinch-to-zoom, split by browser engine — both feed the single applyZoom entry point.
  //
  // WebKit (Safari, Orion, iOS/iPadOS): hand-handle the native WebKit GestureEvents. They fire
  // for BOTH trackpad pinch and two-finger touch pinch on every WebKit browser, and we verified
  // gesturechange fires identically (with a live e.scale) in Safari AND Orion. @use-gesture's own
  // 'gesture'-device path uses these same events but silently fails to drive zoom in Orion (#33);
  // owning them ourselves sidesteps its internals and can't regress Safari (same raw events).
  // e.scale is cumulative since gesturestart, so target zoom = startZoom * scale.
  //
  // Blink/Gecko (Chrome, Firefox): no GestureEvent, so @use-gesture handles touch-pinch + trackpad
  // ctrl+wheel there. Native one-finger scroll (touch-action: pan-x pan-y) is untouched either way.
  $effect(() => {
    if (!scroller) return;
    const el = scroller;

    if ("GestureEvent" in window) {
      // Snapshot the ENTIRE baseline at gesturestart — zoom, scroll, and the pinch-centroid
      // origin — and map every gesturechange absolutely from it (target zoom = startZoom * scale,
      // since e.scale is cumulative). Reading zoom/scroll live per event would (a) make this
      // $effect depend on zoom, tearing down + re-attaching listeners mid-pinch, and (b) chain
      // off rounded live scroll across 100+ events, drifting the anchor to the corner.
      // The origin is fixed at the start centroid too, matching how e.scale is measured from it.
      let start = { zoom: ZOOM_DEFAULT, scroll: { left: 0, top: 0 }, origin: { x: 0, y: 0 } };
      const onStart = (e: Event) => {
        e.preventDefault();
        const g = e as unknown as { clientX: number; clientY: number };
        const rect = el.getBoundingClientRect();
        start = {
          zoom,
          scroll: { left: el.scrollLeft, top: el.scrollTop },
          origin: { x: g.clientX - rect.left, y: g.clientY - rect.top },
        };
      };
      const onChange = (e: Event) => {
        e.preventDefault();
        const g = e as unknown as { scale: number };
        applyZoom(start.zoom * g.scale, start.origin, { scroll: start.scroll, zoom: start.zoom });
      };
      el.addEventListener("gesturestart", onStart, { passive: false });
      el.addEventListener("gesturechange", onChange, { passive: false });
      return () => {
        el.removeEventListener("gesturestart", onStart);
        el.removeEventListener("gesturechange", onChange);
      };
    }

    const gesture = new PinchGesture(
      el,
      (state) => {
        const rect = el.getBoundingClientRect();
        applyZoom(state.offset[0], { x: state.origin[0] - rect.left, y: state.origin[1] - rect.top });
      },
      {
        scaleBounds: { min: ZOOM_MIN, max: ZOOM_MAX },
        from: () => [zoom, 0] as [number, number],
        rubberband: false,
        eventOptions: { passive: false },
      },
    );
    return () => gesture.destroy();
  });
</script>

<div class="tree-viewport">
{#if layout.nodes.length}
  <div class="tree-scroll" bind:this={scroller} use:scrollFade={{ dep: scrollWidth, alwaysLeft: true }}>
    <svg
      class="tree"
      width={contentWidth * zoom}
      height={vbH * zoom}
      viewBox={`0 0 ${contentWidth} ${vbH}`}
      role="img"
      aria-label="Cladogram"
    >
      <!-- per-spine-segment gradients: blend from the parent dot color to the child dot color
           (userSpaceOnUse so x1/x2 sit at the two endpoint columns) -->
      <defs>
        <!-- Node glyphs, imported live from src/assets/{genus,clade}.svg (see script). fill is
             left unset so each <use> instance inherits its resolved node color; the wrapper
             restores the source svg's fill-rule:evenodd so clade's carved-out footprints read
             as holes rather than filling solid. -->
        <symbol id="glyph-genus" viewBox={genusGlyph.viewBox}>
          <g fill-rule="evenodd">{@html genusGlyph.inner}</g>
        </symbol>
        <symbol id="glyph-clade" viewBox={cladeGlyph.viewBox}>
          <g fill-rule="evenodd">{@html cladeGlyph.inner}</g>
        </symbol>
        <!-- "more here" stub: reads like a branch leaving the dot, then fading into nothing.
             userSpaceOnUse (matching the stub line's local x 6->24) — a horizontal line has a
             zero-height bounding box, and objectBoundingBox gradients are IGNORED on zero-area
             boxes per the SVG spec, which renders the stroke invisible. -->
        <linearGradient id="sp-stub-fade" gradientUnits="userSpaceOnUse" x1="6" y1="0" x2="96" y2="0">
          <stop offset="0" stop-color="var(--leader)" />
          <stop offset="0.35" stop-color="var(--leader)" />
          <stop offset="1" stop-color="var(--leader)" stop-opacity="0" />
        </linearGradient>
        {#each layout.edges as e (e.parentId + ">" + e.childId)}
          {#if e.onSpine}
            {@const p = posOf.get(e.parentId)}
            {@const c = posOf.get(e.childId)}
            {#if p && c}
              <linearGradient id={gradId(e.parentId, e.childId)} gradientUnits="userSpaceOnUse"
                x1={px(p.x)} y1="0" x2={px(c.x)} y2="0">
                <stop offset="0" style="stop-color: {colorOf(e.parentId, true, treeStore.getNode(e.parentId)?.isGenus ?? false)}" />
                <stop offset="1" style="stop-color: {colorOf(e.childId, true, treeStore.getNode(e.childId)?.isGenus ?? false)}" />
              </linearGradient>
            {/if}
          {/if}
        {/each}
      </defs>
      <!-- decorative stem: the spine trails left of Dinosauria into deep time (coldest) -->
      <path class="edge spine" d={`M 0 ${py(0)} H ${px(0)}`} fill="none" style="stroke: {colorOf(treeStore.data.rootId, true, treeStore.getNode(treeStore.data.rootId)?.isGenus ?? false)}" />
      {#each layout.edges as e (e.parentId + ">" + e.childId)}
        <!-- spine segments blend between their endpoint dot colors -->
        <path class="edge" class:spine={e.onSpine} d={edgePath(e.parentId, e.childId)} fill="none"
          style={e.onSpine ? `stroke: url(#${gradId(e.parentId, e.childId)})` : ""} />
      {/each}
      {#each layout.nodes as n (n.id)}
        {@const node = treeStore.getNode(n.id)}
        {@const isHi = n.id === highlightId}
        {@const isGenusNode = node?.isGenus ?? false}
        {@const glyphSize = isGenusNode ? GLYPH_GENUS : GLYPH_CLADE}
        {@const glyphDY = isGenusNode ? GLYPH_OFFSET_Y_GENUS : GLYPH_OFFSET_Y_CLADE}
        {@const glyphFill = colorOf(n.id, n.onSpine, isGenusNode)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <g
          class="node"
          class:spine={n.onSpine}
          class:highlight={isHi}
          class:genus={node?.isGenus}
          class:playable={gradeByPlayable && node?.isGenus && node.playable}
          class:nonplayable={gradeByPlayable && node?.isGenus && !node.playable}
          class:clickable={!!onnodeselect}
          class:link={linkLabels && !!onnodeselect}
          transform={`translate(${px(n.x)} ${py(n.y)})`}
          onclick={() => onnodeselect?.(n.id)}
        >
          {#if isExpandable(n.id)}
            <line x1="6" y1="0" x2="96" y2="0" stroke="url(#sp-stub-fade)" stroke-width="2.5" stroke-linecap="round" />
          {/if}
          {#if isHi && labelBox}
            {@const hiColor = colorOf(n.id, n.onSpine, node?.isGenus ?? false) ?? "var(--turq)"}
            <!-- selection box: bottom edge on the row line (y=0), hugging the centered label.
                 Drawn UNDER the backing disc + glyph so its tucked corner hides behind them. -->
            <rect
              class="label-ring"
              x={labelBox.x - RING_PAD_X} y={-RING_H}
              width={labelBox.width + 2 * RING_PAD_X} height={RING_H}
              rx="6"
              style="fill: color-mix(in srgb, {hiColor} 18%, transparent); stroke: {hiColor}"
            />
          {/if}
          <!-- page-color backing disc: sits just under the glyph and over the label, so it fills
               the glyph's cutouts AND masks the tucked ring corner — neither peeks through. -->
          <circle class="glyph-bg" r={glyphSize / 2 + OUTLINE_PX} cy={glyphDY} />
          <use
            class="glyph"
            href={isGenusNode ? "#glyph-genus" : "#glyph-clade"}
            x={-glyphSize / 2}
            y={-glyphSize / 2 + glyphDY}
            width={glyphSize}
            height={glyphSize}
            style={glyphFill ? `fill: ${glyphFill}` : ""}
          />
          <text class="lbl" x={LABEL_OFFSET + RING_PAD_X} y={LABEL_BASELINE_DY} use:measureLabel={isHi}>
            {displayName(node?.name)}{#if showCounts && !node?.isGenus}<tspan class="count" dx="4">{node?.descendantGenusCount}</tspan>{/if}
          </text>
        </g>
      {/each}
    </svg>
    <!-- fixed-px runway: reserves the specimen's covered width as scroll distance past the tree's
         right edge, unscaled by zoom (issue #32). flex:none so it never shrinks. -->
    {#if runway}<div class="runway" style={`width:${runway}px`} aria-hidden="true"></div>{/if}
  </div>
{:else}
  <p class="tree-empty">{emptyLabel}</p>
{/if}
{#if layout.nodes.length}
  <div class="zoom-controls btn-secondary" role="group" aria-label="Zoom">
    <button type="button" aria-label="Zoom out" onclick={() => zoomButton(-1)} disabled={zoom <= ZOOM_MIN}>&minus;</button>
    <button type="button" aria-label="Reset zoom" onclick={resetZoom} disabled={zoom === ZOOM_DEFAULT}>⌂</button>
    <button type="button" aria-label="Zoom in" onclick={() => zoomButton(1)} disabled={zoom >= ZOOM_MAX}>+</button>
  </div>
{/if}
</div>

<style>
  /* Positioned viewport so the zoom controls can float over the canvas without scrolling with
     it. In the base flex layout it takes the role .tree-scroll had. */
  .tree-viewport { position: relative; display: flex; flex: 1 1 auto; min-width: 0; }
  .tree-viewport .tree-scroll { flex: 1 1 auto; min-width: 0; }
  /* one-finger drag stays native scroll; two-finger goes to the pinch handler */
  .tree-scroll { overflow-x: auto; overflow-y: hidden; max-width: 100%; touch-action: pan-x pan-y; }
  /* flex:none so the SVG's width attribute is always its used width — it neither grows nor
     shrinks to the flex container. Without this the SVG (a flex item) shrinks to fit: at rest
     that's masked, but a zoomed-IN tree wider than the viewport would collapse to container
     width, killing horizontal scroll and snapping scrollLeft to 0 (the Explore zoom "jump").
     flex:none holds the scaled width at every zoom level, in AND out. */
  .tree { color: var(--ink); display: block; flex: none; }
  /* fixed-px specimen-clearance spacer; flex:none holds its width regardless of zoom (issue #32) */
  .runway { flex: none; align-self: stretch; }
  .edge { stroke: var(--leader); stroke-width: 2; fill: none; }
  .edge.spine {
    stroke: var(--spine); stroke-width: 5;  /* fallback; per-segment stroke set inline (warmth) */
    filter: drop-shadow(0 1px 1px rgba(51,38,26,.25));
  }
  /* alphabetic baseline ONLY — it's the one baseline mode WebKit and Blink render identically.
     (dominant-baseline: central/text-after-edge disagree across browsers and superscript the
     count in Safari.) The name + count share this baseline, so they stay aligned everywhere;
     vertical centering in the box is done by the text's y offset (LABEL_BASELINE_DY), not a
     baseline keyword. */
  .lbl { fill: var(--ink); font-size: 0.9rem; font-weight: var(--fw-semibold); text-anchor: start; }
  .node:not(.spine) .lbl { fill: var(--node-context); font-size: 0.82rem; font-weight: var(--fw-medium); }
  .node.genus .lbl { font-weight: var(--fw-black); font-size: 1rem; }
  /* Explore only (gradeByPlayable). Playable genera hold full ink wherever they sit, so they
     stay scannable off the spine — where the base rule would otherwise mute them along with
     the context clades. Non-playable genera recede to the mute end. */
  .node.genus.playable .lbl { fill: var(--ink); }
  .node.genus.nonplayable .lbl { fill: var(--node-nonplayable); }
  /* De-emphasized: genera-count is honest reference context in Explore, NOT a closeness signal
     (retired as such in the two-phase warmth work). Muted fill + regular weight so it recedes
     beside the clade name. */
  .count { fill: var(--ink-mute); font-size: 0.78rem; font-weight: var(--fw-regular); }
  /* fill is inherited into each <use>'s instanced path, so setting it on the glyph recolors
     the shape; inline style (resolved color) still wins over these structural defaults. */
  .glyph-bg { fill: var(--bg-page); }                        /* page-color backing disc */
  .node .glyph { fill: var(--node-context); }                /* off-spine context */
  .node.spine .glyph { fill: var(--spine); }
  .node.genus .glyph { fill: var(--node-frontier); }
  .node.clickable { cursor: pointer; }
  /* Link affordance — echoes the underline idiom used by the Explore "recent" trail. */
  .node.link .lbl {
    text-decoration: underline; text-decoration-thickness: 1px;
    text-underline-offset: 2px; text-decoration-color: var(--sand-400);
  }
  .node.link:hover .lbl { text-decoration-color: var(--turq); fill: var(--turq-dp); }
  /* clicked guess row -> ring the label of the shared/guessed node (fill+stroke set inline,
     colored by warmth). No dot ring — the label outline alone marks the selection. */
  .label-ring { stroke-width: 2; }
  .node.highlight .lbl { font-weight: var(--fw-black); }
  .zoom-controls {
    position: absolute; z-index: 5; right: var(--space-4); bottom: var(--space-4);
    display: flex; align-items: stretch; padding: 0;
    background: var(--bg-surface);
    border: 2px solid var(--btn-secondary-ink); border-radius: var(--radius-pill);
    overflow: hidden;
  }
  .zoom-controls button {
    display: flex; align-items: center; justify-content: center;
    width: 2.2rem; height: 2rem; font-size: 1rem; cursor: pointer;
    background: transparent; border: 0; color: var(--btn-secondary-ink);
    font-weight: var(--fw-bold);
  }
  /* hairline dividers between segments */
  .zoom-controls button + button { border-left: 1px solid var(--btn-secondary-ink); }
  .zoom-controls button:hover:not(:disabled) {
    background: color-mix(in srgb, var(--btn-secondary-ink) 12%, transparent);
  }
  .zoom-controls button:disabled { cursor: default; opacity: 0.5; }
  .tree-empty {
    color: var(--ink-soft); font-size: var(--type-body); padding: var(--space-6);
    flex: 1 1 auto; width: 100%; min-height: 200px;
    display: flex; align-items: center;
  }
</style>
