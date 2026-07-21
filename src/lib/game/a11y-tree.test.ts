import { describe, it, expect } from "vitest";
import { a11yTree, flattenVisible } from "./a11y-tree";
import type { A11yNode } from "./a11y-tree";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

// Deterministic synthetic y so sibling ordering is under test control.
const yMap = (m: Record<string, number>) => (id: string) => m[id] ?? Infinity;
const ids = (ns: A11yNode[]) => ns.map((n) => n.id);

const FULL = new Set(["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"]);

describe("a11yTree", () => {
  it("nests revealed nodes by real parent -> child from the root", () => {
    const [root] = a11yTree(store, FULL, yMap({ T: 0, O: 1 }));
    expect(root.id).toBe("Q430");
    expect(ids(root.children)).toEqual(["T", "O"]); // T y=0 above O y=1
    const t = root.children[0];
    expect(ids(t.children)).toEqual(["LO", "TF"]); // both missing from y-map -> name tiebreak
  });

  it("orders siblings by visual y ascending, name as tiebreak", () => {
    const tf = (yf: (id: string) => number) => {
      const [root] = a11yTree(store, FULL, yf);
      const t = root.children.find((n) => n.id === "T")!;
      return t.children.find((n) => n.id === "TF")!;
    };
    expect(ids(tf(yMap({ TR: 5, TB: 1 })).children)).toEqual(["TB", "TR"]);
    expect(ids(tf(yMap({ TR: 1, TB: 5 })).children)).toEqual(["TR", "TB"]);
    // equal y -> name tiebreak: Tarbosaurus before Tyrannosaurus
    expect(ids(tf(yMap({ TR: 2, TB: 2 })).children)).toEqual(["TB", "TR"]);
  });

  it("classifies genus vs clade and carries descendant counts", () => {
    const [root] = a11yTree(store, FULL, yMap({}));
    expect(root).toMatchObject({ isGenus: false, descendantGenusCount: 4, name: "Dinosauria" });
    const tr = flattenVisible([root]).find((n) => n.id === "TR")!;
    expect(tr).toMatchObject({ isGenus: true, descendantGenusCount: 1 });
  });

  it("keeps a revealed clade whose children are unrevealed as a childless clade (frontier)", () => {
    const [root] = a11yTree(store, new Set(["Q430", "T"]), yMap({}));
    expect(ids(root.children)).toEqual(["T"]);
    const t = root.children[0];
    expect(t.isGenus).toBe(false);
    expect(t.children).toEqual([]); // frontier -> drives aria-expanded="false"
  });

  it("surfaces a revealed node whose parent is unrevealed as an extra root (orphan safety net)", () => {
    const roots = a11yTree(store, new Set(["Q430", "TF"]), yMap({ Q430: 0, TF: 1 }));
    expect(ids(roots).sort()).toEqual(["Q430", "TF"]);
  });

  it("returns empty when the root is not revealed", () => {
    expect(a11yTree(store, new Set(["TR"]), yMap({}))).toEqual([]);
    expect(a11yTree(store, new Set(), yMap({}))).toEqual([]);
  });

  it("returns empty for a rootless revealed fragment (mirrors layoutSpine's root gate)", () => {
    // TF, TR revealed but the tree root (Q430) is not -> nothing renders, like the SVG.
    expect(a11yTree(store, new Set(["TF", "TR"]), yMap({}))).toEqual([]);
  });
});

describe("flattenVisible", () => {
  it("is preorder DFS honoring the sibling order", () => {
    const roots = a11yTree(store, FULL, yMap({ T: 0, O: 1, TF: 0, LO: 1, TR: 0, TB: 1 }));
    expect(ids(flattenVisible(roots))).toEqual(
      ["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"],
    );
  });
});

import { buildNav, resolveKey } from "./a11y-tree";

describe("buildNav + resolveKey", () => {
  // Tree: Q430 -> [T -> [TF -> [TR, TB], LO], O -> [CF -> [TC]]]
  const roots = a11yTree(
    store,
    FULL,
    yMap({ T: 0, O: 1, TF: 0, LO: 1, TR: 0, TB: 1 }),
  );
  const nav = buildNav(roots);
  const key = (cur: string, k: string) => resolveKey(nav, cur, k);

  it("ArrowDown/Up walk the flattened order and stop at the ends", () => {
    expect(nav.order).toEqual(["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"]);
    expect(key("TF", "ArrowDown")).toBe("TR");
    expect(key("TF", "ArrowUp")).toBe("T");
    expect(key("Q430", "ArrowUp")).toBeNull(); // first item
    expect(key("TC", "ArrowDown")).toBeNull(); // last item
  });

  it("ArrowRight goes to first child; ArrowLeft goes to parent", () => {
    expect(key("T", "ArrowRight")).toBe("TF");
    expect(key("TR", "ArrowRight")).toBeNull(); // genus leaf, no child
    expect(key("TF", "ArrowLeft")).toBe("T");
    expect(key("Q430", "ArrowLeft")).toBeNull(); // root, no parent
  });

  it("Home/End jump to the first/last visible item; unknown keys do nothing", () => {
    expect(key("TC", "Home")).toBe("Q430");
    expect(key("Q430", "End")).toBe("TC");
    expect(key("T", "a")).toBeNull();
  });
});
