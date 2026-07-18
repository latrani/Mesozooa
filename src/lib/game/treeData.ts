import type { TreeData } from "../tree/types";
import treeJson from "../../data/tree.json";
import { createTreeStore } from "./treeStore";

export const treeStore = createTreeStore(treeJson as unknown as TreeData);
