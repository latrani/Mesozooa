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

> **A step-back (new tip is an ancestor of the old tip) must never move a persisting node in the
> forward direction. Hold the camera on both axes, collapse the branch in place, and leave the
> right-side gap open until the user makes a deliberate recenter.** Forward/lateral navigation keeps
> today's follow-the-tip recenter.

Two pieces are needed because there are two piled-on effects.

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

On a **step-back**:

- Set `scrollTargetPx = null` so the FLIP scroll driver (`:234`) does not run.
- Skip the native `scrollToNode` / `resetZoom` recenter.

Result: `scrollLeft` **and** `scrollTop` both stay frozen while the existing node FLIP glides the
persisting nodes — including the now-tip — to their collapsed positions around the fixed camera. The
branch shrinks in place; nothing slides forward.

**Vertical axis — resolved: hold both axes.** The recenter effect sets both `scrollLeft` and
`scrollTop`, and a step-back re-splays the vertical fan around the new tip (spine nodes sit at
grid-y 0, but their *pixel* y depends on `layout.minY`, which shifts as the subtree collapses). We
freeze both axes for the cleanest statement of the principle ("persisting nodes don't move forward"
applied uniformly).

**Known tradeoff (named, not a surprise):** with both axes held, if the vertical fan re-splays hard
the tip can drift up/down on screen as `minY` shifts — the camera is frozen, so a node whose pixel-y
moves will appear to move. In practice Explore's spine is vertically shallow at any given depth, so
this is expected to be minor. If it ever bites, the fallback is "hold horizontal, keep-visible
vertical" (nudge `scrollTop` only when the tip strays near a viewport edge, reusing
`scrollFocusIntoView`); we are NOT building that now.

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
tip changes (Explore: explorer.highlightId)
        │
        ▼
classify move by treeStore.pathToRoot(lastTipId).includes(newTipId)
        │
   ┌────┴─────────────────────────────┐
 step-back                       forward / lateral
   │                                   │
   ├─ scrollTargetPx = null            ├─ coyotePad = 0
   ├─ skip native recenter             └─ recenter on tip (today's path)
   │  (freeze scrollLeft + scrollTop)
   └─ coyotePad += (oldWidth−newWidth)*X_GAP   ┌── resetZoom (⌂):
                                                │     coyotePad = 0, then recenter
                                                └── (independent of the classifier)
```

`coyotePad` feeds `runway`/`scrollWidth`, which the browser clamp and `scrollFade` already depend on.

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

SpineTree itself is validated by build + running (Svelte component). Manual verification, at default
zoom in Explore:

1. `#/explore?taxon=ankylosauria`, step back to Thyreophora → tree collapses in place, camera holds,
   right-side gap opens; nothing slides forward.
2. Step back again (Thyreophora → Genasauria/Ornithischia) → hold extends, no yank.
3. Press ⌂ → recenters, gap closes.
4. From the held state, search-jump to an unrelated taxon → recenters cleanly, no stale gap.
5. Confirm the short-tree (non-scrolled) case is unchanged.
6. Confirm the game is unaffected (tip only deepens; classifier never reports step-back).

Also run `npx tsc --noEmit` and `npx svelte-check` before commit (`verbatimModuleSyntax` is on).

## Scope boundary vs #58

This spec does NOT introduce topology-keyed edge phase envelopes, grow-in/shrink-out, or
retract-then-extend spine choreography. It only changes *where the camera points* (and *whether the
scrollable width shrinks*) at the step-back commit path. The node FLIP itself is untouched. If the
straight-line collapse still isn't satisfying after this, that richer choreography is #58's job.
