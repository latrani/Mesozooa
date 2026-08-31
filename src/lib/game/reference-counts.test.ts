import { describe, it, expect } from "vitest";
import { nodeView } from "./specimen-view";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);

/**
 * BESIDE, NEVER ON TOP — the executable form of the lens contract.
 *
 * The game screen carries two count-bearing cards and they answer different questions. The
 * selected-node panel (#69) is a REFERENCE card — its own spec fixes it as Explore's nodeView()
 * unchanged — so it reports true clade size in every tier. The answer card describes the hunt and
 * counts candidates. If a future change makes the lens write through to TreeNode, the reference
 * card silently starts disagreeing with Explore for the same node, and this test is what catches
 * it.
 */
describe("reference surfaces are never tier-relative", () => {
  it("nodeView reports the TRUE clade size even when the pool excludes most of the clade", () => {
    // A pool holding one of Tyrannosauridae's two genera. The engine sees 1; the reference card
    // must still say 2.
    const store = createTreeStore(tree, ["TR", "TC"]);
    expect(store.poolCount("TF")).toBe(1);
    expect(nodeView(store.getNode("TF")!).note).toBe("2 genera in this clade");
  });

  it("holds for the root as well", () => {
    const store = createTreeStore(tree, ["TR"]);
    expect(store.poolCount(tree.rootId)).toBe(1);
    expect(nodeView(store.getNode(tree.rootId)!).note).toBe("4 genera in this clade");
  });

  it("leaves the node objects themselves unmutated after a lens is built", () => {
    const before = { ...tree.nodes["TF"] };
    createTreeStore(tree, ["TR"]);
    createTreeStore(tree, []);
    expect(tree.nodes["TF"].descendantGenusCount).toBe(before.descendantGenusCount);
    expect(tree.nodes["TF"].branchDepth).toBe(before.branchDepth);
  });
});
