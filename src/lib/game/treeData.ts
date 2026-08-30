import type { TreeData } from "../tree/types";
import treeJson from "../../data/tree.json";
import attrsJson from "../../data/genus-attributes.json";
import type { GenusAttributes } from "../attributes";
import { createTreeStore, type TreeStore } from "./treeStore";
import { resolveTiers, TIERS, type Tier } from "../tree/tiers";
import { EASY_SET } from "../tree/easy-set";

const data = treeJson as unknown as TreeData;

/**
 * Tier pools are DERIVED here rather than baked into tree.json: everything they need is already
 * committed (Medium is the `playable` flag, Hard is article + image + clue + non-degenerate, Easy
 * is a name list), and `build:data` must never run without a fresh raw pull. One pass per tier at
 * module load. See the deviation note in
 * docs/superpowers/plans/2026-08-30-difficulty-tier-pools.md.
 */
export const tiers = resolveTiers(data, attrsJson as GenusAttributes, EASY_SET);

/** One lensed store per tier — each measures the game's rulers against its own pool. */
export const tierStores: Record<Tier, TreeStore> = Object.fromEntries(
  TIERS.map((t) => [t, createTreeStore(data, tiers.pool(t))]),
) as Record<Tier, TreeStore>;

/** The default store is still Medium, so every existing consumer is unchanged until slice 3
    hands them the active tier. */
export const treeStore = tierStores.medium;
