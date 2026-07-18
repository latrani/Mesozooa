import type { RawTaxon } from "./types";
import { NAME_DECISIONS } from "./name-decisions";
import { resolveName } from "./names";

const sl = (r: RawTaxon): number => r.sitelinks ?? 0;
const isCap = (r: RawTaxon): boolean => !!r.name && r.name[0] === r.name[0].toUpperCase();

// Collapse duplicate-name taxa. Real taxa recur as lowercase Wikidata "ghost" items; keep the
// most-notable node per case-insensitive name and remap dropped ids to their winner so any
// surviving child reparents onto the real lineage.
export function dedupeRaws(raws: RawTaxon[]): RawTaxon[] {
  // 1. resolve each node's name (decision, or P225/enwiki fallback) BEFORE dedupe so a corrected
  //    name becomes a case-twin of its lowercase ghost and the ghost merges.
  const fixed = raws.map((r) => {
    const name = resolveName(r, NAME_DECISIONS);
    return name === r.name ? r : { ...r, name };
  });

  // 2. group by case-insensitive name, pick a winner per group
  const groups = new Map<string, RawTaxon[]>();
  for (const r of fixed) {
    const key = r.name.toLowerCase();
    const group = groups.get(key);
    if (group) group.push(r);
    else groups.set(key, [r]);
  }
  const winnerOf = (group: RawTaxon[]): RawTaxon =>
    group.reduce((best, r) => {
      if (sl(r) !== sl(best)) return sl(r) > sl(best) ? r : best;
      if (isCap(r) !== isCap(best)) return isCap(r) ? r : best;
      return best;
    });

  const dropToWinner = new Map<string, string>(); // dropped id -> winner id
  const kept: RawTaxon[] = [];
  for (const group of groups.values()) {
    const win = winnerOf(group);
    kept.push(win);
    for (const r of group) if (r.id !== win.id) dropToWinner.set(r.id, win.id);
  }

  // 3. reparent survivors whose parent was dropped
  return kept.map((r) =>
    r.parentId && dropToWinner.has(r.parentId)
      ? { ...r, parentId: dropToWinner.get(r.parentId)! }
      : r,
  );
}
