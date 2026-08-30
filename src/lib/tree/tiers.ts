import type { TreeData } from "./types";
import type { GenusAttributes } from "../attributes";
import { hasClue } from "../attributes";
import { terminalClade } from "./terminal";

/**
 * The three difficulty tiers, ascending. A tier is a POOL; the lens (./lens.ts) then measures the
 * game's rulers against it. See docs/superpowers/specs/2026-08-29-difficulty-modes-design.md.
 */
export const TIERS = ["easy", "medium", "hard"] as const;
export type Tier = (typeof TIERS)[number];

/**
 * A genus's rank is the LOWEST tier that admits it, so pool membership is a comparison:
 * a genus is in tier T iff rank <= index(T). That is what makes Easy ⊆ Medium ⊆ Hard hold by
 * construction rather than by a check someone can forget to run.
 */
export type TierRank = 0 | 1 | 2;

export interface TierResolution {
  /** undefined = the genus is in no pool at all */
  rankOf(id: string): TierRank | undefined;
  pool(tier: Tier): string[];
  /** EASY_SET names that matched no genus — a curation error, never a silent shrink */
  unresolved: string[];
}

/**
 * Hard: every genus with good enough data to be a fair target. Mirrors prunePlayable's gates
 * MINUS the notability cap — dropping the cap is precisely what makes Hard hard, since it lets
 * terminal clades get crowded. Uses the TRUE-tree terminal clade, matching the build's own
 * degenerate-target test.
 */
function hardEligible(tree: TreeData, attrs: GenusAttributes, id: string): boolean {
  const n = tree.nodes[id];
  if (!n?.isGenus || !n.wikipediaUrl || !n.imageUrl) return false;
  if (!hasClue(attrs[id])) return false;
  return tree.nodes[terminalClade(tree, id)].branchDepth > 1;
}

export function resolveTiers(
  tree: TreeData,
  attrs: GenusAttributes,
  easyNames: readonly string[],
): TierResolution {
  // Genus names are unique in the assembled tree (dedupe guarantees it), so a plain name index is
  // enough. Clades are deliberately absent: an EASY_SET entry naming a clade must NOT resolve.
  const generaByName = new Map<string, string>();
  for (const n of Object.values(tree.nodes)) if (n.isGenus) generaByName.set(n.name, n.id);

  const rank = new Map<string, TierRank>();
  const unresolved: string[] = [];

  // Easy first, and it wins: a resolved name bypasses every gate below (clue, image, degenerate
  // clade, cap). Same rule as an ALWAYS_PLAYABLE pin — pin is last, pin wins.
  for (const name of easyNames) {
    const id = generaByName.get(name);
    if (id === undefined) { unresolved.push(name); continue; }
    rank.set(id, 0);
  }

  for (const n of Object.values(tree.nodes)) {
    if (!n.isGenus || rank.has(n.id)) continue;
    if (n.playable) rank.set(n.id, 1); // Medium is the status quo pool
    else if (hardEligible(tree, attrs, n.id)) rank.set(n.id, 2);
  }

  return {
    rankOf: (id) => rank.get(id),
    pool(tier) {
      const max = TIERS.indexOf(tier);
      const out: string[] = [];
      for (const [id, r] of rank) if (r <= max) out.push(id);
      return out;
    },
    unresolved,
  };
}
