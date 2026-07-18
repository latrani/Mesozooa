import { describe, it, expect } from "vitest";
import { layoutCladogram } from "./layout";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

describe("layoutCladogram", () => {
  it("is empty when the root is not revealed", () => {
    const l = layoutCladogram(store, new Set(["TR"]));
    expect(l.nodes).toEqual([]);
    expect(l.edges).toEqual([]);
  });

  it("places a single revealed chain by depth with y=0", () => {
    const l = layoutCladogram(store, new Set(["Q430", "T", "TF", "TR"]));
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    expect(byId.get("Q430")).toMatchObject({ x: 0, y: 0, depth: 0 });
    expect(byId.get("T")).toMatchObject({ x: 1, y: 0 });
    expect(byId.get("TF")).toMatchObject({ x: 2, y: 0 });
    expect(byId.get("TR")).toMatchObject({ x: 3, y: 0 });
    expect(l.edges).toEqual(
      expect.arrayContaining([
        { parentId: "Q430", childId: "T" },
        { parentId: "T", childId: "TF" },
        { parentId: "TF", childId: "TR" },
      ]),
    );
    expect(l.width).toBe(3);
    expect(l.height).toBe(0);
  });

  it("spreads sibling leaves and centers their parent", () => {
    const l = layoutCladogram(store, new Set(["Q430", "T", "TF", "TR", "TB"]));
    const byId = new Map(l.nodes.map((n) => [n.id, n]));
    // children of TF ordered alphabetically: Tarbosaurus(TB)=0, Tyrannosaurus(TR)=1
    expect(byId.get("TB")!.y).toBe(0);
    expect(byId.get("TR")!.y).toBe(1);
    expect(byId.get("TF")!.y).toBe(0.5);
    expect(byId.get("Q430")!.y).toBe(0.5);
    expect(l.height).toBe(1);
  });
});
