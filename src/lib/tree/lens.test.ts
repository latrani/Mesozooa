import { describe, it, expect } from "vitest";
import { createLens } from "./lens";
import { terminalClade } from "./terminal";
import { assembleTree, pruneSubtree } from "./assemble";
import { FIXTURE_RAWS, MONO_FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
const mono = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");

describe("createLens — counts", () => {
  it("counts only pool members below a node", () => {
    const lens = createLens(tree, ["TR", "TB"]);
    expect(lens.poolCount("TF")).toBe(2);
    expect(lens.poolCount("Q430")).toBe(2);
    expect(lens.poolCount("TC")).toBe(0); // a genus outside the pool counts for nothing
  });

  it("counts the pool, not the tree", () => {
    // TF holds two genera, but only one of them is in this pool.
    const lens = createLens(tree, ["TR", "TC"]);
    expect(lens.poolCount("TF")).toBe(1);
    expect(tree.nodes["TF"].descendantGenusCount).toBe(2); // the node's own count is untouched
  });

  it("reports 0 for an unknown id rather than throwing", () => {
    const lens = createLens(tree, ["TR", "TB"]);
    expect(lens.poolCount("nope")).toBe(0);
  });
});

describe("createLens — terminalClade", () => {
  it("needs TWO pool members, where terminal.ts needs two genera", () => {
    // The divergence this whole slice exists for. TF holds Tyrannosaurus + Tarbosaurus, so the
    // true-tree ruler stops there. With only TR in the pool, TF is a dead end for the player —
    // no legal guess can land inside it — so the lens walks past it to the root.
    const lens = createLens(tree, ["TR", "TC"]);
    expect(terminalClade(tree, "TR")).toBe("TF");
    expect(lens.terminalClade("TR")).toBe("Q430");
  });

  it("stops at the first ancestor holding two pool members", () => {
    const lens = createLens(tree, ["TR", "TB"]);
    expect(lens.terminalClade("TR")).toBe("TF");
  });

  it("skips through a monotypic run exactly as the true-tree ruler does", () => {
    // Whole pool: every genus present, so the lens should agree with terminal.ts everywhere.
    const lens = createLens(mono, ["GA1", "GA2", "GB1", "OT"]);
    expect(lens.terminalClade("GA1")).toBe("SA");
    expect(lens.terminalClade("GA1")).toBe(terminalClade(mono, "GA1"));
    // GB1 is alone under SB, so both rulers climb the monotypic run B1 -> MA -> MB.
    expect(lens.terminalClade("GB1")).toBe("MB");
  });

  it("returns the root for a single-member pool rather than looping", () => {
    const lens = createLens(tree, ["TR"]);
    expect(lens.terminalClade("TR")).toBe("Q430");
  });

  it("returns the root for an empty pool", () => {
    const lens = createLens(tree, []);
    expect(lens.poolCount("Q430")).toBe(0);
    expect(lens.terminalClade("TR")).toBe("Q430");
  });
});

describe("createLens — branchDepth", () => {
  it("increments only where the POOL count narrows", () => {
    // Pool = TR + TB only. Q430(2) -> T(2) -> TF(2) never narrows, so every one of those nodes
    // sits at branchDepth 0; only the genera themselves narrow it to 1.
    const lens = createLens(tree, ["TR", "TB"]);
    expect(lens.branchDepth("Q430")).toBe(0);
    expect(lens.branchDepth("T")).toBe(0);
    expect(lens.branchDepth("TF")).toBe(0);
    expect(lens.branchDepth("TR")).toBe(1);
  });

  it("gives a shorter runway than the true-tree ruler when the pool is sparse", () => {
    // The 40% effect in miniature: the same target's terminal clade sits at a lower branchDepth
    // under the lens than on the full tree, so the warmth ramp reaches the anchor sooner.
    const lens = createLens(tree, ["TR", "TB"]);
    expect(lens.branchDepth("TF")).toBeLessThan(tree.nodes["TF"].branchDepth);
  });

  it("counts a real narrowing once per narrowing edge", () => {
    const lens = createLens(tree, ["TR", "TB", "TC"]);
    // Q430(3) -> T(2) narrows, T(2) -> TF(2) does not, TF(2) -> TR(1) narrows.
    expect(lens.branchDepth("Q430")).toBe(0);
    expect(lens.branchDepth("T")).toBe(1);
    expect(lens.branchDepth("TF")).toBe(1);
    expect(lens.branchDepth("TR")).toBe(2);
  });
});

describe("createLens — pool membership", () => {
  it("exposes the pool it was built from, ignoring unknown ids", () => {
    const lens = createLens(tree, ["TR", "TB", "nope"]);
    expect(lens.inPool("TR")).toBe(true);
    expect(lens.inPool("TC")).toBe(false);
    expect(lens.poolIds().sort()).toEqual(["TB", "TR"]);
  });
});
