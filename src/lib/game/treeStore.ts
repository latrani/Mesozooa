import type { TreeData, TreeNode } from "../tree/types";
import { mrca as mrcaOf, pathToRoot as pathToRootOf } from "../tree/mrca";
import { playableGenera as playableOf } from "../tree/playable";
import { createLens } from "../tree/lens";

export interface TreeStore {
  data: TreeData;
  rootCount: number;
  getNode(id: string): TreeNode | undefined;
  children(id: string): TreeNode[];
  pathToRoot(id: string): string[];
  mrca(a: string, b: string): string;
  playableGenera(): TreeNode[];
  isPlayable(id: string): boolean;
  /** Pool members at or below this node — the count the ENGINE reasons with. Display code that
      describes a taxon must read node.descendantGenusCount (the true clade size) instead; see
      the lens contract in ../tree/lens.ts. */
  poolCount(id: string): number;
  /** Narrowing edges from root, counting only edges where the pool count drops. */
  poolBranchDepth(id: string): number;
  /** Lowest ancestor holding >= 2 pool members. Pool-relative counterpart of tree/terminal.ts. */
  terminalClade(id: string): string;
}

/** `pool` defaults to the genera flagged `playable`, so an un-parameterized store behaves as it
    always has. A tier passes its own pool; everything downstream reads the rulers off the lens. */
export function createTreeStore(data: TreeData, pool?: Iterable<string>): TreeStore {
  const getNode = (id: string): TreeNode | undefined => data.nodes[id];
  const lens = createLens(data, pool ?? playableOf(data).map((n) => n.id));
  return {
    data,
    rootCount: data.nodes[data.rootId]?.descendantGenusCount ?? 0,
    getNode,
    children(id) {
      const node = getNode(id);
      if (!node) return [];
      return node.childrenIds.map((cid) => data.nodes[cid]).filter((n): n is TreeNode => !!n);
    },
    pathToRoot: (id) => pathToRootOf(data, id),
    mrca: (a, b) => mrcaOf(data, a, b),
    // Both read the lens, not the `playable` flag, so a store built with an explicit pool is
    // internally consistent (the flag still seeds the default pool above).
    playableGenera: () => lens.poolIds().map((id) => data.nodes[id]),
    isPlayable: (id) => lens.inPool(id),
    poolCount: (id) => lens.poolCount(id),
    poolBranchDepth: (id) => lens.branchDepth(id),
    terminalClade: (id) => lens.terminalClade(id),
  };
}
