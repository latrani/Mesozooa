import { describe, it, expect } from "vitest";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

describe("createTreeStore", () => {
  it("gets a node by id", () => {
    expect(store.getNode("TR")?.name).toBe("Tyrannosaurus");
    expect(store.getNode("nope")).toBeUndefined();
  });
  it("returns children nodes", () => {
    expect(store.children("TF").map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("exposes pathToRoot and mrca over the tree", () => {
    expect(store.pathToRoot("TR")).toEqual(["TR", "TF", "T", "Q430"]);
    expect(store.mrca("TR", "TC")).toBe("Q430");
  });
  it("lists playable genera", () => {
    expect(store.playableGenera().map((n) => n.id).sort()).toEqual(["LO", "TB", "TC", "TR"]);
  });
  it("reports playability", () => {
    expect(store.isPlayable("TR")).toBe(true);
    expect(store.isPlayable("LO")).toBe(true); // genus with an article — playable
    expect(store.isPlayable("TF")).toBe(false); // family, not a genus
    expect(store.isPlayable("nope")).toBe(false);
  });
  it("exposes rootCount = root descendantGenusCount", () => {
    expect(store.rootCount).toBe(4);
  });
});
