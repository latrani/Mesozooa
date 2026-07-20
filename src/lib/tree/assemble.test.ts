import { describe, it, expect } from "vitest";
import { pruneSubtree, assembleTree } from "./assemble";
import { FIXTURE_RAWS, MONO_FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

describe("pruneSubtree", () => {
  it("removes the node and all its descendants", () => {
    const kept = pruneSubtree(FIXTURE_RAWS, NEORNITHES).map((r) => r.id);
    expect(kept).not.toContain("Q19163");
    expect(kept).not.toContain("PA");
    expect(kept).toContain("TR");
  });
});

describe("assembleTree", () => {
  const tree = assembleTree(
    pruneSubtree(FIXTURE_RAWS, NEORNITHES),
    DINOSAURIA,
    "test",
  );

  it("keeps only in-scope nodes", () => {
    expect(Object.keys(tree.nodes).sort()).toEqual(
      ["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"].sort(),
    );
  });

  it("links children", () => {
    expect(tree.nodes["TF"].childrenIds.sort()).toEqual(["TB", "TR"]);
    expect(tree.nodes["Q430"].childrenIds.sort()).toEqual(["O", "T"]);
  });

  it("computes depth from the root", () => {
    expect(tree.nodes["Q430"].depth).toBe(0);
    expect(tree.nodes["T"].depth).toBe(1);
    expect(tree.nodes["TR"].depth).toBe(3);
    expect(tree.nodes["LO"].depth).toBe(2);
  });

  it("counts descendant genera", () => {
    expect(tree.nodes["Q430"].descendantGenusCount).toBe(4);
    expect(tree.nodes["T"].descendantGenusCount).toBe(3);
    expect(tree.nodes["TF"].descendantGenusCount).toBe(2);
    expect(tree.nodes["CF"].descendantGenusCount).toBe(1);
  });

  it("flags genera", () => {
    expect(tree.nodes["TR"].isGenus).toBe(true);
    expect(tree.nodes["TF"].isGenus).toBe(false);
  });

  it("carries sitelinks (default 0 when absent)", () => {
    expect(tree.nodes["TR"].sitelinks).toBe(0);
  });
  it("carries a provided sitelinks count", () => {
    const withSl = assembleTree(
      pruneSubtree(FIXTURE_RAWS.map((r) => (r.id === "TR" ? { ...r, sitelinks: 42 } : r)), NEORNITHES),
      DINOSAURIA,
      "test",
    );
    expect(withSl.nodes["TR"].sitelinks).toBe(42);
  });
});

describe("assembleTree branchDepth", () => {
  it("collapses monotypic runs (unchanged genus count adds 0 depth)", () => {
    const tree = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");
    const bd = (id: string) => tree.nodes[id].branchDepth;
    expect(bd("MR")).toBe(0);          // root
    expect(bd("B1")).toBe(1);          // 3 < 4: a real narrowing
    expect(bd("MA")).toBe(1);          // 3 == 3: monotypic, no step
    expect(bd("MB")).toBe(1);          // 3 == 3: monotypic, no step
    expect(bd("SA")).toBe(2);          // 2 < 3: a real narrowing
  });
});
