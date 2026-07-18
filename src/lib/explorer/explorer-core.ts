import type { TreeStore } from "../game/treeStore";
import type { SearchEntry } from "../game/search";
import { displayName } from "../game/displayName";

export interface FocusSelection {
  focusId: string;
  selectedGenusId: string | null;
}

export function resolveSearchPick(store: TreeStore, id: string): FocusSelection {
  const node = store.getNode(id);
  if (!node) return { focusId: store.data.rootId, selectedGenusId: null };
  if (node.isGenus) {
    return { focusId: node.parentId ?? store.data.rootId, selectedGenusId: id };
  }
  return { focusId: id, selectedGenusId: null };
}

export function searchSource(store: TreeStore): SearchEntry[] {
  return Object.values(store.data.nodes).map((n) => ({ id: n.id, name: n.name }));
}

export function revealedSpine(store: TreeStore, tipId: string): Set<string> {
  const ids = new Set<string>();
  for (const id of store.pathToRoot(tipId)) {
    ids.add(id);
    for (const child of store.children(id)) ids.add(child.id);
  }
  return ids;
}

/** URL-safe slug of a taxon name: lowercase, drop any "(...)" override, hyphenate. */
export function slugify(name: string): string {
  return name
    .replace(/\s*\(.*?\)\s*/g, " ") // drop parenthetical label overrides, e.g. "bird (Aves)"
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // any run of non-alphanumerics -> single hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/** The slug written to the URL for a given node (via its display name). */
export function taxonSlug(store: TreeStore, id: string): string | undefined {
  const node = store.getNode(id);
  if (!node) return undefined;
  return slugify(displayName(node.name));
}

/**
 * Resolve a URL taxon ref (name-slug, else raw Q-id) to a node id, or null.
 * Name-slug wins; collisions resolve to the most-notable (highest sitelinks) match.
 */
export function resolveTaxonRef(store: TreeStore, ref: string): string | null {
  const wanted = slugify(ref);
  let best: { id: string; sitelinks: number } | null = null;
  for (const node of Object.values(store.data.nodes)) {
    if (slugify(displayName(node.name)) !== wanted) continue;
    if (!best || node.sitelinks > best.sitelinks) best = { id: node.id, sitelinks: node.sitelinks };
  }
  if (best) return best.id;
  // fall back: treat the ref as a raw node id (Q-id)
  return store.getNode(ref) ? ref : null;
}

export function pathPositions(store: TreeStore, tipId: string): Map<string, number> {
  const chain = store.pathToRoot(tipId).slice().reverse(); // root..tip
  const last = chain.length - 1;
  const map = new Map<string, number>();
  chain.forEach((id, i) => map.set(id, last === 0 ? 1 : i / last));
  return map;
}
