# Selectable node info panel in game mode (#69)

## Problem

During play, the tree shows revealed nodes (the warm spine plus off-spine branches of
guessed lineages) but clicking one does nothing — the `onnodeselect` hook is only wired at
end state, where it jumps into Explore. A player who wants to inspect a genus or clade they
have already revealed (its photo, clue, clade size, Wikipedia link) can't. Explore already
does exactly this via `nodeView()` + `SpecimenPlacard`; the game just doesn't turn it on.

Issue #69: let me select nodes (genus or clade) in the tree and see their info panel,
stacked below the blank guess/specimen panel, scrolling together. A new guess clears the
selection.

## Non-leak: why "revealed only" needs no clue-suppression

The obvious worry — that reading a genus's Lived/Found-in clue mid-game leaks the answer —
does not apply here. `layoutSpine` (`src/lib/game/spine-layout.ts`) filters every child
through `revealed.has(c.id)`, so **the only nodes rendered during play are the revealed
set**. There is nothing unrevealed to click. A revealed genus is one you chose to guess, and
its clue tells you nothing about the target's clue beyond the MRCA already drawn on the
spine. Clade ancestors carry no clue rows at all (`nodeView` emits clue fields only when
`node.isGenus`). So the panel is Explore's `nodeView()` unchanged — no game-specific
gating.

## Behavior

### Selection model — one unified selection

`GameBoard` holds a single `selectedId: string | null`. It is the one selection for both
tree nodes and guess chips (unified per design decision), and it subsumes today's
`highlightId` state — they become the same value. `selectedId` drives three things:

- the tree ring (`SpineTree`'s `highlightId` prop),
- a `spine.panTo(id)` to bring the node into view,
- whether the second info panel renders (`selectedId != null`).

### Selecting

- **Tree click during play** → set `selectedId`, ring + pan. **Must NOT change `tipId`.**
  The spine tip is warmth-anchored (`treeTipId` derives from `store.warmestId`), so a
  selection click only rings/pans/opens the panel — it does not re-tip or relayout the
  spine the way Explore's `onnodeselect` does. This is the same ring+pan path GameBoard
  already uses for guess-chip clicks (`highlightId = id; spine?.panTo(id)`), extended to
  also open the panel.
- **End state** keeps its current behavior: clicks jump into Explore (`onexplore`). The
  new selection path is play-only.
- **Guess chip** → same ring + pan as today, and now also sets `selectedId` (unify answer),
  so a chip opens that genus's panel.
- **Re-clicking the currently-selected node** clears the selection (toggle off).

### Clearing

- **Any new guess** clears `selectedId` → null. Today an effect clears `highlightId` when
  `guesses.length === 0`; this extends to clearing on each new guess (the issue's core
  ask: "when I make a new guess, unselect/hide the other one").

### The panel

Reuses Explore's `nodeView(node)` fed into a second `SpecimenPlacard` (both unchanged):

- **Genus** → photo + credit, Lived / Found in clue rows, Wikipedia link.
- **Clade** → photo + "N genera in this clade" note, Wikipedia link.

## Layout — stack + scroll-together, both platforms

`BoardLayout` remains the single owner of the scroll-block skeleton. It gains an optional
second snippet, `extraPanel`, rendered immediately after `placard` in **both** the desktop
float and the phone drawer body, with **`--space-4` (16px)** between the two placards.

- **Desktop:** `extraPanel` appends inside `.specimen-float`, below the specimen placard.
  That layer is `position: fixed` and already "scrolls as ONE rigid block" (see
  `BoardLayout.svelte` comment), so scroll-together is free. Add a `--space-4` gap above
  the second card.
- **Phone:** `extraPanel` stacks below the specimen inside the `BottomSheet`'s `children`
  snippet. The sheet measures its own natural height and translates as one rigid block, so
  a taller stack just means more to pull up — one drawer, one scroll. `--space-4` gap
  between the cards.

`extraPanel` is a `Snippet` (no arg — the peek/expanded duality is the specimen's concern;
the selected-node card renders the same in both). It is only passed by `GameBoard`, and only
when `selectedId != null`; Explorer does not pass it.

## Component touch points

- **`BoardLayout.svelte`**: add optional `extraPanel?: Snippet` prop. Render it after
  `placard(false)` inside `.specimen-float` (desktop) and after the expanded `placard(false)`
  inside the BottomSheet body (phone), each preceded by a `--space-4` gap. When absent,
  nothing renders and layout is unchanged.
- **`GameBoard.svelte`**:
  - Rename/repurpose `highlightId` → `selectedId` (single source; still fed to
    `SpineTree` as `highlightId`).
  - Wire `SpineTree`'s `onnodeselect` during play to a handler that toggles `selectedId`
    (clear if same node, else set), then `spine?.panTo(id)`. Keep the end-state
    `onexplore` branch as-is (the two are mutually exclusive on `ended`).
  - `GuessList`'s `onselect` also sets `selectedId` (in addition to `panTo`).
  - Extend the clear effect: clear `selectedId` on each new guess, not only at zero.
  - Pass `extraPanel` to `BoardLayout` only when `selectedId != null`, rendering a second
    `SpecimenPlacard view={nodeView(treeStore.getNode(selectedId)!)}`.
- **`SpineTree.svelte`**: no signature change. It already gates SVG clicks on
  `onnodeselect`; wiring it during play is enough. Confirm the click path does not force a
  tip change — `onNodeClick` calls `commitStepBack` + `onnodeselect` + `focusItem`;
  `commitStepBack` is a no-op unless the click is a step-back on the *current tip lineage*,
  and the game handler does not mutate `tipId`, so the spine stays put.

## Out of scope

- No new visual design for the second card — it is the existing `SpecimenPlacard`.
- No Explore changes.
- End-state click behavior (jump to Explore) is unchanged.

## Testing

- Pure logic is thin (a toggle + a clear-on-guess). The selection/clear rules live in the
  Svelte component, validated by build + `svelte-check` + running the gallery.
- Gallery: add or reuse a state that shows a selected genus and a selected clade panel
  stacked below the specimen, on desktop and phone widths.
- Manual: select a revealed genus → panel shows its clue; select a clade → shows genus
  count; re-click → clears; make a guess → clears; click a guess chip → opens its panel.
