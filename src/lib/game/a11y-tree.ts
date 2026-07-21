import type { TreeStore } from "./treeStore";
import { displayName } from "./displayName";

export interface A11yNode {
  id: string;
  name: string;
  isGenus: boolean;
  descendantGenusCount: number;
  children: A11yNode[];
}

// The revealed set is normally a connected subtree from the root. `yOf` (the SVG's visual
// y-position per node) orders siblings top-to-bottom so depth-first focus movement tracks the
// on-screen ring as closely as a hierarchy-honest traversal can. Nodes missing from the layout
// sort last (Infinity), name as the deterministic tiebreak.
export function a11yTree(
  store: TreeStore,
  revealed: Set<string>,
  yOf: (id: string) => number,
): A11yNode[] {
  if (revealed.size === 0) return [];

  // Find the tree root by following the path of any revealed node
  const firstRevealed = [...revealed][0];
  const pathToRoot = store.pathToRoot(firstRevealed);
  const rootId = pathToRoot[pathToRoot.length - 1];

  // If the tree root is not revealed, return empty
  if (!revealed.has(rootId)) return [];

  const parentOf = (id: string): string | null => {
    const path = store.pathToRoot(id); // [id, parent, ..., root]
    return path.length > 1 ? path[1] : null;
  };

  const build = (id: string): A11yNode => {
    const node = store.getNode(id)!;
    // Collect children with their store order index
    const childrenWithIndex: Array<{ id: string; storeIdx: number }> = [];
    store.children(id).forEach((child, idx) => {
      if (revealed.has(child.id)) {
        childrenWithIndex.push({ id: child.id, storeIdx: idx });
      }
    });
    // Sort by y position. When y values are equal:
    // - If both are Infinity (no layout info), preserve store order
    // - Otherwise, use name as deterministic tiebreak
    const cmp = (a: { id: string; storeIdx: number }, b: { id: string; storeIdx: number }): number => {
      const yA = yOf(a.id);
      const yB = yOf(b.id);
      if (yA !== yB) return yA - yB;
      // Both have equal y; tiebreak depends on whether they're missing from layout
      if (yA === Infinity) return a.storeIdx - b.storeIdx; // preserve store order
      return (store.getNode(a.id)?.name ?? "").localeCompare(store.getNode(b.id)?.name ?? ""); // alphabetical
    };
    const kids = childrenWithIndex.sort(cmp).map((c) => build(c.id));
    return {
      id,
      name: displayName(node.name),
      isGenus: node.isGenus,
      descendantGenusCount: node.descendantGenusCount,
      children: kids,
    };
  };

  // A revealed id is a root iff it has no revealed parent (parent null, or not revealed).
  // In the normal connected case only the tree root qualifies; a disconnected revealed node
  // still surfaces here rather than vanishing (the orphan safety net).
  const roots = [...revealed]
    .filter((id) => store.getNode(id) !== undefined)
    .filter((id) => {
      const par = parentOf(id);
      return par === null || !revealed.has(par);
    });

  // Sort roots by y position, with name as deterministic tiebreak
  const cmpRoots = (a: string, b: string): number =>
    (yOf(a) - yOf(b)) ||
    (store.getNode(a)?.name ?? "").localeCompare(store.getNode(b)?.name ?? "");

  return roots.sort(cmpRoots).map(build);
}

export function flattenVisible(roots: A11yNode[]): A11yNode[] {
  const out: A11yNode[] = [];
  const walk = (n: A11yNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}
