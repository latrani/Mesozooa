# Keyboard-accessible cladogram + a11y sweep

**Status:** design · **Date:** 2026-07-20 · Closes
[#21](https://github.com/latrani/Mesozooa/issues/21)

## Problem

Two programmatically-addressable accessibility gaps, one large and one small.

**#21 (large) — the tree has no keyboard path AND no perceivable structure.** In
`SpineTree.svelte`, each clickable node is a `<g class="node clickable">` with `onclick`
but no `tabindex`, no `role`, and no key handler (the `a11y_click_events_have_key_events`
and `a11y_no_static_element_interactions` warnings are suppressed at lines 404-405). So the
tree is mouse-only. Worse, the whole thing sits inside `<svg role="img" aria-label="Cladogram">`,
which collapses the entire interior into one opaque image for assistive tech — labels,
counts, and structure are all invisible. For a cladogram *explorer* whose content IS the
tree, that's the bigger loss.

Keyboard users are not fully stranded today: the search box picks any taxon, the
`WarmestTrail` crumbs are focusable buttons that pan, and guess chips select nodes. But none
of those let a user *perceive or walk the tree as a tree*, which is the point of the app.

**Mechanical (small) — two hard/near-hard axe failures the linter misses:**
- `SearchBox.svelte:23` — the guess input has only a `placeholder`, no accessible name
  (WCAG 4.1.2).
- `App.svelte:77-79` — the Daily/Practice/Explore tabs signal the active tab with a CSS
  class only; nothing exposes current-ness to assistive tech (WCAG 1.3.1 / 4.1.2).

## Approach: a parallel semantic DOM tree

Rejected: bolting the WAI-ARIA tree pattern onto the SVG `<g>` elements directly. The SVG is
a flat, spine-and-fan layout (`layoutSpine`), not a nested hierarchy; expressing tree
structure on it needs `aria-owns`/`aria-level` (spotty in WebKit, which this project targets
hard) and the arrow-key semantics don't map — depth-first "next item" and visual up/down
differ because fans splay above AND below the axis. And expand/collapse isn't a real
operation here (the revealed set is externally controlled by game/Explore state), so
`aria-expanded` as a toggle would be fictional.

Chosen: the standard "accessible SVG" technique. Render a **second, visually-hidden
`<ul role="tree">`** of the same revealed nodes in their *real* parent→child nesting, and
mark the SVG `aria-hidden="true"`. Because that DOM genuinely IS a nested tree, the APG tree
pattern drops on with no fighting: no `aria-owns`, no spatial geometry, no fictional
expand/collapse.

**Doctrine note.** "One tree, one source of truth" governs game *feedback data* (every cue
is a node pointer). It does not forbid multiple *renderings* of the same nodes — the guess
list, the trail, and the SVG are already three. The a11y tree is a fourth rendering of the
same node objects, consistent with the established pattern.

## The accessibility layer

### DOM shape

```
<div class="tree-viewport">
  <svg aria-hidden="true"> …spine + fans, geometry unchanged… </svg>

  <ul role="tree" aria-label="Dinosaur cladogram">   <!-- sr-only -->
    <li role="treeitem" aria-expanded="true" aria-selected="false" tabindex="-1">
      Dinosauria, 1813 genera
      <ul role="group">
        <li role="treeitem" aria-expanded="true" aria-selected="false" tabindex="-1">
          Saurischia, 900 genera
          <ul role="group">
            <li role="treeitem" aria-selected="true" tabindex="0">Tyrannosaurus</li>
            …
          </ul>
        </li>
      </ul>
    </li>
  </ul>
</div>
```

- The tree mirrors the **exact `revealed` set** the SVG draws, nested by real parent→child.
  Revealed is always a connected subtree from the root (`layoutSpine` requires
  `revealed.has(rootId)`), so nesting is always well-formed; as a safety net the builder
  attaches any node to its nearest revealed ancestor.
- `aria-expanded` is derived, no extra data needed, and honestly mirrors the SVG:
  - genus leaf → no `aria-expanded`;
  - clade with rendered children (`children.length > 0`) → `aria-expanded="true"`;
  - clade with **no** rendered children → `aria-expanded="false"`. This is a *frontier*
    clade — revealed, but its children aren't (the visual "more here" fading stub,
    `isExpandable` at `SpineTree.svelte:133`). `false` honestly says "structure continues
    here, not shown." It's never toggled by a collapse gesture; it reflects the reveal
    frontier.
  - **Parity holds across modes.** In the game, neither a sighted click nor Enter expands a
    frontier clade (reveal is guess-driven) — both audiences see "more here" without an
    expand action. In Explore, both DO expand it: a click / Enter re-centers on the node,
    which reveals its children. So `aria-expanded="false"` + activate behaves identically to
    the mouse in each mode.
- Label text = `displayName(node.name)` plus, for clades, `", N genera"` (the
  `descendantGenusCount`, spoken, matching the visible count `<tspan>`).
- `aria-selected` marks the committed highlight (the `highlightId` prop) so AT can announce
  which node the app currently considers selected.

### Data source — a new pure helper

`a11yTree(treeStore, revealed, yOf): A11yNode[]` in a new `src/lib/game/a11y-tree.ts`,
beside `spine-layout.ts`, TDD-tested. Returns the nested structure:

```ts
interface A11yNode {
  id: string;
  name: string;
  isGenus: boolean;
  descendantGenusCount: number;
  children: A11yNode[];
}
```

`yOf: (id: string) => number` is the visual y-position lookup, sourced from the
`layoutSpine` output (`Map(layout.nodes.map(n => [n.id, n.y]))`). **Each node's `children`
are ordered by visual `y` ascending (top→bottom on screen), name as the deterministic
tiebreak** — see the traversal-order decision below. A node in `revealed` but absent from
the layout (shouldn't happen — the a11y tree and SVG share the same `revealed` — but as a
safety net) sorts last by a `+Infinity` y.

Plus a `flattenVisible(roots): A11yNode[]` helper giving depth-first order (respecting the
above sibling ordering) for ↑/↓ and Home/End. Both pure and unit-tested; the Svelte
component only renders and wires keys.

### Traversal-order decision — depth-first, siblings by visual y

↑/↓ walk the tree **depth-first**, NOT by raw visual y-position. This is deliberate and
load-bearing for screen-reader coherence:

- A valid `role="tree"` is nested by parent/child, so its DOM order is inherently
  depth-first, and browse/virtual-cursor reading (how many SR users survey a region)
  follows that DOM order regardless of our key handling. The tree role also *promises*, via
  `aria-level` and position-in-set, that ↑/↓ walks the hierarchy in reading order.
- Ordering ↑/↓ by raw visual y would make focus jump between *different branches* that
  happen to sit adjacent on screen — coherent to a sighted eye watching the ring, but
  directly contradicting the structure the role advertises. So we keep ↑/↓ hierarchical.

We recover most of the *visual* smoothness without breaking that promise by **ordering each
node's children top-to-bottom by their visual y**. Depth-first then moves down-the-screen
within each sibling group; the ring still changes column when descending into a deep subtree
(inherent, unavoidable), but never teleports arbitrarily. This is as spatially smooth as a
hierarchy-honest traversal can be, and it keeps the screen-reader mental model intact.

### Key bindings (WAI-ARIA APG tree, verbatim)

| Key | Action |
|-----|--------|
| ↓ / ↑ | move focus to next / previous item, depth-first (siblings ordered top-to-bottom by screen position — see traversal-order decision) |
| → | if the focused node has children, move focus to its first child |
| ← | move focus to the parent node |
| Enter / Space | **activate**: `onnodeselect(focusId)` — identical to a mouse click (game: select/inspect · Explore: re-center · end-state: Explore portal) |
| Home / End | move focus to first / last visible item |
| Tab / Shift+Tab | leave the tree (roving tabindex = single tab stop) |

No type-ahead (the search box already does taxon type-ahead — redundant). No user
collapse/expand (the revealed set is externally controlled).

### Focus behavior — internal focus cursor, focus-follows-highlight

Keyboard focus is tracked by **SpineTree-internal state** `focusId`, NOT the `highlightId`
prop. This is load-bearing: in Explore, `tipId` and `highlightId` are the *same* value
(`Explorer.svelte:61-62`), and `tipId` drives `layoutSpine`. Routing keyboard focus through
`highlightId` would relayout the whole tree on every arrow keystroke. Keeping `focusId`
internal means moving focus is cheap in BOTH modes and needs **no new component prop**.

- **Roving tabindex:** exactly one `<li>` has `tabindex="0"` (the `focusId` node), the rest
  `-1`. Arrow handlers update `focusId` and call `.focus()` on the new item.
- **Focus-follows (the chosen UX):** whenever `focusId` changes, the SVG lights that node's
  ring and scrolls it into view — cheap, no relayout, because it touches neither `tipId` nor
  `highlightId`. The existing highlight-ring machinery renders for `focusId ?? highlightId`
  (keyboard cursor wins; else the committed prop highlight). Scroll-into-view reuses the
  internal `scrollToNode` path (not `panTo`, which resets zoom).
- **Enter/Space commits** via the existing `onnodeselect` — same callback a click uses. In
  Explore that re-centers (relayout); an `$effect` keyed to the rebuilt tree restores DOM
  focus to the activated node (now the tip) so the keyboard position survives the relayout.
- Initial `focusId` on first focus into the tree = the current `highlightId`, else `tipId`,
  else the first item.

### SVG changes

- The root `<svg>` becomes `aria-hidden="true"` (drop `role="img"` / `aria-label`) — it is
  now the decorative visual layer.
- The node `<g>` keeps `onclick` as a pointer convenience. Because the SVG is `aria-hidden`
  and the keyboard path lives in the parallel tree, the remaining
  `a11y_click_events_have_key_events` suppression is re-commented as an **intentional,
  documented** decision (pointer layer; keyboard handled by the `role="tree"` sibling), not a
  TODO. This legitimately closes #21: a keyboard path now exists.
  - *Optional stretch, if we want zero suppressions:* hoist click handling to a single
    delegated handler on the (aria-hidden) `<svg>` that hit-tests to a node id. Deferred as a
    micro-cleanup; not required to close #21.

## Mechanical fixes (same PR)

- `SearchBox.svelte` — add `aria-label` to the `<input>` (e.g. "Search dinosaurs"),
  overridable via a prop so the game and Explore can name it precisely.
- `App.svelte` — add `aria-current="page"` to the active `.modes` button.

## Testing

- **Pure (Vitest, TDD):** `a11y-tree.ts` — nesting matches revealed parent→child; siblings
  ordered by visual `y` (name tiebreak); genus vs clade classification; counts; a revealed
  clade with unrevealed children appears as a *childless clade* node (frontier, drives
  `aria-expanded="false"` — not omitted, not reclassified as a genus); `flattenVisible`
  depth-first order honoring the sibling ordering; orphan-attachment safety net; empty
  revealed → empty.
- **Component (build + manual, per project convention):** Svelte compiles clean;
  `npx svelte-check` passes with the single documented suppression; keyboard walk-through in
  the gallery harness (Tab in, arrows move + SVG ring follows, Enter commits in both game and
  Explore, focus survives Explore re-center); VoiceOver spot-check announces role/level/name.

## Out of scope

- A *visible* second tree panel (sr-only only).
- Type-ahead inside the tree; user-driven collapse/expand.
- Spatial arrow-key navigation of the SVG geometry itself.
- The delegated-click SVG refactor to reach zero suppressions (optional stretch above).
- **Tree-transition animation** (focus-ring gliding, Explore relayout FLIP) — deferred to
  [#52](https://github.com/latrani/Mesozooa/issues/52). The keyboard nav here *creates* the
  discontinuities that motion-as-continuity would smooth, so the two are linked, but the
  animation is a meaty separate effort and rides the dedicated look-and-feel pass. The
  focus-follows scroll is already reduced-motion-gated; nothing else animates yet.
