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

export interface DecisionCollision {
  id: string;          // the decided node
  name: string;        // the decision's name
  mergesInto: string[]; // other ids that resolve to the exact same name (dedupe would merge them)
}

// Guard against a NAME_DECISIONS entry that silently MERGES two DISTINCT taxa. dedupe groups by
// resolveName().toLowerCase(), so a decision whose name matches another node collapses them into
// one. Most decisions do this on purpose: a lowercase Wikidata twin (P225 "psittacosaurus") is
// capped UP to merge into the real node ("Psittacosaurus") — that only re-cases the node's OWN
// authoritative self-name (its en label or P225 taxon name) and is intended. The dangerous case is
// a decision that picks a name en/P225 DON'T back — e.g. an enwiki-only name that points at a
// different clade — which then collides with that clade's node. That's the caught
// Hesperornithiformes->Hesperornithes / Herrerasauridae->Herrerasauria drafts, each of which
// collapsed a real clade rung. build-tree fails on any result here.
//
// A dup-ghost vs distinct-taxon call can't be made from names alone (that's the synonym problem),
// so this is deliberately scoped to what it CAN prove: a decision that renames a node away from its
// own en/P225 into a name another node already carries. It passes cleanly on all current decisions.
export function findDecisionCollisions(
  raws: RawTaxon[],
  decisions: Record<string, { name: string }>,
): DecisionCollision[] {
  // ids grouped by resolved name, case-folded to match dedupe's actual merge key.
  const idsByKey = new Map<string, string[]>();
  for (const raw of raws) {
    const key = resolveName(raw, decisions).toLowerCase();
    const ids = idsByKey.get(key);
    if (ids) ids.push(raw.id);
    else idsByKey.set(key, [raw.id]);
  }

  const collisions: DecisionCollision[] = [];
  for (const raw of raws) {
    const decision = decisions[raw.id];
    if (!decision) continue;
    const key = decision.name.toLowerCase();
    // Safe when the decision keeps the node's own authoritative self-name (en label — excluding the
    // Q-id placeholder — or P225), even if that merges a same-taxon dup. enwiki is NOT authoritative
    // here: it's the field that imports another clade's name.
    const en = raw.name === raw.id ? undefined : raw.name;
    const selfNames = [en, raw.taxonName].filter((n): n is string => !!n);
    if (selfNames.some((n) => n.toLowerCase() === key)) continue;
    const mergesInto = (idsByKey.get(key) ?? []).filter((id) => id !== raw.id).sort();
    if (mergesInto.length) collisions.push({ id: raw.id, name: decision.name, mergesInto });
  }
  collisions.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return collisions;
}
