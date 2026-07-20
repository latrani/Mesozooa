import type { TreeData, TreeNode } from "./types";
import { terminalClade } from "./terminal";
import type { GenusAttributes, GenusAttribute } from "../attributes";
import { hasClue } from "../attributes";

export interface CapDials {
  capMin: number;
  capMax: number;
  ageSdFull: number; // Ma stddev of age-midpoints treated as "fully time-diverse"
  locWeight: number;
  ageWeight: number;
  gamma: number; // >1 bends low-diversity sets toward capMin
}

export const DEFAULT_CAP_DIALS: CapDials = {
  capMin: 3,
  capMax: 7,
  ageSdFull: 45,
  locWeight: 0.5,
  ageWeight: 0.5,
  gamma: 1.35,
};

// Cap for a terminal clade's leaf-set, scaled to its clue-diversity: wastebaskets
// (many countries / wide age span) keep a wide cap; boring buckets (one country /
// tight age) shrink toward capMin. Members are the leaf-set's clue attributes.
export function adaptiveCap(members: GenusAttribute[], dials: CapDials): number {
  const n = members.length;
  if (n === 0) return dials.capMax;

  // location dominance: largest single-country share
  const byCountry = new Map<string, number>();
  for (const m of members) {
    const c = m.discoveryLocation ?? "";
    byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
  }
  const dom = Math.max(...byCountry.values()) / n;
  const locDiv = 1 - dom;

  // age spread: stddev of midpoints
  const mids = members
    .map((m) => (m.ageStartMa != null && m.ageEndMa != null ? (m.ageStartMa + m.ageEndMa) / 2 : NaN))
    .filter((x) => !Number.isNaN(x));
  let ageDiv = 0;
  if (mids.length > 0) {
    const mean = mids.reduce((a, b) => a + b, 0) / mids.length;
    const sd = Math.sqrt(mids.reduce((a, b) => a + (b - mean) ** 2, 0) / mids.length);
    ageDiv = Math.min(1, sd / dials.ageSdFull);
  }

  const score = Math.pow(dials.locWeight * locDiv + dials.ageWeight * ageDiv, dials.gamma);
  const raw = Math.round(dials.capMin + (dials.capMax - dials.capMin) * score);
  return Math.max(dials.capMin, Math.min(dials.capMax, raw));
}

export function markPlayable(tree: TreeData): void {
  for (const n of Object.values(tree.nodes)) {
    n.playable = n.isGenus && !!n.wikipediaUrl;
  }
}

export function playableGenera(tree: TreeData): TreeNode[] {
  return Object.values(tree.nodes).filter((n) => n.playable);
}

// Narrow the base-playable set: require a clue, then keep only the most-notable
// (by sitelinks, ties by ascending id) genera within each terminal clade, up to a
// per-clade cap computed by capFn from that clade's members.
export function prunePlayable(
  tree: TreeData,
  attrs: GenusAttributes,
  capFn: (members: TreeNode[]) => number,
): void {
  const byClade = new Map<string, TreeNode[]>();
  for (const n of Object.values(tree.nodes)) {
    if (!n.playable) continue;
    if (!hasClue(attrs[n.id])) {
      n.playable = false;
      continue;
    }
    const a = terminalClade(tree, n.id);
    // Degenerate targets: a terminal clade with <=1 narrowing step of runway makes two-phase
    // warmth unitary/binary (spec 3.3). Exclude them; keeps the phase-1 denominator >= 2.
    if (tree.nodes[a].branchDepth <= 1) {
      n.playable = false;
      continue;
    }
    const list = byClade.get(a);
    if (list) list.push(n);
    else byClade.set(a, [n]);
  }
  for (const members of byClade.values()) {
    members.sort((x, y) => y.sitelinks - x.sitelinks || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
    const cap = capFn(members);
    for (let i = cap; i < members.length; i++) members[i].playable = false;
  }
}
