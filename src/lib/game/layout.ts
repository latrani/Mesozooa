import type { TreeStore } from "./treeStore";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  depth: number;
}

export interface LayoutEdge {
  parentId: string;
  childId: string;
}

export interface Layout {
  nodes: LayoutNode[];
  edges: LayoutEdge[];
  width: number;
  height: number;
}

export function layoutCladogram(store: TreeStore, revealed: Set<string>): Layout {
  const rootId = store.data.rootId;
  if (!revealed.has(rootId)) {
    return { nodes: [], edges: [], width: 0, height: 0 };
  }

  const revealedChildren = (id: string) =>
    store
      .children(id)
      .filter((c) => revealed.has(c.id))
      .sort((a, b) => a.name.localeCompare(b.name));

  const nodes: LayoutNode[] = [];
  const edges: LayoutEdge[] = [];
  let nextLeafY = 0;
  let maxDepth = 0;
  let maxY = 0;

  function visit(id: string, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const kids = revealedChildren(id);
    let y: number;
    if (kids.length === 0) {
      y = nextLeafY++;
    } else {
      const childYs = kids.map((k) => {
        edges.push({ parentId: id, childId: k.id });
        return visit(k.id, depth + 1);
      });
      y = (childYs[0] + childYs[childYs.length - 1]) / 2;
    }
    maxY = Math.max(maxY, y);
    nodes.push({ id, x: depth, y, depth });
    return y;
  }

  visit(rootId, 0);
  return { nodes, edges, width: maxDepth, height: maxY };
}
