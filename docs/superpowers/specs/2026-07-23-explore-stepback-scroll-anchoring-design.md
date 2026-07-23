# Explore step-back: hold the camera, let the branch collapse in place ("coyote time")

**Status:** **approved** — Morgan approved all three design sections + the vertical-axis and
reset-trigger forks (resolutions inline below). Ready to write the implementation plan.
**Issue:** [#66](https://github.com/latrani/Mesozooa/issues/66). Related but strictly smaller than
the [#58](https://github.com/latrani/Mesozooa/issues/58) scope-C epic (topology-keyed FLIP
choreography) — this is a scroll-anchoring decision at the commit path, no new animation mechanism.
**Component:** `src/lib/game/components/SpineTree.svelte` (the fix lives entirely here; it activates
only in Explore, by construction — see "Why the game is untouched").

## The reported symptom

In Explore, when the tree is deep enough that the spine has scrolled off the left and the current
clades are pushed to the padded right edge (e.g. `#/explore?taxon=ankylosauria`), **stepping back**
to a shallower node (Thyreophora) makes the tree "collapse and Thyreophora basically jumps into
Ankylosauria's place." The transition is hard to read and fights the tree-motion legibility model —
animation is supposed to make tree-jumps *readable*, and here it does the opposite.

Crucially: when the tree is NOT at the right edge (short enough to fit), the same step-back looks
right — the subtree just collapses to the left, leaving empty space. So the bug is specific to the
scrolled/right-edge case.

## Root cause — two piled-on effects, both on the horizontal axis

Every tip change in Explore fires a hard **recenter** on the new tip. That is the tip-change
`$effect` (`SpineTree.svelte:640`) → `scrollTargetFor(tip)` → `centerOffsetFor`, which computes "put
this node's column at the center of the visible window." The FLIP scroll driver (`:234`) then lerps
`scrollLeft` from where-you-are to that centered target on the shared animation clock.

Worked example (viewport 1000px, specimen `rightInset` 300 → visible window 700, `X_GAP` 200):

- **At Ankylosauria (tip, depth 10):** recenter → `scrollLeft ≈ 1718`; Anky sits at screen-x ~350
  (middle of the visible strip), Thyreophora (one column shallower) at screen-x ~150.
- **Step back to Thyreophora (tip, depth 9):** recenter wants Thyreo at screen-x ~350 →
  `scrollLeft` drops to ~1518.

So `scrollLeft` drops ~200px, sliding the **entire tree ~200px rightward**. Thyreophora glides into
the exact screen slot Ankylosauria just vacated. **Stepping back produces forward/rightward motion** —
that is the "jumps into Ankylosauria's place," and it is what fights the legibility model: the camera
chases the shallower node instead of holding still while the branch collapses.

Two effects pile on at the right edge:

1. **The deliberate recenter slide** (~200px, the big one) — the FLIP scroll driver animating to a
   centered target that moved.
2. **Content-shrink clamp yank** — the collapse drops `layout.width` by the collapsed columns, so
   `contentWidth` shrinks (~200px/column, `:410`), which lowers the browser's native scroll-clamp
   ceiling (`scrollWidth − clientWidth`). Even with the deliberate slide removed, as the content's
   right edge passes under the frozen camera the browser yanks `scrollLeft` leftward. This is the
   "right-side padding shifts when the edge of the tree goes away" from the issue text.

## Why the non-edge case already looks right

Not a different code path — the **clamp**. When the tree fits, `scrollLeft` is pinned at 0 both
before and after (can't scroll left of the root), so the recenter is a no-op and the subtree simply
collapses away to the right, leaving empty space. That empty-space-on-the-right behavior is exactly
what we want; the fix generalizes it to the scrolled case.

## Why the game is untouched (by construction)

The fix lives in SpineTree, shared by game + Explore, but only *activates* in Explore. In the game
the tip is the warmest shared node, which **only ever deepens** across a session — it is never an
ancestor of the previous tip — so the step-back test below never fires. No game regression is
possible; the game's forward-follow recenter is unchanged. (Also: the FLIP scroll driver is already
gated on `atDefaultZoom`, `:214` — so is everything here.)

## The principle to encode

> **A step-back (new tip is an ancestor of the old tip) must never slide the tree forward
> (rightward) — but it must keep the newly-selected node on-screen. So: freeze the horizontal axis,
> keep the vertical axis "keep-visible" (pan only enough to bring the new tip into view), collapse
> the branch in place, and leave the right-side gap open until the user makes a deliberate
> recenter.** Forward/lateral navigation keeps today's follow-the-tip recenter.

> **Revision note (2026-07-23, post-implementation live testing):** The originally-approved principle
> said "hold the camera on **both** axes." Live browser testing (Task 6) showed that stranded the new
> tip completely off-screen after a deep step-back — the collapsed tree re-splays its vertical fan
> around a wholly different `layout.minY`, so a frozen `scrollTop` can leave the selected node scrolled
> off the top. That is worse than the original bug (which at least kept *something* in view). Approved
> correction: **freeze horizontal, keep-visible vertical.** The "both axes" text and its "known
> tradeoff" paragraph below are superseded by §1a. See also §1b for a THIRD scroll mover found in the
> same testing (`scrollFocusIntoView`) that the original two-effect analysis missed.

Three pieces are needed because there are **three** scroll movers, not two (the third — the
click-focus keep-visible pan — was found in live testing; see §1b).

---

## §1. Step-back detection & the camera hold

In the tip-change effect (`:640`), classify the move when the tip changes:

- **step-back** ⟺ new tip is a **proper** ancestor of the old tip:
  `newTip !== oldTip && treeStore.pathToRoot(oldTip).includes(newTip)`. Note `pathToRoot(id)`
  includes `id` itself (`src/lib/tree/mrca.ts:3`), so the `newTip !== oldTip` guard is required for
  the pure helper; the call site is additionally guarded by `tipId !== lastTipId` (`:644`), but the
  helper must not rely on that.
- **forward / lateral** — everything else (deeper tip, or a jump to a sibling/unrelated subtree):
  unchanged behavior, recenter as today.

On a **step-back** (corrected mechanism — see §1a for why this replaces "both axes"):

- Set `scrollTargetPx = null` so the FLIP scroll driver (`:234`) does not run (kills the ~200px
  deliberate recenter slide — the big horizontal mover).
- Skip the native `scrollToNode` / `resetZoom` recenter.
- Freeze `scrollLeft` (do not touch it).
- Apply a **vertical-only keep-visible** nudge to `scrollTop`: pan only if the new tip's row strays
  near/off a viewport edge, using the same per-axis keep-visible math `scrollFocusIntoView` already
  uses (§1c extracts it as a pure helper for reuse). This runs in the tip-change effect *after* the
  layout has settled, so it reads the new tip's final `posOf` position.

Result: the tree does not slide forward; the branch collapses in place; the new tip stays on-screen
vertically; and the right-side gap opens (via §2).

### §1a. Why "keep-visible vertical," not "hold both axes" (supersedes the original resolution)

The originally-approved design froze both axes. Live testing (Task 6, `taxon=ankylosauria` → two
step-backs at a 900px-wide viewport) showed **zero nodes left in the viewport**: the new tip
(Genasauria) landed at screen `(-80, -90)`. Cause: a step-back collapses the subtree and re-splays
the vertical fan around a different `layout.minY`, so the new tip's *pixel* y is nowhere near the old
tip's. Freezing `scrollTop` therefore points the camera at empty canvas. Keeping the vertical axis on
a keep-visible leash fixes this while still never sliding the tree forward horizontally — which is
the part of the legibility contract the issue actually cares about ("jumps into Ankylosauria's
place" is a *horizontal* forward slide).

### §1b. The third scroll mover: `scrollFocusIntoView` (found in live testing)

The original analysis modeled two movers (the recenter slide + the clamp yank). Live testing revealed
a third: **clicking a node to step back also focuses it**, and focus fires the ARIA keep-visible pan
`scrollFocusIntoView` (`onNodeClick → focusItem → onItemFocus → scrollFocusIntoView`, `:556`/`:531`).
That path is independent of the tip-change effect, fires synchronously on click *before* the effect,
and — because the clicked node sits near the left edge after a right-edge scroll — nudged the camera
~82px forward horizontally (measured: Thyreophora x 64 → 146). It also would fight the effect's new
vertical scroll.

**Resolution:** on a step-back click, suppress the click-focus keep-visible scroll so exactly ONE
path scrolls the viewport (the tip-change effect, computing against settled geometry). `onNodeClick`
sets a transient `suppressFocusScroll` flag when the click is a step-back — detected from the *current*
`tipId` (still the old tip at click time, before `onnodeselect` mutates the store) via `isStepBack`.
`scrollFocusIntoView` reads and clears the flag, early-returning without scrolling. Focus itself
(roving tabindex, the ring, keyboard readiness) is unaffected — only the scroll side-effect is
suppressed.

### §1c. Extract `keepVisible1D` (DRY)

`scrollFocusIntoView` already computes, per axis: "given a node coordinate, the current scroll offset,
the viewport length, a margin, and the max scroll — return the new scroll offset (unchanged if the
node is comfortably inside)." The step-back vertical nudge needs exactly that for the Y axis. Extract
the per-axis math into a pure `keepVisible1D` in `spine-layout.ts`, TDD-test it, and call it from both
`scrollFocusIntoView` (X and Y) and the tip-change effect's vertical step-back nudge (Y only). This
avoids a second copy of the edge math drifting from the first.

---

## §2. Coyote-time runway padding (the anti-yank)

§1 alone does not survive effect #2 (the content-shrink clamp yank). To keep the frozen `scrollLeft`
valid, the scrollable width must not shrink under the camera during the hold.

Mechanism — extend the existing runway. There is already a fixed-px runway spacer (`:414`, the
specimen clearance) that pads `scrollWidth` past the tree's right edge. Add a second, transient
contribution:

- New state `coyotePad` (px in **unscaled content space**, like `runway`/`contentWidth`), default 0.
- The scrollable-width computation (`runway`/`scrollWidth`, `:414`–`:417`) includes `coyotePad` (as
  an addend to `runway`, or a sibling spacer — implementation detail for the plan).
- On a **step-back**, set `coyotePad` to exactly the width lost this collapse:
  `(oldWidth − newWidth) * X_GAP`, where `oldWidth`/`newWidth` are `layout.width` before/after. This
  keeps `scrollWidth` ≥ its pre-collapse value, so the frozen `scrollLeft` remains inside the clamp
  and the browser does not yank it.
- **Consecutive step-backs EXTEND the hold (resolved):** a second step-back *adds* the newly-collapsed
  width to `coyotePad` rather than resetting it, so backing out multiple levels reads as one
  continuous camera hold.

The resulting gap is honest dead space to the right — exactly the "empty space, coyote time" the
issue asks for. It reads as "there's room here where the branch was," not as broken layout.

**Zoom scope (resolved):** coyote-padding is a **default-zoom-only** behavior, matching the existing
`atDefaultZoom` gate on the FLIP scroll driver (`:214`). Zoomed navigation already takes the native
path; we are not inventing a second zoom regime. `coyotePad` is measured in unscaled content px so
that if it ever coexists with a zoom it scales with the tree like `runway` does.

### Why "coyote time"?

**Coyote time** is the platformer-design trick where a character who runs off a ledge keeps hanging
in the air for a few forgiving frames before gravity takes hold — named for Wile E. Coyote, who
famously doesn't fall until he *looks down*. It's why jumps feel fair rather than frame-perfect
(Mario/Celeste-lineage games all do it).

The analogy is exact here, which is why the name is load-bearing rather than decorative:

- The right-side space **should** collapse the instant the branch does (gravity = the scroll clamp
  yanking it away).
- Instead we let it **hang there** — the runway pad holds the ground under the frozen camera.
- It only falls when the user **"looks down"** — makes a deliberate recenter/forward move, at which
  point `coyotePad` zeroes and the layout re-clamps normally (§3).

The state is named `coyotePad` (not `stepBackScrollPad`), and the code comment carries this
etymology so the intent survives future refactors.

---

## §3. Resetting the coyote pad

`coyotePad` snaps back to 0 (letting scroll re-clamp normally) on any deliberate recenter. The four
approved triggers collapse to essentially one rule plus the zoom-home button:

- **Manual recenter (⌂)** — `resetZoom()` zeroes `coyotePad`, then recenters on the tip. The explicit
  "put me back."
- **Forward navigation (deeper tip)** — the forward/lateral branch of the §1 classifier (the `else`
  of the ancestor test) zeroes `coyotePad` before recentering; the tree re-extends, so stale padding
  would strand dead space.
- **Search jump / history chip** — `jumpTo()` lands on an arbitrary taxon. By the ancestor test the
  target is not an ancestor of the old tip, so it flows through the same forward/lateral branch that
  zeroes the pad. No separate wiring — it falls out of the classifier.
- **Consecutive step-back** — the ONE case that does not reset; it extends `coyotePad` (§2).

So the reset rule is: **any non-step-back tip resolution zeroes `coyotePad`; `resetZoom` also zeroes
it.** Three of the four triggers are the same code path.

**Lateral-move edge (named):** a jump to a *sibling*/unrelated subtree (not ancestor, not descendant)
counts as non-step-back → zeroes the pad + recenters. That is correct: the user is navigating
somewhere genuinely new, so the "hold where you were" contract does not apply.

---

## Data flow summary

```
click a node (Explore)                 tip changes (Explore: explorer.highlightId)
   │                                            │
   ▼                                            ▼
onNodeClick: is this click a step-back?   classify move by isStepBack(store, lastTipId, newTipId)
(isStepBack from CURRENT tipId,                 │
 before onnodeselect mutates)              ┌────┴─────────────────────────────┐
   │ yes → suppressFocusScroll = true    step-back                    forward / lateral
   ▼                                       │                                  │
onnodeselect → store mutates              ├─ scrollTargetPx = null            ├─ coyotePad = 0
   │                                       ├─ skip native recenter            └─ recenter on tip
focusItem → onItemFocus →                 ├─ FREEZE scrollLeft (untouched)       (today's path)
scrollFocusIntoView:                       ├─ scrollTop = keepVisible1D(...)   ┌── resetZoom (⌂):
   if suppressFocusScroll → clear & return │  (vertical-only, settled posOf)   │    coyotePad = 0,
   else keepVisible1D on X and Y           └─ coyotePad += (oldW−newW)*X_GAP   │    then recenter
```

`coyotePad` feeds `runway`/`scrollWidth`, which the browser clamp and `scrollFade` already depend on.
`keepVisible1D` (§1c) is the shared per-axis edge math used by both `scrollFocusIntoView` and the
step-back vertical nudge. `suppressFocusScroll` (§1b) guarantees exactly one path scrolls per
step-back.

## Testing

Pure/logic seams to unit-test (Vitest), keeping with the project's "pure logic is TDD-tested"
agreement:

- **Move classifier** — extract a pure `isStepBack(store, oldTip, newTip): boolean` (proper-ancestor
  test via `pathToRoot`). Cases: direct parent (true), grandparent (true), the root (true), deeper
  descendant (false), sibling (false), unrelated subtree (false), same node (false — no-op), and
  `oldTip === null` first-mount (false).
- **Coyote-pad width math** — a small pure helper `coyotePadDelta(oldWidth, newWidth, xGap)` returning
  `Math.max(0, (oldWidth − newWidth) * xGap)` (clamp at 0 so a lateral/forward misclassification can
  never produce negative padding). Test the extend-accumulation contract at the call site.
- **Keep-visible edge math (§1c)** — a pure `keepVisible1D(coord, scroll, viewportLen, margin, maxScroll):
  number` returning the new scroll offset (unchanged when the node is comfortably inside the margins).
  Cases: node comfortably inside → returns `scroll` unchanged; node past the near (low) margin → pans
  so it sits at `margin`; node past the far (high) margin → pans so it sits at `viewportLen − margin`;
  result clamped to `[0, maxScroll]` at both ends. This is the extraction of the current
  `scrollFocusIntoView` per-axis arithmetic (`:513`–`:522`), so the refactor is behavior-preserving —
  the existing X/Y calls must produce identical results after switching to the helper.

SpineTree itself is validated by build + running (Svelte component). Manual verification (done live in
Task 6 via Playwright, measuring scroll offsets + node screen positions), at default zoom in Explore,
narrow viewport (~900px) so the right-edge scroll case actually reproduces:

1. `#/explore?taxon=ankylosauria`, step back to Thyreophora → tree collapses in place; `scrollLeft`
   frozen (no forward slide — Thyreophora does NOT jump toward Ankylosauria's old column);
   `scrollWidth` held (no clamp yank); right-side gap opens; the new tip stays on-screen.
2. Step back again (Thyreophora → Genasauria) → `scrollLeft` hold extends, `scrollWidth` still held,
   and the new tip remains visible (vertical keep-visible pans if needed — it must NOT be scrolled
   off-screen; this is the §1a regression the "both axes" version failed).
3. Press ⌂ → `coyotePad` zeroes (`scrollWidth` shrinks back), recenters on the tip, gap closes.
4. From the held state, search-jump to an unrelated taxon → recenters cleanly, no stale gap.
5. Confirm the short-tree (non-scrolled) case is unchanged.
6. Confirm the game is unaffected (tip only deepens; classifier never reports step-back).

Also run `npx tsc --noEmit` and `npx svelte-check` before commit (`verbatimModuleSyntax` is on).

## Scope boundary vs #58

This spec does NOT introduce topology-keyed edge phase envelopes, grow-in/shrink-out, or
retract-then-extend spine choreography. It only changes *where the camera points* (and *whether the
scrollable width shrinks*) at the step-back commit path. The node FLIP itself is untouched. If the
straight-line collapse still isn't satisfying after this, that richer choreography is #58's job.
