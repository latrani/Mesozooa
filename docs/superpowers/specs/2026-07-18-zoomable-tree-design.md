# Zoomable Tree (Issue #5) — Design

## Goal

Let the player zoom the cladogram in both the game (Daily/Practice) and Explore. The headline
use is **zooming out** to read the overall shape of a big tree; zooming in for detail is a
secondary convenience. Zoom is transient inspection state: any navigation, or the reset button,
returns to the default view.

## Scope

- Element-level zoom on `SpineTree.svelte`, the shared tree component both the game
  (`GameBoard`) and Explore (`Explorer`) render. One implementation, both inherit it.
- Default view is unchanged: natural 1:1 size, auto-centered on the frontier.

## Non-goals

- No rotate gesture (the library offers one; we don't want it).
- No persisted zoom (it never survives a navigation, so nothing to store).
- No change to the default/auto-center behavior.
- No double-tap-to-zoom (possible future; omitted for YAGNI).
- Not the separate keyboard tree-navigation backlog item, though the new zoom buttons are
  themselves keyboard-operable.

## Locked decisions

- **Inputs:** touch two-finger pinch, trackpad pinch (`ctrl`+`wheel`), and an on-screen control
  cluster.
- **Controls:** a horizontal cluster `[ − ⌂ + ]` (zoom out, reset-to-default, zoom in), floated
  at the **bottom-right** of the tree canvas, layered above the specimen float, same placement in
  both modes.
- **Bounds (module constants, tunable):** `ZOOM_MIN = 0.1`, `ZOOM_MAX = 3`, default `ZOOM_DEFAULT
  = 1.0`.
- **Reset to default fires on:** the ⌂ button, and on any navigation. Every navigation already
  routes through one of two points, so reset hooks those rather than adding new event wiring:
  - a `tipId` change (a new guess in the game; focusing a node in Explore), handled in the
    existing auto-center `$effect`, and
  - a `panTo(id)` call (the guess-list breadcrumbs and the warmest-trail crumbs).
- **Zoom origin:** pinch zooms around the gesture centroid (the point under the fingers stays
  put); the buttons zoom around the viewport center.

## Architecture

All zoom logic lives inside `SpineTree.svelte`. `GameBoard` and `Explorer` need no new props;
they already own the `panTo` calls that trigger reset.

### Rendering: scale the SVG, pan with native scroll

The SVG already renders at `width = scrollWidth`, `height = vbH`, with a matching `viewBox` in
unscaled coordinates, inside an `overflow:auto` scroller. Zoom multiplies the rendered size:

- Rendered size becomes `scrollWidth * zoom` by `vbH * zoom`; the `viewBox` stays in unscaled
  coordinates, so the browser scales the drawing.
- Because the rendered element grows/shrinks, the existing scroll container keeps handling all
  **panning** natively (one-finger drag, two-finger scroll, wheel, trackpad two-finger scroll).
- `centerOffsetFor` / the auto-center `scrollTo` math multiplies node pixel positions by `zoom`.
- When `zoom` shrinks the tree below the viewport, the tree is centered in the canvas rather than
  pinned to a corner.

`touch-action: pan-x pan-y` on the scroller keeps one-finger panning native while the pinch
handler owns two-finger zoom. Trackpad `ctrl`+`wheel` is `preventDefault`ed so the page itself
never zooms.

### Gesture source: `@use-gesture/vanilla`, pinch only

Add `@use-gesture/vanilla` and use only its `PinchGesture`, bound to the scroller. It unifies
touch two-finger pinch and trackpad `ctrl`+`wheel` into one handler and, importantly, does not
force `touch-action: none` or disable native scrolling, so panning stays native. It also absorbs
the fragile cross-browser trackpad-wheel normalization (deltaMode, delta capping, speedup) that
is the main reason not to hand-roll this.

The handler feeds a single `applyZoom(nextZoom, originClientXY)` entry point (see below). The
library is used for the raw gesture only; our own state is the source of truth for the zoom
factor.

### One zoom entry point

A single function is the sole mutator of zoom, so pinch and buttons share identical clamping and
centering:

```
applyZoom(nextZoom, origin):
  z = clampZoom(nextZoom)                 // [ZOOM_MIN, ZOOM_MAX]
  adjust scrollLeft/scrollTop so `origin` (client x/y) stays over the same tree point
  zoom = z
```

- Pinch handler: `origin` = gesture centroid.
- `+` / `−` buttons: `origin` = viewport center, `nextZoom = zoom * STEP` / `zoom / STEP`.
- `⌂` button and every reset trigger: `zoom = ZOOM_DEFAULT` and re-run the normal auto-center.

## Pure helpers (TDD-tested)

Extracted so the tricky math is unit-tested without the DOM:

- `clampZoom(z): number` — clamp to `[ZOOM_MIN, ZOOM_MAX]`.
- `zoomStep(z, dir): number` — multiplicative step for the buttons, pre-clamp.
- `scrollForZoom({ origin, oldZoom, newZoom, scrollPos, ... }): { left, top }` — the scroll
  offset that keeps `origin` fixed under the pinch, and centers when the content is smaller than
  the viewport. This is the one piece of genuinely error-prone geometry.

The gesture wiring, the `PinchGesture` binding, and the control cluster are validated by running
the app plus Playwright (ctrl+wheel is directly simulable; touch pinch via synthetic pointer
events), then eyeballing screenshots.

## Implementation wrinkle to resolve first

`SpineTree` currently sets `.tree { min-width: max-content }` (added to fix "tree too small").
That rule would **block zoom-out** below the intrinsic content width. The implementation must
neutralize it while zooming (e.g. drive an explicit `width = contentWidth * zoom` and stop
`min-width` from pinning it), while preserving the original behavior at `zoom = 1`. Nail this
with a quick spike before building the rest.

## Accessibility

The control cluster is real `<button>` elements: keyboard-focusable, `Enter`/`Space` operable,
with `aria-label`s ("Zoom out", "Reset zoom", "Zoom in"). This gives mouse-only and
keyboard users a full path to every zoom action, since they cannot pinch.

## Testing

- Pure helpers (`clampZoom`, `zoomStep`, `scrollForZoom`): TDD unit tests.
- Gesture + control behavior: manual run + Playwright, verifying zoom in/out bounds, reset via
  button, reset on a new guess (game) and on a node focus (Explore), and that one-finger pan
  still works.
- Regression: existing `SpineTree` scroll/auto-center behavior at `zoom = 1` unchanged.

## Dependency note

Adds one focused runtime dependency, `@use-gesture/vanilla` (~7–8 KB gzipped, `PinchGesture`
import tree-shaken), chosen to avoid owning the fragile cross-browser trackpad-wheel
normalization.
