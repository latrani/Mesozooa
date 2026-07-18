# Mesozooa — Game UI: Information Architecture & Layout Redesign

*The look-and-feel pass, part 1: nail the structure before the styling.*
Date: 2026-07-13

This spec covers the **information architecture and layout** of the game — how the screen is
composed, what's primary, how the regions relate, and the top-level navigation. Visual
treatment (palette, type, styling, motion) is a **separate later phase** (§8): structure first,
so styling later decorates a settled structure instead of driving it.

Supersedes the "default-level" IA the components shipped with (three co-equal tabs; a generic
list|tree split; warmth rendered three ways at once). See the `ux-process-ia-before-visuals`
memory for why this ordering.

## 1. The core reframe

Two ideas drive everything:

1. **The tree is deep and gnarly**, not a fixed set of clades. We must *not* keep the whole
   tree in view. Play is: narrow fast at a high level, then work a small branch. So the tree
   is a **horizontal focus+context surface** — root far left, refinement flowing right, coarse
   context scrolling off the left as you narrow.
2. **The game is the product; browsing is a tool.** Navigation is not three co-equal tabs.

## 2. Navigation (model "C", refined)

- **Header = wordmark + three modes:** `Daily · Practice · Explore`. The wordmark plus three
  items is acceptable density; **the budget does not live here** (it moves to the trail, §3).
- **Daily / Practice** are the game; behavior unchanged from today (deterministic daily answer
  + 20-guess budget + hints; practice unlimited). They share the game screen (§3).
- **Explore is a reference tool, not a peer destination.** Its *behavior* is the refined part:
  - **Wide-open and always available** — the full ~2,072-genus reference cladogram, browsable
    any time (including mid-game). This is deliberate: like using Wikipedia/tree diagrams
    alongside Metazooa, reference use is legitimate and the daily's integrity rests on honor,
    not walls.
  - **Reference, not answer key.** Explore shows taxonomy + paleo facts and **must not surface
    the `playable`/answerable subset** — no "guessable" markers, and its search spans the full
    reference pool, not just playable genera. Rationale: our tree *knows* the ≤7 playable
    siblings of any clade; exposing them would hand over the exact narrowed candidate set and
    kill the count-only specimen + clue mechanic (§4, §5). Keeping playability invisible is
    already the default (the "mark unplayable in Explore" backlog item stays deferred), so this
    costs nothing. Wikipedia shows *all* tyrannosaurids; Explore must be no more revealing.
  - **Two entry paths:** the header `Explore` item, and a contextual **"explore around
    [answer]"** jump from the solved specimen (§5) that opens Explore focused on the answer.

## 3. Game screen — regions

Four regions, top to bottom, each with one job. This replaces the current
`SearchBox → WarmestTrail → CluePanel → [GuessList | TreeView]` composition.

```
┌─ MESOZOOA ─────────────────── [ Daily · Practice · Explore ] ─┐  A. header
│  4/20   Dinosauria › Theropoda › … › Tyrannosauridae           │  B. trail + budget
│         2072         881             7    ← click a crumb = pan │
│  ┌─────────── tree (◂ scrolls) ──────────┐  ┌─ specimen ─┐     │
│  │        ● Ornithomimosauria            │  │   ??????   │     │
│  │ …●━━━●━━━━━━━━━━━━━━━━━━━━━━●  SPINE → │  │ 7 sibling  │     │  C. tree (main)
│  │        ● Dromaeosauridae              │  │   taxa     │     │   + specimen (right rail)
│  │                                        │  │ ── clue ── │     │
│  │                                        │  │ Campanian  │     │
│  └────────────────────────────────────────┘  │ USA        │     │
│     Gallimimus     881                        └────────────┘     │  D. guess history
│     Velociraptor   312   ← guess + warmth, subordinate           │   + input + hint
│  ┌ guess a dinosaur… ─────────────────┐   [ Hint ]              │
└──────────────────────────────────────────────────────────────────┘
```

### A. Header
Wordmark + three mode items (§2). Minimal.

### B. Trail (the scrubber)
The current `WarmestTrail` breadcrumb, promoted to a load-bearing role. Because the tree
viewport is not the whole tree, the trail is the **always-complete, compact orientation
line**: root → current frontier, one line, regardless of tree scroll position.
- **Each crumb shows the clade name + its genus count** (structural context, e.g. `Theropoda
  881`).
- **Clicking a crumb pans the tree** to that node — the trail is effectively the tree's
  horizontal minimap/scrubber.
- **The budget (e.g. `4/20`) sits at the trail**, not the header (daily only).
- Division of labor with the tree: **trail = always-full orientation + jump; tree = spatial
  detail at the current viewport.** They no longer duplicate each other.

### C. Tree (the play surface) + Specimen (right rail)

**Tree — horizontal focus+context with a centered spine:**
- **The "spine" is the sought lineage** (root → the warmest/most-narrowed clade). It renders as
  a straight horizontal axis down the vertical middle and is **highlighted**.
- **Off-spine branches** — lineages revealed by wrong-clade guesses — **splay above and below**
  the spine at their branch points. Verticality encodes "how far off you wandered"; horizontal
  depth encodes "how far you've narrowed."
- **The viewport follows the frontier (late game).** As a guess *advances* the spine (a new,
  deeper narrowing), the view pans right to keep the frontier in view — **gently, and only on
  advance**, with **manual pan as an override** (and the trail scrubber as the manual control).
  Early game there is no meaningful frontier yet (a few scattered deep guesses near the root);
  the view favors breadth then. Two regimes, and that's fine — the trail carries orientation
  throughout.
- Still reveals only guessed lineages (as today); it does not expose unrevealed structure.
- **The game tree and the Explore tree may legitimately differ in form** — the game tree is a
  stylized progress spine; Explore is a faithful browsable cladogram. Intentional.

**Specimen — the right rail (the game's focus object):**
A single evolving object at the terminus that absorbs three things the old IA scattered (the
target placeholder, the clue, and warmth) into one progress story. It is **fixed (a right
rail), visually tied to the spine's frontier** — it reads as the end of the spine but does not
scroll away when the player pans left, so the clue never leaves view mid-deduction.

Its three states (§5) are driven by existing game selectors — this is where Plan B's
`terminalClueActive` finds its home.

### D. Guess history + input
- **Input pegged to the bottom**, paired with the history it feeds: type → history grows →
  spine advances. `[ Hint ]` sits by the input.
- **Guess history is subordinate but honest** — each past guess shows its **name + its warmth**
  (the primary warmth reading is the specimen + spine; per-guess warmth lives here as history).
- **No share for now** — virality is out of scope this pass (§8). The history is just a
  history; the `share` action is removed from the UI.

## 4. Warmth, de-duplicated

Old IA showed warmth three times (trail + each guess row + tree emphasis). New assignment:
- **Specimen** — the primary reading: the size/state of the current frontier clade (§5).
- **Tree** — spatial: how far right the spine reaches, and the temperature color of the spine.
- **Guess history** — per-guess warmth, as an after-the-fact record (region D).
- **Trail** — *not* a warmth channel; its counts are structural orientation (clade sizes).

## 5. The specimen — progression

*Identify the specimen.* One object, three states:

```
   broad              terminal clade reached              solved
 ┌────────┐          ┌────────────────┐                ┌────────────────┐
 │ ??????  │         │ ??????          │               │ TYRANNOSAURUS  │
 │  312    │   ──▶   │ 7 sibling taxa  │      ──▶       │   6 guesses    │
 │ genera  │         │ ── clue ──      │               │ [explore ▸]    │
 │         │         │ Campanian · USA │               │                │
 └────────┘          └────────────────┘                └────────────────┘
```

- **Broad:** the warmest shared clade still has many members — show `N genera`
  (`descendantGenusCount` of `warmestSharedNodeId(state)`). Anonymous placeholder.
- **Terminal clade reached:** when `terminalClueActive(state, store)` fires (warmth has
  bottomed out at the target's terminal clade), show the **count of sibling taxa** and the
  **clue** (age + discovery location, both when present). **Count-only, locked** — the ≤7
  siblings stay **anonymous**; the clue is the deduction lever. Revealing their names would be
  brute-forceable within budget and would nullify the notability-prune + clue mechanic.
- **Solved:** the answer genus, the guess count, and the **"explore around [answer]"** jump
  into Explore (§2). No share button (deferred).

**End-state unification:** Daily and Practice both simply resolve the specimen to *Solved*
(and on a Daily loss, reveal the answer in the same specimen). This removes today's split
between Daily's inline result section and Practice's separate `RevealCard`.

## 6. Hints — grow the spine

A hint reveals the next node down the target's lineage — i.e., it **extends the highlighted
spine one step to the right**. Framed as progress along the spine, not a generic node reveal.
Mechanics unchanged (Daily-only, 3 max, counts toward budget); only the *reading* changes.

## 7. Responsive

- **Orientation is preserved on all sizes** — the tree never rotates: root left, deeper right,
  off-spine up/down ("left = up, right = down"). It scrolls **horizontally** inside a bounded
  region.
- **On narrow screens, the tree fills the flexible middle**, and **the specimen and input peg
  to the bottom of the screen.** The right-rail specimen becomes a compact bottom bar
  (`?????? · 7 taxa · clue`) above the pegged input.

```
MOBILE
┌ MESOZOOA   [Daily·Practice·Explore] ┐
│ 4/20  Dino › … › Tyrannosauridae     │  trail + budget (scroll/truncate)
│ ┌──── tree (◂ h-scroll) ──────────┐  │
│ │ …●━━●━━━━━━━━●  spine             │  │  tree fills flexible middle
│ │      ● Dromaeosauridae           │  │
│ └───────────────────────────────────┘  │
│ ┌ specimen: ?????? · 7 taxa · clue ─┐  │  ◀ pegged bottom (compact)
│ ┌ guess a dinosaur… ───────┐ [Hint] │  ◀ pegged bottom: input
└──────────────────────────────────────┘
```

- **Open (later-phase) micro-item:** where guess history sits on mobile — it can't also peg to
  the bottom; likely a peekable panel or it scrolls in the body above the pegged bar. Not
  load-bearing for IA.

## 8. Out of scope / deferred

- **All visual treatment** — palette, type/font choice, styling, hairlines, spacing scale,
  motion/animation. This is the **separate follow-up phase** (part 2 of the look-and-feel
  pass). This spec settles structure only.
- **Share / shareable output** — deferred entirely (virality not a current priority). The
  existing `share.ts` / `buildShareText` code stays but is unsurfaced in the UI.
- **Dark theme** — later.
- **Explore pan/zoom for large subtrees**, **guess-history mobile placement**, **marking
  unplayable genera in Explore** (must stay off per §2) — deferred.
- **Streak/stats, explorer deep-linking** — unchanged, still deferred.

## 9. Mapping to existing code (for the implementation plan)

- **`App.svelte`** — header becomes wordmark + three modes; budget moves out.
- **`WarmestTrail.svelte`** — gains click-to-pan and the budget slot; becomes region B.
- **`TreeView.svelte` + `layout.ts`** — the largest lift: spine-centered horizontal
  focus+context layout, off-spine splay, viewport-follows-frontier + manual pan. The game tree
  diverges from Explore's faithful cladogram.
- **New `Specimen.svelte`** — region C right-rail; folds in `CluePanel.svelte`; driven by
  `warmestSharedNodeId` + `descendantGenusCount`, `terminalClueActive`, and `state.status`.
  Plan B's clue getters feed it directly.
- **`GameBoard.svelte`** — recomposed into the four regions; input moves to the bottom.
- **`GuessList.svelte`** — bottom guess-history strip (name + warmth); share affordance
  removed.
- **`RevealCard.svelte` + Daily's inline result** — replaced by the specimen *Solved* state.
- **`Explorer.svelte`** — stays the faithful reference browser; ensure no playable markers;
  add "back to game" and accept the contextual "explore around [answer]" focus.
- **`share.ts`** — retained, unsurfaced.
