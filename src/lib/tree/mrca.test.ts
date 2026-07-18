import { describe, it, expect } from "vitest";
import { pathToRoot, mrca } from "./mrca";
import { assembleTree, pruneSubtree } from "./assemble";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");

describe("pathToRoot", () => {
  it("walks node to root inclusive", () => {
    expect(pathToRoot(tree, "TR")).toEqual(["TR", "TF", "T", "Q430"]);
  });
});

describe("mrca", () => {
  it("finds the shared clade of two genera", () => {
    expect(mrca(tree, "TR", "TB")).toBe("TF"); // Tyrannosauridae
    expect(mrca(tree, "TR", "LO")).toBe("T"); // Theropoda
    expect(mrca(tree, "TR", "TC")).toBe("Q430"); // Dinosauria
  });
  it("is identity for the same node", () => {
    expect(mrca(tree, "TR", "TR")).toBe("TR");
  });
});
