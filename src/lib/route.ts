// Hash-route grammar for Mesozooa. Pure string <-> state; no DOM, no tree access.
//
//   #/daily  #/practice  #/explore  #/explore?taxon=<slug-or-qid>
//   #/practice/seed?taxon=<slug-or-qid>   (action: seed a known practice game, then redirect)
//
// The route is intentionally lossy: it carries the tab and, on Explore, a single taxon pointer
// (enough to send someone a dino), never full session state. Practice itself is param-free (its
// target is the ANSWER — never put it in the URL you play under). The seed route is an action,
// not a state: it seeds practice with a chosen target and is immediately redirected to a clean
// #/practice, so the answer never lingers in the address bar.

export type Tab = "daily" | "practice" | "explore";

const TABS: readonly Tab[] = ["daily", "practice", "explore"];

export interface Route {
  tab: Tab;
  taxon?: string;
  /** True only for the `#/practice/seed?taxon=…` action route — seed practice, then redirect. */
  seed?: boolean;
}

/** Parse `location.hash` (with or without leading '#') into a route. Unknown → daily. */
export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, ""); // strip leading '#' and optional '/'
  const [path, query = ""] = raw.split("?");

  // Action route: #/practice/seed?taxon=… — seed a known practice game. Resolves to the practice
  // tab; the caller redirects to a clean #/practice so the answer never lingers in the URL.
  if (path === "practice/seed") {
    const taxon = new URLSearchParams(query).get("taxon");
    if (taxon) return { tab: "practice", taxon, seed: true };
    return { tab: "practice" };
  }

  const tab = (TABS as readonly string[]).includes(path) ? (path as Tab) : "daily";

  // taxon meaningful only on explore (focus). Practice is param-free; its target is the answer.
  if (tab === "explore") {
    const taxon = new URLSearchParams(query).get("taxon");
    if (taxon) return { tab, taxon };
  }
  return { tab };
}

/** Build the canonical hash for a tab (+ optional taxon, honored only on explore). */
export function formatHash(tab: Tab, taxon?: string): string {
  if (tab === "explore" && taxon) {
    return `#/explore?taxon=${encodeURIComponent(taxon)}`;
  }
  return `#/${tab}`;
}
