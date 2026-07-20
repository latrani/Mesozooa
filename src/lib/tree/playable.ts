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

// Narrow the base-playable set: for NON-pinned genera require a clue, a non-degenerate
// terminal clade, AND an image (#50); then keep only the most-notable (by sitelinks, ties by
// ascending id) genera within each terminal clade, up to a per-clade cap computed by capFn.
// A PINNED genus bypasses ALL of those gates (clue, degenerate-clade, image) — it needs only
// base `n.playable` (the build guarantees that for pins) — and also survives the cap trim.
export function prunePlayable(
  tree: TreeData,
  attrs: GenusAttributes,
  capFn: (members: TreeNode[]) => number,
  pinned: Set<string> = new Set(),
): void {
  const byClade = new Map<string, TreeNode[]>();
  for (const n of Object.values(tree.nodes)) {
    if (!n.playable) continue; // base: genus + article (or a pin the build marked playable, Task 2)
    const a = terminalClade(tree, n.id);
    // Pins bypass EVERY gate below (clue, degenerate-clade, image) — pin is last, pin wins (#50).
    // A non-pinned genus must clear all three to be a candidate.
    if (!pinned.has(n.id)) {
      if (!hasClue(attrs[n.id])) { n.playable = false; continue; }
      // Degenerate terminal clade (branchDepth <= 1) breaks two-phase warmth (spec 3.3).
      if (tree.nodes[a].branchDepth <= 1) { n.playable = false; continue; }
      // Image gate (#50): a playable dino must have a picture, else the card is a ??? placeholder.
      if (!n.imageUrl) { n.playable = false; continue; }
    }
    const list = byClade.get(a);
    if (list) list.push(n);
    else byClade.set(a, [n]);
  }
  for (const members of byClade.values()) {
    // Pinned genera sort to the TOP of the clade (guaranteed past the cap); ties then fall back to
    // the notability rule (descending sitelinks, ascending id). The trim below keeps the leading
    // `cap` entries, so pins survive and the lowest-ranked NON-pinned winner is evicted.
    members.sort((x, y) => {
      const px = pinned.has(x.id) ? 1 : 0;
      const py = pinned.has(y.id) ? 1 : 0;
      if (px !== py) return py - px;
      return y.sitelinks - x.sitelinks || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0);
    });
    const cap = capFn(members);
    // Trim to cap, but never evict a pin: sort-to-top guarantees pins survive when pins <= cap,
    // and this guard keeps them even when a clade has MORE pins than the cap allows.
    for (let i = cap; i < members.length; i++) {
      if (!pinned.has(members[i].id)) members[i].playable = false;
    }
  }
}
