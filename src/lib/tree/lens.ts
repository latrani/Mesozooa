import type { TreeData } from "./types";

/**
 * The three game rulers, measured against a POOL rather than the whole tree.
 *
 * A difficulty tier is a lens on the one tree, not a second tree: restricting a tree to a subset
 * of its leaves yields clades that are exactly the real clades intersected with the subset, so
 * every node the lens reports is a real node — the real MRCA of its surviving members. Nothing is
 * invented.
 *
 * BESIDE, NEVER ON TOP. A lens never writes to `TreeNode`. `descendantGenusCount` and
 * `branchDepth` keep meaning *true clade size* and *true narrowing depth* — that is what
 * `nodeView` (and through it the in-game info panel and Explore) reports, and what `a11y-tree`
 * speaks. Pool counts are engine-facing; the node's own counts are reference-facing.
 *
 * See docs/superpowers/specs/2026-08-29-difficulty-modes-design.md.
 */
export interface TreeLens {
  /** pool members at or below this node */
  poolCount(id: string): number;
  /** narrowing edges from root, counting only edges where the POOL count drops */
  branchDepth(id: string): number;
  /** lowest ancestor holding >= 2 pool members; the root if none does */
  terminalClade(id: string): string;
  inPool(id: string): boolean;
  poolIds(): string[];
}

export function createLens(tree: TreeData, pool: Iterable<string>): TreeLens {
  const inPool = new Set<string>();
  for (const id of pool) if (tree.nodes[id]) inPool.add(id);

  // Pool count: post-order (deepest first), same shape as assembleTree's own pass.
  const count = new Map<string, number>();
  const ordered = Object.values(tree.nodes).sort((a, b) => b.depth - a.depth);
  for (const n of ordered) {
    let c = inPool.has(n.id) ? 1 : 0;
    for (const cid of n.childrenIds) c += count.get(cid) ?? 0;
    count.set(n.id, c);
  }

  // branchDepth: BFS from root, incremented only where the POOL count narrows. Sparser than the
  // true-tree ruler — a clade whose pool membership matches its parent's adds nothing — which is
  // exactly why a small pool gets a shorter warmth runway.
  const depth = new Map<string, number>([[tree.rootId, 0]]);
  const queue: string[] = [tree.rootId];
  while (queue.length) {
    const id = queue.shift()!;
    const parentCount = count.get(id) ?? 0;
    for (const cid of tree.nodes[id].childrenIds) {
      const narrows = (count.get(cid) ?? 0) < parentCount;
      depth.set(cid, depth.get(id)! + (narrows ? 1 : 0));
      queue.push(cid);
    }
  }

  return {
    poolCount: (id) => count.get(id) ?? 0,
    branchDepth: (id) => depth.get(id) ?? 0,
    // `<= 1` where terminal.ts has `=== 1`: the lens must also skip ancestors holding ZERO pool
    // members, which the true-tree ruler never meets (every node holds at least its own genus).
    terminalClade(id) {
      let a = tree.nodes[id]?.parentId ?? null;
      while (a && (count.get(a) ?? 0) <= 1) a = tree.nodes[a].parentId;
      return a ?? tree.rootId;
    },
    inPool: (id) => inPool.has(id),
    poolIds: () => [...inPool],
  };
}
