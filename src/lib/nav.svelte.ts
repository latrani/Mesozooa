import { explorer } from "./explorer/explorerStore.svelte";
import { treeStore } from "./game/treeData";
import { practice } from "./game/practiceStore.svelte";
import { resolveTaxonRef } from "./explorer/explorer-core";
import { parseHash, type Route, type Tab } from "./route";

function createNav() {
  let tab = $state<Tab>("daily");
  return {
    get tab(): Tab {
      return tab;
    },
    set(t: Tab) {
      tab = t;
    },
    exploreAround(id: string) {
      explorer.jumpTo(id);
      tab = "explore";
    },
    /** Apply a parsed route to the live stores (initial load + hashchange). */
    apply(route: Route) {
      tab = route.tab;
      if (route.tab === "explore" && route.taxon) {
        const id = resolveTaxonRef(treeStore, route.taxon);
        if (id) explorer.jumpTo(id);
      } else if (route.seed && route.taxon) {
        // Seed action (#/practice/seed?taxon=…): start the known game if the ref resolves to a
        // playable genus, then redirect to a clean #/practice so the answer never lingers in the
        // URL you play under. A non-playable/unknown ref just lands on plain practice.
        const id = resolveTaxonRef(treeStore, route.taxon);
        if (id && treeStore.getNode(id)?.playable) practice.startWith(id);
        // replaceState (not location.hash=): the transient seed URL becomes no history entry, so
        // Back never lands on it and it fires no hashchange.
        if (typeof history !== "undefined") history.replaceState(null, "", "#/practice");
      }
    },
    /** Read the current URL hash and route to it. */
    hydrate() {
      if (typeof location === "undefined") return;
      this.apply(parseHash(location.hash));
    },
  };
}

export const nav = createNav();
