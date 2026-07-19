# Shared board layout + autocomplete direction — design

**Issue:** follow-up to #1 (desktop layout rework). Two scope items surfaced after #1 merged.
**Scope:** Desktop only. Narrow/responsive carried across but not redesigned (still #12).
**Date:** 2026-07-19

## Problem

Two consequences of the #1 desktop rework that weren't in its scope:

1. **Explore is still on the OLD layout.** The game moved to input-cluster-on-top / plaque
   floats top-right / tree owns the body. Explore still has search pegged at the BOTTOM with the
   "Recent:" trail below it and the detail card floating mid-right. They now share every piece
   (`SpineTree`, `SearchBox`, `SpecimenPlacard`) and byte-identical `rightInset` measurement logic,
   but arrange them differently. They should share the layout.
2. **The autocomplete menu opens UPWARD.** `SearchBox` opens its menu `bottom: 100%` because the
   input used to live in a bottom-pegged placard in both modes (the CSS comment says exactly this).
   After #1 the game's input is at the TOP, so an upward menu opens off the top of the input and gets
   clipped. Once Explore also moves to a top input, upward is wrong in both modes.

The two are coupled: #2's correct fix (open downward everywhere) is only unambiguous once #1's
top-input layout is applied to Explore too.

## Approach

**Extract a shared layout shell** (`BoardLayout.svelte`) that owns the region skeleton, the desktop
CSS, and the duplicated `rightInset` measurement. Both `GameBoard` and `Explorer` render it with
three snippets for their mode-specific content. **Flip the autocomplete menu downward** in the one
shared `SearchBox`, removing the now-obsolete upward special-case.

### BoardLayout.svelte — the shell

Owns, once:
- Region skeleton: `.cluster` (top band) → `.cluster-main` (mode content) + `.specimen-float`
  (placard, measured); `.tree-body` (fills the rest). All the desktop `@media (min-width: 641px)`
  region CSS from GameBoard.
- The `rightInset` measurement — currently duplicated verbatim in GameBoard (`specimenW`) and
  Explorer (`detailW`): measure the floating placard's `clientWidth`, gate on `isDesktop`
  (`matchMedia("(min-width: 641px)")`), add the `24 + 24` offset+gap. This logic is DELETED from
  both consumers and lives only here.
- A minimal narrow `@media (max-width: 640px)` collapse (single column: cluster stacks above the
  tree). NOTE: the existing narrow blocks in BOTH GameBoard and Explorer target `.middle`/`.bottom`
  — classes that no longer exist after #1 (GameBoard's was already the known-stale block deferred to
  #12). So there is nothing coherent to "carry across": the shell provides its OWN minimal correct
  single-column rule against its own class names (`.cluster`/`.tree-body`), and the dead
  `.middle`/`.bottom` narrow rules are DROPPED from both consumers rather than relocated. Narrow
  remains un-redesigned (#12 owns the real responsive pass); the shell just must not ship CSS
  referencing nonexistent classes.

Three snippets (mode content stays with each mode):

```svelte
<BoardLayout>
  {#snippet cluster()}     <!-- game: input row + Hint/Forfeit/budget + GuessList chips
                                Explore: SearchBox + Recent trail -->     {/snippet}
  {#snippet placard()}     <!-- the SpecimenPlacard; the shell measures its width -->   {/snippet}
  {#snippet tree(rightInset)}  <!-- <SpineTree {rightInset} ...mode-specific props... /> -->  {/snippet}
</BoardLayout>
```

The `tree` snippet receives `rightInset` as a **snippet parameter** (Svelte 5 supports parameterized
snippets). This is the seam: the shell measures the placard and passes the inset in, but each mode
keeps its own SpineTree props — game passes `guessWarmth`/`highlightId`/`linkLabels`/`showCounts:false`
/warmth coloring; Explore passes `nodeColor`/`gradeByPlayable`/`emptyLabel`. The shell never sees
those; it only owns geometry.

The shell binds the placard's `clientWidth` internally. Because the placard is itself a snippet, the
shell wraps it in the measured `.specimen-float` div and renders the snippet inside — so the
consumer supplies the placard content, the shell owns its position + measurement.

### What stays mode-specific (correct — not moved into the shell)

- **Cluster contents.** Game: end-state `.result` banner OR input-row (SearchBox + Hint + Forfeit +
  budget), then `GuessList` chips. Explore: `SearchBox` + the `Recent:` trail nav. These differ
  entirely; they're the `cluster` snippet's body in each consumer.
- **Placard view source + action.** Game: `specimenView(store.state, treeStore)` + a `New round`
  action snippet on end state. Explore: `nodeView(node)`, no action. These are the `placard`
  snippet's body.
- **SpineTree props.** All of them (listed above). The `tree` snippet's body.
- **All store/state/handlers.** Untouched in each consumer.

### SearchBox — open downward

- Menu opens BELOW the input: replace `bottom: 100%; margin-bottom` with `top: 100%; margin-top`.
- Delete the obsolete comment ("Opens UPWARD — the search box lives in a bottom-pegged placard…").
- Applies to both modes (one shared component, both now top-input). No direction prop — the case no
  longer varies.
- The `max-height` row cap + internal scroll stay as-is.

## Result

- Explore gains #1's arrangement: search + recent trail move to a top cluster; the detail placard
  floats top-right; the tree owns the body. Zoom control already carried over (it lives in SpineTree).
- Both modes render through one `BoardLayout`, so future layout changes stay in lockstep.
- Autocomplete opens downward in both, no clipping.
- `rightInset` measurement exists once instead of twice.

## Components touched (map, not a plan)

- **Create** `src/lib/game/components/BoardLayout.svelte` — the shell (skeleton + desktop CSS +
  rightInset measurement + 3 snippets).
- **Modify** `src/lib/game/components/GameBoard.svelte` — render `BoardLayout` with its three
  snippets; delete the region skeleton CSS + `specimenW`/`isDesktop`/`rightInset` logic now in the
  shell. Keep all game state/handlers/cluster contents.
- **Modify** `src/lib/explorer/components/Explorer.svelte` — render `BoardLayout` with its three
  snippets (search+recent cluster, nodeView placard, Explore-config tree); delete its own
  `detailW`/`isDesktop`/`rightInset` logic + old bottom-search skeleton. Keep Explore state/handlers.
- **Modify** `src/lib/game/components/SearchBox.svelte` — menu opens downward; drop the stale comment.

## Out of scope

- Narrow/responsive redesign. The shell ships a minimal correct single-column collapse (so it
  doesn't reference dead classes); the real responsive pass is #12. Dead `.middle`/`.bottom` narrow
  rules are dropped, not carried.
- The parent #1's deferred watch-item (static 22rem gutter) — inherited into the shell as-is;
  hardening it (drive from measured width) is optional and can ride here IF trivial, else stays
  deferred. Not a requirement of this spec.
