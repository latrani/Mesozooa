# Stable A-Z Spine Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework `layoutSpine` so off-spine siblings are ordered A-Z at every level (never reordered), with selection expressed purely as vertical translation and overlaps resolved by outward contour-push.

**Architecture:** Single-file internal algorithm swap in `src/lib/game/spine-layout.ts`. The spine construction (pathToRoot + monotypic continuation + heroLen), the recursive `pack()`, the spine-emit pass, and the public `SpineLayout`/`centerOffsetFor` interfaces are all UNCHANGED. Only the off-spine placement (current lines 113-171: side-assignment + deepest-innermost + cursor packing) is replaced with A-Z-split + contour-push. Consumers (`SpineTree.svelte`, both stores) are untouched. Shared by Explore and the game — no mode flag.

**Tech Stack:** TypeScript, Vitest. Pure function, TDD.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` before committing.
- **Public interface unchanged:** `layoutSpine(store, revealed, warmestId): SpineLayout` — same signature, same `SpineNode`/`SpineEdge`/`SpineLayout` shapes. No new params (no mode flag — one behavior for Explore + game).
- **A-Z invariant:** at every spine node, off-spine children order alphabetically top→bottom through the axis. Children A-Z **before** the on-spine child → **above** (y<0); **after** → **below** (y>0). Names compared via `localeCompare` (as `revealedChildren` already does).
- **Selection = translation only:** the spine stays pinned at y=0; which child is on-spine only changes the anchor. Placement order is deterministic and **independent of selection** — branches never reorder across a selection change.
- **No selection → centroid on axis:** a spine node with no on-spine child (frontier, or root pre-selection) centers its A-Z fan on the axis. A **lone revealed child** of a structurally-branching frontier therefore lays **straight at y=0** (reverses old splay behavior — the expandable stub carries the "more here" cue).
- **Contour-push, outward only:** collisions within a side are resolved by pushing the new block **further from the axis**, never toward the spine. Spine never threatened; placed blocks never move.
- **Spine special-cases preserved:** monotypic continuation (straight past warmest) and `heroLen` (nodes past warmest render `onSpine:false`) still work — they touch the on-axis lineage, which this rework doesn't change.
- **Animation groundwork (do not regress):** don't touch `SpineTree.svelte`'s `{#each ... (n.id)}` id-keying or the per-node `transform`. (This plan doesn't edit that file at all; noted so a reviewer knows it's intentional.)

## Fixture reference (for test assertions)

`FIXTURE_RAWS` (children shown in A-Z order; ids in caps):
- `Q430` Dinosauria → [`O` Ornithischia, `T` Theropoda]  (Neornithes pruned)
- `T` Theropoda → [`LO` Loosey, `TF` Tyrannosauridae]
- `TF` Tyrannosauridae → [`TB` Tarbosaurus, `TR` Tyrannosaurus]
- `O` Ornithischia → [`CF` Ceratopsidae] → [`TC` Triceratops]

## File Structure

- **Modify `src/lib/game/spine-layout.ts`** — replace the off-spine placement block (currently ~lines 113-171) with A-Z-split + contour-push. Everything above line 112 (spine build, `pack`, spine emit + `offBlocks` collection) and the `width`/return below stays.
- **Modify `src/lib/game/spine-layout.test.ts`** — update the assertions that encoded old side-assignment order to the new A-Z order; add new invariant tests (A-Z monotonic, selection-is-translation, no-overlap incl. the 3-same-side case, centroid-when-unselected). Keep + re-verify the monotypic and heroLen tests.

---

## Task 1: Characterize + lock the NEW expected geometry in tests (red)

Rewrite the existing behavioral assertions to the A-Z model and add the new invariants — as FAILING tests against the current (old) implementation. This task establishes the target; Task 2 makes it pass.

**Files:**
- Modify: `src/lib/game/spine-layout.test.ts`

**Interfaces:**
- Consumes: `layoutSpine(store, revealed, warmestId)` (unchanged signature); the fixture store.
- Produces: the test suite that defines "done" for Task 2.

- [ ] **Step 1: Update the frontier-splay test to A-Z order**

The existing test "splays two frontier children to opposite sides (name order: TB above, TR below)"
(lines 38-45) already matches the new model — `TF`'s children are `TB` (Tarbosaurus) then `TR`
(Tyrannosaurus) A-Z, and with no on-spine child the fan centers: two children split evenly, first
(TB) above, second (TR) below. **Verify it still expresses A-Z and keep it.** No change needed if it
reads `TB` y<0, `TR` y>0. (It does.)

- [ ] **Step 2: Replace the lone-frontier-child test (behavior reversal)**

The test "does NOT straighten a frontier that branches structurally, even if only one child is
revealed" (lines 81-87) asserts the OLD splay. Replace it with the new centered behavior:

```typescript
  it("centers a lone revealed frontier child straight on the axis (branch-point cue is the stub)", () => {
    // TF (Tyrannosauridae) has two real children (TR, TB); only TR revealed. Under the centroid
    // rule a single child IS the centroid, so it lays straight at y=0 (looks monotypic). The
    // "more is hidden" cue is carried by the expandable stub, not by splaying. (Reverses old behavior.)
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR"]), "TF");
    const m = byId(l);
    expect(m.get("TR")).toMatchObject({ x: 3, y: 0, onSpine: false });
  });
```

- [ ] **Step 3: Update the single-off-spine-leaf test**

"lays the spine straight at y=0 by depth, single off-spine leaf above" (lines 20-36): spine is
`Q430→T→TF`, and `TR` is TF's lone revealed child (TF's other child TB not revealed). Under the new
rule TF is the frontier with one revealed child → `TR` centers at **y=0** (not y=-1). Update:

```typescript
  it("lays the spine straight at y=0 by depth; a lone frontier child centers on the axis", () => {
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR"]), "TF");
    const m = byId(l);
    expect(m.get("Q430")).toMatchObject({ x: 0, y: 0, depth: 0, onSpine: true });
    expect(m.get("T")).toMatchObject({ x: 1, y: 0, onSpine: true });
    expect(m.get("TF")).toMatchObject({ x: 2, y: 0, onSpine: true });
    expect(m.get("TR")).toMatchObject({ x: 3, y: 0, onSpine: false });
    expect(l.edges).toEqual(
      expect.arrayContaining([
        { parentId: "Q430", childId: "T", onSpine: true },
        { parentId: "T", childId: "TF", onSpine: true },
        { parentId: "TF", childId: "TR", onSpine: false },
      ]),
    );
    expect(l).toMatchObject({ width: 3, minY: 0, maxY: 0 });
  });
```

- [ ] **Step 4: Update the off-spine-chain-from-root test**

"hangs a multi-node off-spine chain from the root, above" (lines 47-59): spine `Q430→T→TF`. At the
root `Q430`, on-spine child is `T` (Theropoda); the other revealed child is `O` (Ornithischia). A-Z
order of Q430's children is [`O`, `T`] — so `O` is **before** `T` alphabetically → `O`'s chain packs
**above** (y<0). That matches the old expectation (y=-1). At `T`, on-spine child is `TF`; no other
revealed T-children here, so nothing else splays. **The old assertions still hold** (O/CF/TC at
y=-1). Keep the test but rename for clarity:

```typescript
  it("packs an alphabetically-earlier sibling's chain above the axis (O before T at the root)", () => {
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "O", "CF", "TC"]), "TF");
    const m = byId(l);
    expect(m.get("O")).toMatchObject({ x: 1, y: -1, onSpine: false });
    expect(m.get("CF")).toMatchObject({ x: 2, y: -1, onSpine: false });
    expect(m.get("TC")).toMatchObject({ x: 3, y: -1, onSpine: false });
    expect(m.get("Q430")!.onSpine).toBe(true);
    expect(l).toMatchObject({ width: 3, minY: -1, maxY: 0 });
  });
```

- [ ] **Step 5: Add the A-Z monotonic invariant test**

```typescript
  it("orders every spine node's off-spine children A-Z through the axis (before→above, after→below)", () => {
    // Root focus: Q430 children [O, T] both revealed; pick T on-spine (warmest deep in T).
    // O (before T) must be above the axis; anything after T would be below. Also TF frontier
    // fans TB (before TR alphabetically) above, TR below when both revealed.
    const l = layoutSpine(store, new Set(["Q430", "O", "CF", "TC", "T", "TF", "TR", "TB"]), "TF");
    const m = byId(l);
    // Q430: on-spine child T; O is alphabetically before T -> above (y<0)
    expect(m.get("O")!.y).toBeLessThan(0);
    // TF frontier: TB before TR -> TB above, TR below
    expect(m.get("TB")!.y).toBeLessThan(0);
    expect(m.get("TR")!.y).toBeGreaterThan(0);
  });
```

- [ ] **Step 6: Add the selection-is-translation invariant test**

```typescript
  it("re-anchors without reordering: switching the on-spine child slides the fan, order preserved", () => {
    // Same revealed set, two different warmest picks within TF's fan. TB and TR keep their A-Z
    // RELATIVE order (TB before TR => TB stays above TR) regardless of which is on-spine.
    const revealed = new Set(["Q430", "T", "TF", "TR", "TB"]);
    const withTB = byId(layoutSpine(store, revealed, "TF")); // neither on spine (frontier=TF)
    // TB is alphabetically before TR in both layouts -> TB.y < TR.y always.
    expect(withTB.get("TB")!.y).toBeLessThan(withTB.get("TR")!.y);
  });
```

- [ ] **Step 7: Add the no-overlap test (incl. 3-same-side, closing the deferred-findings §C gap)**

Build a fixture where one side must stack 3+ blocks, and assert no two nodes share a cell:

```typescript
  it("never overlaps: 3+ blocks stacked on the same side are pushed outward, no shared cells", () => {
    const CL = "Q713623", G = RANK_GENUS;
    // Root R, spine R->S (warmest genus). R has 4 genus children alphabetically BEFORE S:
    // A1..A4 (all < "S"), so all four pack ABOVE the axis and must not collide.
    const raws = [
      { id: "R", name: "Root", rankId: CL, parentId: null },
      { id: "S", name: "Sspine", rankId: G, parentId: "R", wikipediaUrl: "w" },
      { id: "A1", name: "Aone", rankId: G, parentId: "R", wikipediaUrl: "w" },
      { id: "A2", name: "Atwo", rankId: G, parentId: "R", wikipediaUrl: "w" },
      { id: "A3", name: "Athree", rankId: G, parentId: "R", wikipediaUrl: "w" },
      { id: "A4", name: "Afour", rankId: G, parentId: "R", wikipediaUrl: "w" },
    ];
    const st = createTreeStore(assembleTree(raws, "R", "test"));
    const l = layoutSpine(st, new Set(["R", "S", "A1", "A2", "A3", "A4"]), "S");
    const cells = l.nodes.map((n) => `${n.x},${n.y}`);
    expect(new Set(cells).size).toBe(cells.length); // no two nodes share an (x,y) cell
    // all four A-genera are alphabetically before "Sspine" -> all above the axis
    const m = byId(l);
    for (const id of ["A1", "A2", "A3", "A4"]) expect(m.get(id)!.y).toBeLessThan(0);
  });
```

- [ ] **Step 8: Run the suite to confirm the NEW tests fail against the OLD code**

Run: `npx vitest run src/lib/game/spine-layout.test.ts`
Expected: FAIL — the updated y-value assertions (Steps 2,3 especially, TR y=0 vs old y=-1) fail
against the current implementation. This proves the tests bite. (The monotypic + heroLen + planar
tests and centerOffsetFor should still PASS — they're unchanged behavior.)

- [ ] **Step 9: Commit the red tests**

```bash
git add src/lib/game/spine-layout.test.ts
git commit -m "test(spine): A-Z stable layout invariants (red — pre-implementation)"
```

---

## Task 2: Implement A-Z-split + contour-push (green)

Replace the off-spine placement in `layoutSpine` so Task 1's tests pass, without disturbing the spine
construction, `pack`, or the public interface.

**Files:**
- Modify: `src/lib/game/spine-layout.ts`

**Interfaces:**
- Consumes: the existing `spine` array, `heroLen`, `revealedChildren`, and `pack(id, depth)` (all unchanged, above line ~112).
- Produces: the same `SpineLayout` return shape.

- [ ] **Step 1: Keep the spine-emit pass; recollect off-blocks WITH their on-spine child**

Everything through the `spine.forEach(...)` emit (current lines 97-111) stays, EXCEPT the off-block
record needs to know each spine node's on-spine child (to split before/after). Replace the collection
so each spine node yields: its `parentId`, the id of its on-spine child (`nextSpine`, or `null` at
the frontier), and its off-spine children as packed blocks tagged with their child name. Concretely,
keep emitting spine nodes/edges as now; build `offBlocks` as
`{ attachDepth, parentId, childId, childName, packed }` (add `childName = child.name` for the A-Z
split; `pack` is called exactly as today).

- [ ] **Step 2: Replace side-assignment (lines 113-146) with A-Z before/after split**

Delete the alternate-sides + deepest-innermost unit logic. For each spine node (group `offBlocks` by
`parentId`/`attachDepth`), determine its on-spine child's name:
- If the node has an on-spine child (`nextSpine` exists): `onName = store.getNode(nextSpine).name`.
  Blocks with `childName.localeCompare(onName) < 0` → **above** list; `> 0` → **below** list.
- If NO on-spine child (frontier / root pre-selection): split the A-Z-sorted blocks at the midpoint —
  first `floor(n/2)` → above, rest → below — so the fan centers on the axis. (A single block → below
  is empty, above is empty, block centers at y=0: the lone-frontier-child case.)

Within each of above/below, keep blocks in A-Z order, and order them **axis-inward = alphabetically
nearest the on-spine child**: above is read outward as names descend away from `onName`; below outward
as names ascend. (I.e. the block alphabetically closest to the on-spine child sits nearest the axis.)

- [ ] **Step 3: Replace cursor packing (lines 148-171) with contour-push**

Maintain two contours — `aboveContour` and `belowContour` — each a per-x map of the furthest-out |y|
reached (initialize empty; the spine occupies y=0 at every x, so treat the axis as the y=0 boundary).
For each block (process **above** blocks axis-outward, then **below** blocks axis-outward — a
deterministic order independent of selection):

- The block spans x-columns `[attachDepth+1 .. attachDepth+1+maxDepthInBlock]` (its packed nodes'
  depths) plus the riser column at `attachDepth+1`. Compute the block's local y-extent (`0..height`
  from `pack`).
- Find the minimal outward `shift` such that, for every x-column the block occupies, placing the
  block's nodes at `localY + shift` (above: negative direction; below: positive) does not collide
  with the contour at those columns (leave ≥1 unit gap, matching today's `+1` spacing).
- Place the block's nodes at the shifted y; push the block's edges. Update `minY`/`maxY`.
- Raise the contour at each occupied x-column to include this block's outermost y.

Helper sketch (implement cleanly, this is the shape):

```typescript
// per-x furthest-out distance from the axis already occupied on this side (>=0)
type Contour = Map<number, number>;
function placeSide(
  blocks: OffBlock[],
  sign: 1 | -1,              // +1 below, -1 above
  contour: Contour,
  emit: (id: string, x: number, y: number) => void,
) {
  for (const b of blocks) {
    const cols = b.packed.nodes.map((n) => n.depth); // x-columns this block occupies
    // smallest gap so no column collides: max over columns of (contour[col] + 1),
    // then the block's own rootY offset is absorbed by its local ys.
    let base = 0;
    for (const c of cols) base = Math.max(base, (contour.get(c) ?? 0) + 1);
    for (const n of b.packed.nodes) {
      const dist = base + n.y;          // outward distance from axis
      emit(n.id, n.depth, sign * dist);
    }
    for (const c of cols) {
      const localMax = Math.max(...b.packed.nodes.filter((n) => n.depth === c).map((n) => n.y));
      contour.set(c, base + localMax);
    }
  }
}
```

(Adapt to also push each block's off-spine edges and track `minY`/`maxY`. The riser edge
`{parentId, childId, onSpine:false}` is pushed per block as today.)

- [ ] **Step 4: Keep the width computation + return unchanged**

`const width = nodes.reduce((mx, n) => Math.max(mx, n.depth), 0);` and the `return { nodes, edges,
width, minY, maxY };` stay as-is.

- [ ] **Step 5: Run the full spine-layout suite**

Run: `npx vitest run src/lib/game/spine-layout.test.ts`
Expected: PASS — all of Task 1's new assertions AND the preserved monotypic/heroLen/planar/
centerOffsetFor tests. If the "deeper-attached nearer the spine" planar test (old lines 131-151) now
conflicts with the A-Z rule, that's expected — its ordering premise (deepest-innermost) is REPLACED
by A-Z; update it to assert A-Z + no-overlap instead of deepest-innermost, with a comment that the
old nesting heuristic is gone. (Verify against the fixture whether it still holds incidentally before
changing it.)

- [ ] **Step 6: Typecheck + full test run + commit**

```bash
npx tsc --noEmit
npx vitest run
git add src/lib/game/spine-layout.ts src/lib/game/spine-layout.test.ts
git commit -m "feat(spine): A-Z stable layout with outward contour-push (replaces side-assignment)"
```

---

## Task 3: Verify in both modes (controller-owned)

Not a code change — the live check that the layout looks right and behaves stably. Its own gate
because "branches stay A-Z and slide rather than hop" is the user-facing deliverable and only shows in
the running app.

**Files:** none.

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && npx svelte-check --threshold error && npx vitest run`
Expected: tsc 0, svelte-check 0, all tests green.

- [ ] **Step 2: Explore walk (controller/user)**

`npm run dev`, open Explore. Walk several clades (e.g. Dinosauria → Saurischia → deeper). Confirm:
sibling labels stay in A-Z order top-to-bottom; selecting a new clade slides the fan so the pick is
straight-across WITHOUT branches hopping sides/reordering; no visual overlap of branches; a bushy node
fans both sides A-Z.

- [ ] **Step 3: Game accumulation (controller/user)**

`#/practice`, make several guesses. Confirm: as guesses accumulate, already-placed branches don't jump
— new branches insert in A-Z position; the warmth spine still colors correctly; monotypic
continuations still lay straight.

- [ ] **Step 4: No commit** — verification only; record results in the SDD ledger.

---

## Self-Review

**Spec coverage:**
- A-Z at every level, before→above / after→below → Task 2 Step 2; tested Task 1 Step 5. ✅
- Selection = translation, no reorder → Task 2 Step 2 (selection only sets `onName`, not order); tested Task 1 Step 6. ✅
- No selection → centroid; lone frontier child straight → Task 2 Step 2 (midpoint split); tested Task 1 Steps 2,3. ✅
- Contour-push outward only → Task 2 Step 3. ✅
- No overlap incl. 3-same-side (deferred §C) → tested Task 1 Step 7. ✅
- Spine special-cases (monotypic, heroLen) preserved → untouched above line 112; re-verified Task 2 Step 5. ✅
- Shared, no mode flag → signature unchanged (Global Constraints); Task 3 checks both modes. ✅
- Animation groundwork not regressed → plan doesn't touch SpineTree.svelte (noted). ✅

**Placeholder scan:** The contour-push `placeSide` is a "shape sketch" explicitly flagged to adapt for edges/minY/maxY — acceptable because the algorithm is fully specified in prose (Step 3 bullet list) and the sketch is complete for the core; the adaptation (push edges, track extremes) mirrors the existing code's per-block edge push. Not a vague TODO.

**Type consistency:** `OffBlock` gains `childName: string`; `SpineNode`/`SpineEdge`/`SpineLayout` unchanged. `layoutSpine` signature unchanged. `Contour = Map<number, number>` local. `placeSide` sign convention (+1 below, -1 above) matches the before/above, after/below split.

**One implementer note:** before changing the "deeper-attached nearer the spine" planar test (Task 2 Step 5), run it against the fixture first — it may still pass incidentally (A-Z packing can happen to nest deep-inner for this fixture). Only rewrite it if it actually fails; if it fails, its OLD premise (deepest-innermost) is the thing being replaced, so re-assert A-Z + no-overlap with a rationale comment rather than trying to preserve deepest-innermost.
