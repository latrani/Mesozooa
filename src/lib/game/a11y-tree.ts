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

  // Siblings order by visual y ascending; equal y (or both missing from the layout) fall back
  // to name. Comparing with < avoids the NaN that Infinity - Infinity would produce.
  const cmp = (a: string, b: string): number => {
    const ya = yOf(a);
    const yb = yOf(b);
    if (ya !== yb) return ya < yb ? -1 : 1;
    return (store.getNode(a)?.name ?? "").localeCompare(store.getNode(b)?.name ?? "");
  };

  const build = (id: string): A11yNode => {
    const node = store.getNode(id)!;
    const kids = store
      .children(id)
      .filter((c) => revealed.has(c.id))
      .map((c) => c.id)
      .sort(cmp)
      .map(build);
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

  return roots.sort(cmp).map(build);
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

export interface TreeNav {
  order: string[];
  parent: Record<string, string>;
  firstChild: Record<string, string>;
}

export function buildNav(roots: A11yNode[]): TreeNav {
  const order = flattenVisible(roots).map((n) => n.id);
  const parent: Record<string, string> = {};
  const firstChild: Record<string, string> = {};
  const walk = (n: A11yNode) => {
    if (n.children.length > 0) firstChild[n.id] = n.children[0].id;
    for (const c of n.children) {
      parent[c.id] = n.id;
      walk(c);
    }
  };
  roots.forEach(walk);
  return { order, parent, firstChild };
}

export function resolveKey(nav: TreeNav, currentId: string, key: string): string | null {
  const i = nav.order.indexOf(currentId);
  if (i === -1) return null;
  switch (key) {
    case "ArrowDown":
      return i + 1 < nav.order.length ? nav.order[i + 1] : null;
    case "ArrowUp":
      return i > 0 ? nav.order[i - 1] : null;
    case "ArrowRight":
      return nav.firstChild[currentId] ?? null;
    case "ArrowLeft":
      return nav.parent[currentId] ?? null;
    case "Home":
      return nav.order[0] ?? null;
    case "End":
      return nav.order[nav.order.length - 1] ?? null;
    default:
      return null;
  }
}
