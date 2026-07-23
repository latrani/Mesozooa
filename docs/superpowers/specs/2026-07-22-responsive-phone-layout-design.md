# Responsive phone layout — design

**Issue:** #12 (New responsive layout). Unblocked: #1 (desktop rework) and #51 (style tweaks) are
closed. Folds the last live item from #22 (narrow-screen specimen bottom-bar `align-items: baseline`
jitter).
**Scope:** Phone portrait. Desktop behavior is unchanged.
**Date:** 2026-07-22

## Problem

The desktop rework (`2026-07-19-desktop-layout-rework-design.md`) explicitly parked responsive
behavior, so narrow support today is four scraps of `@media (max-width: 640px)`: hide the tagline,
shrink the search input, grid the placard into a compact horizontal card, and a `BoardLayout`
fallback whose own comment reads *"NOT the real responsive pass (#12)."* Nothing about the narrow
board was designed; it was kept from collapsing.

The underlying mismatch: the spine tree lays out **depth along x, sibling splay along y**, so it
wants to be wide-and-short. A phone is narrow-and-tall.

## Envelope

**One breakpoint at 640px.** ~390px portrait is the design target. Tablet and landscape take the
desktop layout early rather than getting a middle tier. Rejected: a genuine tablet tier, and
container-query fluidity — both cost real work for viewports that the desktop layout already
serves acceptably.

## The tree stays horizontal

The spine is **not** transposed on phone. Transposing it (depth down y, splay across x) is
geometrically just swapping the axes in `spine-layout.ts`, but it moves the label problem from good
to catastrophic: siblings currently stack vertically and each gets a full-width line for
"Eusaurischia"; transposed, 3–7 long taxon names compete for 390px of horizontal room.

The phone is therefore a small window onto a wide spine, and the burden lands on default zoom and
follow behavior (below) rather than on layout.

Also rejected: demoting the tree to a fixed-height peek strip, and resurrecting `WarmestTrail` as a
phone-only stacked lineage. The second is worth noting because `WarmestTrail.svelte` is currently
**dead code** — nothing imports it but the gallery. Declining to revive it means it should be
deleted, not left as a decoy.

## Height budget

The number the rest of the design serves. 390×844, ~735px usable:

```
header .................  44px
input + controls .......  92px   (input full-width, then [Hint][Forfeit] + budget)
chip band ..............  56px   (2 chips)
plaque peek ............  56px
                        ------
tree ...................  487px
```

## Region stack

```
+---------------------------+
| ^ (?)(#)  Daily. Prac Expl|   header, one row, claw-only brand
|                    ====   |
+---------------------------+
| [ Guess a dinosaur..    ] |   input pegged top
| [Hint (3)]  [Forfeit]  14 |
| oAllosaurus > Dinosauria  |   latest
| (o)Diplodocus > Eusaurisc |   warmest (ringed)
|                + 6 more v |
+---------------------------+
|                           |
|      TREE                 |   owns the middle, pan + pinch
|                  [-|^|+]  |
|                           |
+---------------------------+
| [slip] ? ? ?           ^  |   plaque sheet, peek height
+---------------------------+
```

**Input top, plaque bottom.** The soft keyboard decides this. A bottom-pegged input has to ride up
on the keyboard, which means `visualViewport` tracking — fiddly and inconsistent across iOS Safari,
Chrome, and standalone PWA mode. A top input just stays put; autocomplete drops down over the tree.

Thumb reach does **not** enter into it. Mesozooa's core gesture is drag-and-pinch on a large canvas,
which is a two-handed posture, not a one-thumb one. This also rules out any second horizontal-swipe
surface adjacent to the tree (see chips, below).

The plaque earns the bottom slot because mid-game it is a placeholder (`? ? ?` / "Coming soon"), so
the keyboard hiding it costs nothing, while its real moment is the end state, when the keyboard is
gone.

## Shell

Phone locks to the viewport exactly as desktop does: `100dvh`, no document scroll, regions scroll
internally. Mesozooa is an installable offline PWA and should behave like an app.

Two enabling changes:

- **`index.html` viewport meta** gains `interactive-widget=resizes-content`, so the soft keyboard
  resizes the layout viewport instead of scrolling it. This is what makes "input at top, nothing
  tracks the viewport" hold up.
- **`.tree-scroll` gains `overscroll-behavior: contain`**, so panning to the tree's edge does not
  scroll-chain or trigger pull-to-refresh.

`touch-action` is left alone. `.tree-scroll` already declares `pan-x pan-y`, which is correct: the
browser handles one-finger panning natively while pinch goes through the existing `gesturechange` /
wheel handlers.

## Chip band

**Latest + Warmest + `+N more`.** An editorial truncation rather than a mechanical one. The two
selected chips are the only two that carry live meaning: Latest is the feedback for the turn just
taken; Warmest is the anchor of the search, and is literally what the spine is centered on, since
`warmestId` drives the tip. Chip band and tree therefore agree by construction.

Selection is cheap: guesses are already newest-first and `store.warmestId` already exists.

- The full desktop chip form `● Name → Clade` **survives on phone**. Only two chips show, so there
  is room; phone does not get a second chip variant.
- **When Latest is Warmest** (always true on guess 1, common after) show one chip. Do not backfill a
  second — backfilling silently redefines the slots as "top 2 guesses," a different and less honest
  claim.
- **Field clue** chips have no warmth, so they can only ever occupy Latest.
- **`+N more`** raises a sheet containing the full desktop-style chip list.
- The end-state **Answer** chip stays pinned regardless.

**Warmest is marked visually, not labelled** — it takes the same ring treatment the spine tip
already has in the tree, so the chip and the node read as the same object. Position carries Latest
(newest-first, as on desktop).

> **REVERSED BY PLAYTEST (2026-07-22).** The ring was built, looked at on a real 390px viewport,
> and did not read. The fallback named here is now the design: **`LATEST` / `WARMEST` eyebrow labels**,
> rendered only while the band is collapsed. Expanded, the list is plain reverse-chronological and
> the labels would be false, so they are not shown. `Chip`'s `warmest` prop and the ring CSS were
> removed rather than left dormant. This is the provisional call resolving exactly as intended.

Rejected: free wrap (desktop's rule — late-game it eats half the screen), a single horizontally
scrolling line (only ~1.3 chips fit, and it puts a horizontal swipe surface directly above the
tree's drag surface), and collapsing to a bare summary line (loses warmth-at-a-glance).

## The plaque is one sheet with two heights

`SpecimenPlacard` currently appears in three very different sizes: tiny mid-game, always-full in
Explore (`nodeView` never returns a placeholder), and large at solve (title + photo + credit + two
clue rows + genera note + Wikipedia link + stacked actions). These are one object at two heights,
not three cases.

**On phone the plaque is a bottom sheet:**

- **Peek** — one row, always visible: the placard **title**, its note as quiet trailing context, and
  an up/down arrow at the right. **Revised by playtest (2026-07-22):** the peek originally carried a
  thumbnail too, which did not earn its width, and the expanded card restated the title directly
  beneath it. The thumbnail is gone and the card's own heading is suppressed on phone, so the peek
  row IS the sheet's title bar.
- **Expanded** — the full card.

Resting states: Daily and Practice rest at peek; Explore rests at peek and is raised on demand; end
state auto-raises. One component, one gesture, three contexts.

This **designs out the #22 jitter** rather than patching it: the peek row becomes a deliberate
single-line layout instead of a grid trying to vertically centre mismatched content, so the
`align-items: baseline` problem has nowhere to occur.

Rejected: Explore resting expanded (the sheet's height would then change on tab switch), and keeping
the three treatments separate.

## End state

Win or loss auto-raises the sheet into a reveal: result line, revealed plaque, Daily stats, and the
Share / New round actions. It is dismissible, and re-openable from the peek bar.

Dismissibility is the point. End state is when the tree becomes *most* worth looking at — the answer
lineage is revealed and every node turns into a tappable Explore link — so the reveal must be able
to get out of the way.

Rejected: inflating every region in place (banner, inline stats, and a swollen plaque all grow at
once, squeezing the tree to a sliver exactly when it matters), and switching to a scrolling result
page (the shell would change mode mid-round).

## Header

**Two rows. Revised by playtest (2026-07-22).** The original call was a single row with the wordmark
hidden and the utilities iconified, chosen to protect ~40px of tree height. Measured in a browser,
the tree cleared its budget with room to spare, so the height was available after all and the
one-row header read as muddled. Now: **row 1** is claw + wordmark + How to play + Stats; **row 2** is
the mode switcher, given the full width so the three tabs spread across it. The wordmark drops to
`--type-title` on phone, which is what keeps row 1 from spilling the utilities onto a third row.

Content at 390px would otherwise be ~410px wide before the progress suffix appears, so:

- **`– in progress` becomes a dot** on the tab. Not a choice; the label does not fit.

Rejected: a two-row header with a full-width tab strip (clearer, and the sliding indicator would
read better, but ~40px is 8% of the tree budget), and icon-only tabs (weakens primary navigation for
modes that have no obvious icons). Also rejected: a bottom tab bar, the conventional mobile answer —
the plaque sheet lives there, and a sheet expanding upward from behind a tab bar is a mess.

## Explore on phone

Same board skeleton, same plaque sheet. One change of its own: **the "recently viewed" chip trail
caps to a single clipped line, with no `+N` expansion.** Recency in Explore is a convenience trail,
not game state, and does not earn a sheet.

## Footer and attribution

The attribution strip wraps to ~4 lines of `--type-meta` at 390px — roughly 50px, 10% of the tree
budget — for text nobody reads in a strip.

**Data-source attribution moves into How-to-play as an About section**, leaving a hairline footer (or
none) on phone. Per-image CC credits stay on the plaque, so the license obligation is met
independently of this.

## Modals

`Modal.svelte` sets `max-width: min(32rem, 90vw)` but **no `max-height`**. On a phone, How-to-play
(now carrying the About content) and Stats will overflow the viewport. Add `max-height` plus
internal scrolling on `.modal-body`.

## Tree defaults on phone

The phone opens at `ZOOM_PHONE_DEFAULT`, a hand-tuned dial. **Revised by playtest (2026-07-22):**
this was first set to 0.6 on the theory that a small window onto a wide spine wants more context.
At 390px that read as a diagram of the tree rather than the thing you play with, so it is now
**1.0**, and may go higher. Follow-the-newest-node behavior carries the rest: since
the viewport is a small window on a wide spine, the interesting node must be brought to the user
rather than hunted for.

## Explicitly out of scope

- Any change to desktop layout or behavior.
- Tablet and landscape-specific treatment (they take the desktop layout).
- Transposing or otherwise re-rendering the spine.
- Plaque content reconception beyond the peek/expanded split.

## Components touched (map, not a plan)

- `index.html` — viewport meta gains `interactive-widget=resizes-content`.
- `src/lib/styles/base.css` — extend the locked-shell rules to phone; phone is no longer
  document-flow.
- `src/lib/game/components/BoardLayout.svelte` — replace the placeholder narrow collapse with the
  real stack: input band top, tree body, plaque sheet bottom.
- **New** — the plaque bottom-sheet primitive (peek/expanded, drag or tap, dismissible), consumed by
  `GameBoard` and `Explorer`.
- `src/lib/game/components/SpecimenPlacard.svelte` — replace the `max-width: 640px` grid with the
  peek and expanded layouts the sheet renders.
- `src/lib/game/components/GuessList.svelte` — phone selection (Latest + Warmest + `+N more`), the
  Warmest ring marking, and the overflow sheet.
- `src/lib/game/components/GameBoard.svelte` — end state routes into the reveal sheet on phone
  instead of inflating the cluster.
- `src/lib/game/components/SpineTree.svelte` — `overscroll-behavior: contain`; phone default zoom.
- `src/App.svelte` — phone header (claw-only brand, icon utilities, progress dot); footer reduction.
- `src/lib/components/Modal.svelte` — `max-height` + body scroll.
- `src/lib/components/HowToPlay.svelte` — gains the About / attribution section.
- `src/lib/game/components/WarmestTrail.svelte` — **delete** (dead code; this design declines to
  revive it). Its only reference is the `src/gallery/Gallery.svelte` frame, which goes with it.
- `src/gallery/` — phone-width frames for the new states.
