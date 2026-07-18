import { describe, it, expect } from "vitest";
import { terminalClade } from "./terminal";
import { assembleTree, pruneSubtree } from "./assemble";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");

describe("terminalClade", () => {
  it("is the parent when the parent has >1 genus", () => {
    expect(terminalClade(tree, "TR")).toBe("TF"); // TF has TR + TB
    expect(terminalClade(tree, "TB")).toBe("TF");
  });
  it("skips monotypic ancestors up to the first branching clade", () => {
    // TC's parent CF (1 genus) and grandparent O (1 genus) are monotypic -> Q430 (4 genera)
    expect(terminalClade(tree, "TC")).toBe("Q430");
  });
  it("uses the branching parent for a genus directly under a multi-genus clade", () => {
    expect(terminalClade(tree, "LO")).toBe("T"); // T has TF-subtree genera + LO
  });
});
