import type { TreeData, TreeNode } from "../tree/types";
import { mrca as mrcaOf, pathToRoot as pathToRootOf } from "../tree/mrca";
import { playableGenera as playableOf } from "../tree/playable";

export interface TreeStore {
  data: TreeData;
  rootCount: number;
  getNode(id: string): TreeNode | undefined;
  children(id: string): TreeNode[];
  pathToRoot(id: string): string[];
  mrca(a: string, b: string): string;
  playableGenera(): TreeNode[];
  isPlayable(id: string): boolean;
}

export function createTreeStore(data: TreeData): TreeStore {
  const getNode = (id: string): TreeNode | undefined => data.nodes[id];
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
    playableGenera: () => playableOf(data),
    isPlayable: (id) => getNode(id)?.playable === true,
  };
}
