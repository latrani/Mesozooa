import type { TreeData } from "./types";

// The lowest ancestor of `id` with more than one descendant genus — the warmest clade
// warmth can establish short of guessing the genus itself. Skips monotypic parents.
export function terminalClade(tree: TreeData, id: string): string {
  let a = tree.nodes[id]?.parentId ?? null;
  while (a && tree.nodes[a] && tree.nodes[a].descendantGenusCount === 1) {
    a = tree.nodes[a].parentId;
  }
  return a ?? id;
}
