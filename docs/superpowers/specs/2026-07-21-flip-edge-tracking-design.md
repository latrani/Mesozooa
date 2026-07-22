# Relayout FLIP: edges (and stems/stubs) must track animated node positions

**Status:** **approved** — Morgan reviewed the three flagged questions (resolutions below).
Ready to implement (edge-tracking scope only; retract-then-extend deferred to the scope-C epic).
**Issue:** follow-up to #52 (relayout FLIP). File as a new issue on implementation.
**Component:** `src/lib/game/components/SpineTree.svelte`

## The two reported symptoms

Both observed with the animation speed turned down (they're brief at the shipped 200ms):

1. **Click the node just above the current tip → the whole spine "connects to it immediately,
   then everything moves to bring the spine back under center." Jumpy/weird.**
2. **On collapse, nodes below the collapse "detach from their branches and reattach"** as the tree
   redistributes.

## Root cause — ONE bug, two viewing angles (verified)

The relayout FLIP animates the **node glyphs** (they render from the animated `displayed` list —
persisting nodes lerp old→new pixel positions on the shared clock). But **every tree-*line*
primitive still draws from final layout geometry**, not the animated positions:

- **Branch edges** — `edgePath(parentId, childId)` (SpineTree.svelte:413) reads `posOf` (final) +
  `px`/`py`; the `{#each layout.edges}` block (:757) renders them. So on frame 0 of a relayout,
  every branch snaps to its destination shape while the glyphs are still gliding toward it.
- **Spine-segment gradients** (:741–753) — `x1={px(p.x)} x2={px(c.x)}` from final `posOf`.
- **Root "stem"** (:756) — `py(0)` depends on `layout.minY`, which shifts on re-anchor, so the stem
  height snaps too.
- **Collapsed-clade "more here" stubs** (:765–769) — `translate(px(n.x) py(n.y))` from final
  `layout.nodes`.

That single fact IS both symptoms: the spine appears connected to the new tip immediately
(symptom 1 — the branch is drawn at final geometry while nodes catch up), and branches sit at
their new positions while their nodes glide in/away (symptom 2 — the "detach/reattach"). There is
no second bug.

## Fix: route the line primitives through the animated positions

Derive an animated pixel-position map from `displayed` and have edges, gradients, the stem, and the
stubs read it instead of `posOf`/`px`/`py`:

```
let displayedPos = $derived(new Map(displayed.map(d => [d.id, d]))); // id -> {x, y, opacity}, PIXELS
```

Then:
- `edgePath` takes animated endpoint positions (from `displayedPos`) instead of looking up `posOf`
  and applying `px`/`py`. **Critical:** `displayed` positions are ALREADY in pixel space
  (`layoutPos` bakes `px`/`py` in at :159), so the edge code must NOT re-apply `px`/`py` — just use
  `d.x`/`d.y` directly. This is the easiest thing to get wrong.
- The spine `<linearGradient>` `x1`/`x2` read the same animated x's, so the color blend stays glued
  to the moving segment (if the path animates but the gradient stays at final columns, the color
  visibly detaches — they must share one source).
- The stem's `py(0)` term and the stubs' `translate` read animated positions too (the stem is part
  of the same snap family via `layout.minY`; the stubs are the literal "detach on collapse" artifact).

**Reduced motion / first mount need NO special-casing:** at `flipProgressTween = 1`, `displayed`
already equals the final layout, so edges-from-`displayed` are identical to today's final-geometry
edges, instantly. The existing instant path stays correct for free.

## Gotchas the implementation MUST handle (verified)

1. **Pixel space, not grid.** `displayed` is already pixels — do not double-apply `px`/`py` to it.
   (Severity: high — silent wrong geometry if missed.)
2. **Edge opacity.** Edges have no opacity today. An edge to a *fading-in entering* node would be a
   solid branch reaching to a ghost node. Give each edge `min(parentOpacity, childOpacity)` (or the
   child's opacity) from `displayedPos`, so the branch fades in with the node it reaches. (Severity:
   medium — the most likely "still looks off" residue if positions are fixed but opacity isn't.)
3. **Endpoint presence is safe.** Every `layout.edges` endpoint is a `layout.nodes` entry, and in a
   relayout each is either persisting or entering — both are in `displayed`. Leaving nodes are gone
   from `layout.edges`, so no edge references a missing node. Still, guard the lookup defensively
   (skip an edge whose endpoint isn't in `displayedPos`) rather than assume.
4. **Perf is fine.** Rendered edges ≈ rendered nodes − 1 (tens to low-hundreds; Explore draws only
   the revealed subset). Making the edge `{#each}` depend on the per-frame `displayed` doubles the
   already-happening per-frame node re-render — same order of work. No concern at this scale.

## THE design decision for Morgan — entering-child edge asymmetry

**This is the one real choice; the rest is mechanical.**

Entering nodes do NOT glide — they sit at their final position and fade in (by design). Persisting
nodes glide. So an edge from a **gliding** persisting parent to a **static** entering child has one
endpoint moving, one pinned. That's *coherent* — the branch rubber-bands out from the arriving
parent to the already-placed new child — but it's asymmetric motion, not both-ends-gliding.

Options:
- **(A) Leave entering nodes static (fade only), edges rubber-band.** Simplest; matches the current
  entering-node design. The branch grows/stretches from the moving parent to the fixed new child.
- **(B) Make entering nodes glide too** (from their parent's position, say), so edges have both ends
  moving. More coherent motion, but it's scope-C territory (the "grow-in from parent" choreography
  we explicitly deferred) — bigger change, own decision.

My recommendation: **(A) for this fix** — it removes the reported artifact with the least risk and
doesn't drag in deferred scope. (B) is a real future polish but shouldn't gate fixing the wrinkle.

## THE scope call for Morgan — does edge-tracking fully satisfy symptom 1?

Your symptom-1 expectation was worded as a *choreography*: "the spine end shifts back to the parent
we're pivoting from, then lands on the new node once it's in place." That's a **two-phase,
path-aware** animation (retract the branch to the fork/LCA, then extend a new one) — materially more
complex than edge-tracking and it does NOT fall out of the FLIP model for free (it'd need per-edge
phase envelopes keyed to the pivot LCA).

**Edge-tracking (this spec) satisfies the *complaint* but not the *literal proposed motion*:** the
branch endpoints interpolate continuously with the gliding glyphs, so the spine bends/slides to
follow the nodes instead of snapping to the final tip. Nothing connects to the new tip position
until the nodes actually arrive there — which directly kills the "connects immediately, then
everything moves" jab. But it reads as a smooth reposition, not an explicit retract-then-grow
gesture.

**Resolved:** ship edge-tracking now; the retract-then-extend choreography moves to the **scope-C
epic** (see *Resolutions*). Morgan's insight: retract-then-extend is *parent/LCA-anchored* edge
motion — the same topology-aware character as scope-C's grow-in-from-parent and shrink-out-toward-
parent. All three want the same mechanism (per-edge phase envelopes keyed to tree topology, not
straight-line endpoint interpolation), so they belong together as one coherent feature rather than
three separate deferrals.

## Testing

- `edgePath` stays pure-ish (takes positions in, returns a path string) — its path math is unit-
  testable if we pass positions as args; add a test if the signature changes to take two `Point`s.
- Motion is DOM/visual → live-verify via Playwright + your eyes: during a relayout, sample an edge's
  path `d` over frames and confirm its endpoints track the gliding node positions (not snapped to
  final on frame 0); confirm reduced-motion still instant; confirm no gradient/color detach.
- `tsc --noEmit` + `svelte-check` before commit.

## Resolutions (Morgan, 2026-07-21)

1. **Entering-child asymmetry → (A) rubber-band.** Entering nodes stay static+fade; edges rubber-band
   from the gliding parent to the fixed new child. Making entering nodes glide is scope-C.
2. **Retract-then-extend spine choreography → deferred to the scope-C epic** (not this fix). It's the
   same topology-anchored motion as grow/shrink; grouping them shares the mechanism. Edge-tracking
   ships now and is expected to remove the reported jarring; if the deliberate gesture is still wanted
   after seeing it, it's already captured in the epic.
3. **Edge opacity → yes, edges fade with entering nodes.** Use the child's opacity (the branch fades
   in with the node it reaches). `min(parent,child)` is fine too if simpler in practice; child-opacity
   is the intent.

All three resolved → this spec is approved for implementation at **edge-tracking scope**. Next step:
writing-plans, then execute. The deferred topology-aware choreography (grow-in, shrink-out, spine
retract-then-extend) is tracked in the scope-C epic **[#58](https://github.com/latrani/Mesozooa/issues/58)**.
