import { TIERS, type Tier } from "../tree/tiers";
import { tierStores } from "./treeData";
import type { TreeStore } from "./treeStore";

const TIER_KEY = "mesozooa:tier:1";
const DEFAULT_TIER: Tier = "medium"; // what shipped before tiers existed

function isTier(v: unknown): v is Tier {
  return typeof v === "string" && (TIERS as readonly string[]).includes(v);
}

function load(): Tier {
  if (typeof localStorage === "undefined") return DEFAULT_TIER;
  const raw = localStorage.getItem(TIER_KEY);
  return isTier(raw) ? raw : DEFAULT_TIER; // junk or absent -> Medium, never a crash
}

/** The active difficulty. One global setting: choosing a tier is what makes that tier's games
    current, in both lanes. Games themselves are kept per tier (see dailyStore/practiceStore), so
    switching is non-destructive. */
function createTierSetting() {
  let tier = $state<Tier>(load());
  return {
    get tier(): Tier {
      return tier;
    },
    /** The lensed store for the active tier — every game ruler measured against its pool. */
    get store(): TreeStore {
      return tierStores[tier];
    },
    set(next: Tier) {
      tier = next;
      if (typeof localStorage !== "undefined") localStorage.setItem(TIER_KEY, next);
    },
  };
}

export const tierSetting = createTierSetting();
