import { RANK_GENUS } from "./types";
import type { RawTaxon, TreeData, TreeNode } from "./types";

export function pruneSubtree(raws: RawTaxon[], removeRootId: string): RawTaxon[] {
  const childrenOf = new Map<string, string[]>();
  for (const r of raws) {
    if (r.parentId) {
      if (!childrenOf.has(r.parentId)) childrenOf.set(r.parentId, []);
      childrenOf.get(r.parentId)!.push(r.id);
    }
  }
  const remove = new Set<string>([removeRootId]);
  const stack = [removeRootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const c of childrenOf.get(id) ?? []) {
      if (!remove.has(c)) { remove.add(c); stack.push(c); }
    }
  }
  return raws.filter((r) => !remove.has(r.id));
}

export function assembleTree(
  raws: RawTaxon[],
  rootId: string,
  dataVersion: string,
): TreeData {
  const byId = new Map(raws.map((r) => [r.id, r]));

  // Keep only nodes on a root -> genus path: walk each genus up to the root.
  const keep = new Set<string>();
  for (const r of raws) {
    if (r.rankId !== RANK_GENUS) continue;
    const chain: string[] = [];
    let cur: RawTaxon | undefined = r;
    let reachedRoot = false;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      chain.push(cur.id);
      if (cur.id === rootId) { reachedRoot = true; break; }
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
    if (reachedRoot) for (const id of chain) keep.add(id);
  }

  const nodes: Record<string, TreeNode> = {};
  for (const id of keep) {
    const r = byId.get(id)!;
    nodes[id] = {
      id: r.id,
      name: r.name,
      rankId: r.rankId,
      parentId: id === rootId ? null : r.parentId,
      childrenIds: [],
      depth: 0,
      descendantGenusCount: 0,
      isGenus: r.rankId === RANK_GENUS,
      playable: false,
      sitelinks: r.sitelinks ?? 0,
      imageUrl: r.imageUrl,
      wikipediaUrl: r.wikipediaUrl,
    };
  }
  for (const n of Object.values(nodes)) {
    if (n.parentId && nodes[n.parentId]) nodes[n.parentId].childrenIds.push(n.id);
  }

  // Depth: BFS from root.
  const queue: string[] = [rootId];
  nodes[rootId].depth = 0;
  while (queue.length) {
    const id = queue.shift()!;
    for (const c of nodes[id].childrenIds) {
      nodes[c].depth = nodes[id].depth + 1;
      queue.push(c);
    }
  }

  // descendantGenusCount: post-order (deepest first).
  const ordered = Object.values(nodes).sort((a, b) => b.depth - a.depth);
  for (const n of ordered) {
    let count = n.isGenus ? 1 : 0;
    for (const c of n.childrenIds) count += nodes[c].descendantGenusCount;
    n.descendantGenusCount = count;
  }

  return { dataVersion, rootId, nodes };
}
