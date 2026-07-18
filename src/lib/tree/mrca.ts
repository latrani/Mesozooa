import type { TreeData } from "./types";

export function pathToRoot(tree: TreeData, id: string): string[] {
  const path: string[] = [];
  let cur: string | null = id;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    path.push(cur);
    cur = tree.nodes[cur]?.parentId ?? null;
  }
  return path;
}

export function mrca(tree: TreeData, a: string, b: string): string {
  const ancestorsOfA = new Set(pathToRoot(tree, a));
  for (const id of pathToRoot(tree, b)) {
    if (ancestorsOfA.has(id)) return id;
  }
  return tree.rootId;
}
