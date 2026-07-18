import type { RawTaxon } from "./types";

// The distinct, present name candidates for a node, in en → enwiki → P225 priority order.
// The `name` field is the en label EXCEPT when it still equals the id (the fetch's Q-id
// placeholder = "no en label"), in which case it is not a candidate.
export function nameCandidates(raw: RawTaxon): string[] {
  const raw3 = [
    raw.name === raw.id ? undefined : raw.name,
    raw.enwikiTitle,
    raw.taxonName,
  ];
  const out: string[] = [];
  for (const c of raw3) {
    const v = c?.trim();
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

// Resolve a node's display name: an explicit decision wins; else the sole candidate; else (no
// candidates at all) the placeholder name. With ≥2 candidates and no decision this returns the
// first (en-priority) candidate — callers that must not ship an undecided name gate on
// findConflicts() first (build-tree fails the build).
export function resolveName(
  raw: RawTaxon,
  decisions: Record<string, { name: string }>,
): string {
  const decided = decisions[raw.id];
  if (decided) return decided.name;
  const cands = nameCandidates(raw);
  return cands[0] ?? raw.name;
}

export interface NameConflict {
  id: string;
  candidates: string[];
  en?: string;
  taxonName?: string;
  enwikiTitle?: string;
  redirectTarget?: string;
}

// Every node with ≥2 distinct name candidates and no decision — the undecided disagreements
// that must block the build. Stable-sorted by id.
export function findConflicts(
  raws: RawTaxon[],
  decisions: Record<string, { name: string }>,
): NameConflict[] {
  const conflicts: NameConflict[] = [];
  for (const raw of raws) {
    if (decisions[raw.id]) continue;
    const candidates = nameCandidates(raw);
    if (candidates.length < 2) continue;
    conflicts.push({
      id: raw.id,
      candidates,
      en: raw.name === raw.id ? undefined : raw.name,
      taxonName: raw.taxonName,
      enwikiTitle: raw.enwikiTitle,
      redirectTarget: raw.redirectTarget,
    });
  }
  conflicts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return conflicts;
}
