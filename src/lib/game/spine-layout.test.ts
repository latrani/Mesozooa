import { describe, it, expect } from "vitest";
import { layoutSpine, centerOffsetFor, edgePathBetween, isStepBack, coyotePadDelta } from "./spine-layout";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA, RANK_GENUS } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);
const byId = (l: ReturnType<typeof layoutSpine>) => new Map(l.nodes.map((n) => [n.id, n]));

describe("layoutSpine", () => {
  it("is empty when warmestId is null or root/warmest not revealed", () => {
    expect(layoutSpine(store, new Set(["Q430"]), null).nodes).toEqual([]);
    expect(layoutSpine(store, new Set(["TR"]), "TR").nodes).toEqual([]); // root not revealed
  });

  it("lays the spine straight at y=0 by depth; a branch-point's lone frontier child SPLAYS off-axis", () => {
    // TF (warmest) is a structural branch point (children TB+TR); only TR revealed. The axis is
    // reserved for the spine + structural-monotypic continuations, so TR splays OFF it (not y=0).
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR"]), "TF");
    const m = byId(l);
    expect(m.get("Q430")).toMatchObject({ x: 0, y: 0, depth: 0, onSpine: true });
    expect(m.get("T")).toMatchObject({ x: 1, y: 0, onSpine: true });
    expect(m.get("TF")).toMatchObject({ x: 2, y: 0, onSpine: true });
    expect(m.get("TR")).toMatchObject({ x: 3, onSpine: false });
    expect(m.get("TR")!.y).not.toBe(0); // splays, does not run down the axis
    expect(l.edges).toEqual(
      expect.arrayContaining([
        { parentId: "Q430", childId: "T", onSpine: true },
        { parentId: "T", childId: "TF", onSpine: true },
        { parentId: "TF", childId: "TR", onSpine: false },
      ]),
    );
  });

  it("splays two frontier children to opposite sides (name order: TB above, TR below)", () => {
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR", "TB"]), "TF");
    const m = byId(l);
    expect(m.get("TF")!.y).toBe(0);
    expect(m.get("TB")).toMatchObject({ x: 3, y: -1, onSpine: false }); // Tarbosaurus first -> above
    expect(m.get("TR")).toMatchObject({ x: 3, y: 1, onSpine: false }); // Tyrannosaurus -> below
    expect(l).toMatchObject({ minY: -1, maxY: 1 });
  });

  it("packs an alphabetically-earlier sibling's chain above the axis (O before T at the root)", () => {
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "O", "CF", "TC"]), "TF");
    const m = byId(l);
    expect(m.get("O")).toMatchObject({ x: 1, y: -1, onSpine: false });
    expect(m.get("CF")).toMatchObject({ x: 2, y: -1, onSpine: false });
    expect(m.get("TC")).toMatchObject({ x: 3, y: -1, onSpine: false });
    expect(m.get("Q430")!.onSpine).toBe(true);
    expect(l).toMatchObject({ width: 3, minY: -1, maxY: 0 });
  });

  it("is a straight chain when warmest is the deepest revealed node", () => {
    const l = layoutSpine(store, new Set(["Q430", "O", "CF", "TC"]), "TC");
    expect(l.nodes.every((n) => n.onSpine && n.y === 0)).toBe(true);
    expect(l).toMatchObject({ width: 3, minY: 0, maxY: 0 });
  });

  it("extends a structurally-monotypic revealed frontier child straight, but as a branch not hero-spine", () => {
    // Focus O: revealed = O + Q430 + their children (T, CF). CF is O's only child (monotypic),
    // so it lays STRAIGHT on the axis at y=0 (not splayed). But the hero spine ends at the
    // warmest/focused node (O), so CF and its edge render as an ordinary branch (onSpine:false)
    // — thin edge, context dot — not the thick warmth-colored spine.
    const l = layoutSpine(store, new Set(["Q430", "O", "T", "CF"]), "O");
    const m = byId(l);
    expect(m.get("O")).toMatchObject({ x: 1, y: 0, onSpine: true }); // O is the warmest → hero
    expect(m.get("CF")).toMatchObject({ x: 2, y: 0, onSpine: false }); // straight, but a branch
    expect(l.edges).toEqual(
      expect.arrayContaining([{ parentId: "O", childId: "CF", onSpine: false }]),
    );
  });


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

  it("splays a branch-point's lone revealed child OFF the axis (axis reserved for spine/monotypic)", () => {
    // Game one-wrong-guess shape: guess TR, target TC → warmest = MRCA = Q430 (Dinosauria), a
    // branch point. Revealed is only TR's lineage (Q430→T→TF→TR). Q430 is the frontier with ONE
    // revealed child (T). It is NOT structurally monotypic (Q430 has O + T), so T's lineage must
    // SPLAY off the axis — the axis stays reserved for the true spine. The BUG centered the lone
    // child straight down the axis (wrong guess ran through the spine).
    const l = layoutSpine(store, new Set(["Q430", "T", "TF", "TR"]), "Q430");
    const m = byId(l);
    expect(m.get("Q430")).toMatchObject({ y: 0, onSpine: true }); // the spine tip stays on-axis
    // the whole wrong-guess lineage splays to one side — none of it on the axis
    expect(m.get("T")!.y).not.toBe(0);
    expect(m.get("TF")!.y).not.toBe(0);
    expect(m.get("TR")!.y).not.toBe(0);
  });

  it("stacks distinct same-side blocks in distinct bands (no cross-block interleave)", () => {
    // Spine Q430->T->TF (warmest TF). ABOVE the axis: the O->CF->TC chain (Q430's other child,
    // alphabetically before T) is ONE block laid flat at a single y; TF's frontier child TB is
    // ANOTHER block. The BUG (per-column contour): O(x=1) and TB(x=3) share no column, so both
    // grabbed the innermost row and visually interleaved. FIX (per-side stacking): each block
    // reserves its own band, so the TWO blocks' y-rows don't overlap. (Nodes WITHIN the O-chain
    // legitimately share a y — a chain is a flat horizontal run — so we compare block bands, not
    // individual node rows.)
    const l = layoutSpine(store, new Set(["Q430", "O", "CF", "TC", "T", "TF", "TR", "TB"]), "TF");
    const m = byId(l);
    const chainYs = ["O", "CF", "TC"].map((id) => m.get(id)!.y); // the flat chain: all one band
    const tbY = m.get("TB")!.y; // the other above block
    expect(new Set(chainYs).size).toBe(1); // chain is a single flat row
    expect(chainYs).not.toContain(tbY); // TB sits in a DIFFERENT band, not interleaved
    // and no two nodes anywhere share an (x,y) cell
    const cells = l.nodes.map((n) => `${n.x},${n.y}`);
    expect(new Set(cells).size).toBe(cells.length);
  });

  it("re-anchors without reordering: switching the on-spine child slides the fan, order preserved", () => {
    // Same revealed set, two different warmest picks within TF's fan. TB and TR keep their A-Z
    // RELATIVE order (TB before TR => TB stays above TR) regardless of which is on-spine.
    const revealed = new Set(["Q430", "T", "TF", "TR", "TB"]);
    const withTB = byId(layoutSpine(store, revealed, "TF")); // neither on spine (frontier=TF)
    // TB is alphabetically before TR in both layouts -> TB.y < TR.y always.
    expect(withTB.get("TB")!.y).toBeLessThan(withTB.get("TR")!.y);
  });

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
});

describe("layoutSpine — off-spine nesting is planar", () => {
  // A tree the OLD spine-traversal order lays out with a crossing:
  //   spine R->A->B->W (warmest). A deep chain hangs off the SHALLOW root (attach depth 0)
  //   and two leaves hang off the DEEP node B (attach depth 2). The old code places blocks in
  //   spine order (shallow first => shallow innermost), so the deep leaf's riser slices through
  //   the shallow chain's long horizontal run. Deepest-innermost nesting removes the crossing.
  const CLADE = "Q713623";
  const RAWS = [
    { id: "R", name: "Root", rankId: CLADE, parentId: null },
    { id: "A", name: "A", rankId: CLADE, parentId: "R" },
    { id: "B", name: "B", rankId: CLADE, parentId: "A" },
    { id: "W", name: "Wsp", rankId: RANK_GENUS, parentId: "B", wikipediaUrl: "w" },
    { id: "L1", name: "Leafone", rankId: RANK_GENUS, parentId: "B", wikipediaUrl: "w" },
    { id: "L2", name: "Leaftwo", rankId: RANK_GENUS, parentId: "B", wikipediaUrl: "w" },
    { id: "C1", name: "Chainone", rankId: CLADE, parentId: "R" },
    { id: "C2", name: "Chaintwo", rankId: CLADE, parentId: "C1" },
    { id: "C3", name: "Chainthree", rankId: RANK_GENUS, parentId: "C2", wikipediaUrl: "w" },
  ];
  const store2 = createTreeStore(assembleTree(RAWS, "R", "test"));
  const revealed = new Set(["R", "A", "B", "W", "L1", "L2", "C1", "C2", "C3"]);

  it("keeps all off-spine children of one INTERIOR spine node on the same side (no straddling)", () => {
    // R->A->B->W spine. Interior node A (spine continues past it to B) has two extra genus
    // children X1,X2 besides B. Per-block alternation would split them above/below, straddling
    // the spine. They must land on the SAME side.
    const CLADE2 = "Q713623";
    const raws = [
      { id: "R", name: "Root", rankId: CLADE2, parentId: null },
      { id: "A", name: "A", rankId: CLADE2, parentId: "R" },
      { id: "B", name: "B", rankId: CLADE2, parentId: "A" },
      { id: "W", name: "Wsp", rankId: RANK_GENUS, parentId: "B", wikipediaUrl: "w" },
      { id: "X1", name: "Xone", rankId: RANK_GENUS, parentId: "A", wikipediaUrl: "w" },
      { id: "X2", name: "Xtwo", rankId: RANK_GENUS, parentId: "A", wikipediaUrl: "w" },
    ];
    const st = createTreeStore(assembleTree(raws, "R", "test"));
    const l = layoutSpine(st, new Set(["R", "A", "B", "W", "X1", "X2"]), "W");
    const m = byId(l);
    expect(Math.sign(m.get("X1")!.y)).toBe(Math.sign(m.get("X2")!.y));
    expect(m.get("X1")!.y).not.toBe(0);
  });

  it("places deeper-attached blocks nearer the spine than shallower ones on the same side", () => {
    const l = layoutSpine(store2, revealed, "W");
    const m = byId(l);
    const spineIds = new Set(l.nodes.filter((n) => n.onSpine).map((n) => n.id));

    // Off-spine "block roots" = off-spine edges whose parent is on the spine.
    const blockRoots = l.edges
      .filter((e) => !e.onSpine && spineIds.has(e.parentId))
      .map((e) => ({ y: m.get(e.childId)!.y, attach: m.get(e.parentId)!.depth }));

    for (const side of [
      blockRoots.filter((b) => b.y < 0), // above
      blockRoots.filter((b) => b.y > 0), // below
    ]) {
      // Sort spine-outward (increasing |y|); attachment depth must be non-increasing.
      const outward = side.slice().sort((a, b) => Math.abs(a.y) - Math.abs(b.y));
      for (let i = 1; i < outward.length; i++) {
        expect(outward[i].attach).toBeLessThanOrEqual(outward[i - 1].attach);
      }
    }
  });

  // Regression for #17: the fixture above splays its two blocks to OPPOSITE sides (the A-Z split
  // sends the deep chain below and the leaves above), so each side ends up with a single attach
  // depth and the non-increasing-attach assertion holds trivially — deepestFirst is never actually
  // exercised. This fixture forces TWO different parents (attach depths 0 and 2) to fan blocks onto
  // the SAME side, which is the only configuration where deepestFirst's ordering matters: the
  // shallow-attached deep chain must nest OUTSIDE the deep-attached leaf, or the leaf's riser slices
  // through the chain's long horizontal run.
  it("nests two same-side blocks with DIFFERENT attach depths deepest-innermost (crossing case)", () => {
    // Spine Root→Sspine→Tspine→Wsp. Names chosen so both off-spine blocks sort ABOVE their anchor:
    //   - parent Root (attach 0): a deep chain "Achain→Bchain→Cgenus"; "Achain" < anchor "Sspine".
    //   - parent Tspine (attach 2): a leaf "Dleaf"; "Dleaf" < anchor "Wsp".
    // Both land above → same side, attach depths 0 and 2 → deepestFirst decides the nesting.
    const CL = "Q713623";
    const raws = [
      { id: "R", name: "Root", rankId: CL, parentId: null },
      { id: "S", name: "Sspine", rankId: CL, parentId: "R" },
      { id: "T", name: "Tspine", rankId: CL, parentId: "S" },
      { id: "W", name: "Wsp", rankId: RANK_GENUS, parentId: "T", wikipediaUrl: "w" },
      { id: "AC", name: "Achain", rankId: CL, parentId: "R" }, // attach depth 0, deep
      { id: "BC", name: "Bchain", rankId: CL, parentId: "AC" },
      { id: "CG", name: "Cgenus", rankId: RANK_GENUS, parentId: "BC", wikipediaUrl: "w" },
      { id: "DL", name: "Dleaf", rankId: RANK_GENUS, parentId: "T", wikipediaUrl: "w" }, // attach depth 2
    ];
    const st = createTreeStore(assembleTree(raws, "R", "test"));
    const l = layoutSpine(st, new Set(["R", "S", "T", "W", "AC", "BC", "CG", "DL"]), "W");
    const m = byId(l);
    const spineIds = new Set(l.nodes.filter((n) => n.onSpine).map((n) => n.id));
    const blockRoots = l.edges
      .filter((e) => !e.onSpine && spineIds.has(e.parentId))
      .map((e) => ({ id: e.childId, y: m.get(e.childId)!.y, attach: m.get(e.parentId)!.depth }));

    // The chain root (AC, attach 0) and the leaf (DL, attach 2) must share a side...
    const ac = blockRoots.find((b) => b.id === "AC")!;
    const dl = blockRoots.find((b) => b.id === "DL")!;
    expect(Math.sign(ac.y)).toBe(Math.sign(dl.y));
    // ...with TWO distinct attach depths on it — the guard against silent re-trivialization.
    const side = blockRoots.filter((b) => Math.sign(b.y) === Math.sign(dl.y));
    expect(new Set(side.map((b) => b.attach)).size).toBeGreaterThanOrEqual(2);
    // deepest-innermost: the deep-attached leaf sits NEARER the axis than the shallow chain root.
    expect(Math.abs(dl.y)).toBeLessThan(Math.abs(ac.y));
  });
});

describe("edgePathBetween", () => {
  it("same-row child → straight horizontal arm (no elbow)", () => {
    expect(edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 100 }, 16)).toBe("M 40 100 H 240");
  });
  it("child below → rounded elbow at parent x, child y", () => {
    // dy=52>0, dirY=1, r=min(16,26,100)=16
    expect(edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 152 }, 16))
      .toBe("M 40 100 V 136 Q 40 152 56 152 H 240");
  });
  it("child above → elbow up (dirY=-1)", () => {
    // dy=-52, dirY=-1, r=min(16,26,100)=16; V goes to cy - r*dirY = 48-16*-1 = 64
    const s = edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 48 }, 16);
    expect(s).toBe("M 40 100 V 64 Q 40 48 56 48 H 240");
  });
  it("clamps radius on a short riser", () => {
    // dy=10 → r=min(16,5,100) = 5
    expect(edgePathBetween({ x: 40, y: 100 }, { x: 240, y: 110 }, 16))
      .toBe("M 40 100 V 105 Q 40 110 45 110 H 240");
  });
});

describe("centerOffsetFor", () => {
  const m = { xGap: 180, pad: 28, contentWidth: 2000, viewportWidth: 600 };
  it("centers a mid-content node", () => {
    // node px = 28 + 3*180 = 568; centered scrollLeft = 568 - 300 = 268
    expect(centerOffsetFor(3, m)).toBe(268);
  });
  it("clamps to 0 at the left edge", () => {
    expect(centerOffsetFor(0, m)).toBe(0); // 28 - 300 < 0
  });
  it("clamps to the right edge", () => {
    // deep node would center past the end; clamp to contentWidth - viewportWidth = 1400
    expect(centerOffsetFor(50, m)).toBe(1400);
  });
  it("never returns negative when content is narrower than the viewport", () => {
    expect(centerOffsetFor(0, { xGap: 180, pad: 28, contentWidth: 300, viewportWidth: 600 })).toBe(0);
  });
  it("centers within the region LEFT of a rightInset (specimen overlay)", () => {
    // 200px covered on the right => centering window is 600-200=400 wide, center at 200.
    // node px = 568; scrollLeft = 568 - 200 = 368 (vs 268 with no inset).
    expect(centerOffsetFor(3, { ...m, rightInset: 200 })).toBe(368);
  });
  it("still clamps to the full-scroller right edge with a rightInset", () => {
    // max scroll is governed by the whole scroller (contentWidth - viewportWidth = 1400),
    // not the inset window — a deep node must not scroll past the content end.
    expect(centerOffsetFor(50, { ...m, rightInset: 200 })).toBe(1400);
  });
});

describe("isStepBack", () => {
  it("is true when the new tip is a proper ancestor of the old tip", () => {
    expect(isStepBack(store, "TF", "T")).toBe(true);   // parent
    expect(isStepBack(store, "TR", "T")).toBe(true);    // grandparent
    expect(isStepBack(store, "TF", "Q430")).toBe(true); // the root
  });
  it("is false for forward, lateral, same-node, and first-mount moves", () => {
    expect(isStepBack(store, "T", "TF")).toBe(false);   // deeper (forward)
    expect(isStepBack(store, "TF", "O")).toBe(false);   // sibling subtree (lateral)
    expect(isStepBack(store, "TF", "TF")).toBe(false);  // same node (pathToRoot includes self)
    expect(isStepBack(store, null, "TF")).toBe(false);  // first mount
  });
});

describe("coyotePadDelta", () => {
  it("reserves the collapsed columns' width", () => {
    expect(coyotePadDelta(10, 9, 200)).toBe(200);  // one column lost
    expect(coyotePadDelta(10, 7, 200)).toBe(600);  // three columns lost
  });
  it("clamps at 0 when width did not shrink (forward/lateral misclassification is harmless)", () => {
    expect(coyotePadDelta(9, 10, 200)).toBe(0);    // grew
    expect(coyotePadDelta(9, 9, 200)).toBe(0);     // unchanged
  });
});
