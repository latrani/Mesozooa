import { treeStore } from "../game/treeData";
import { revealedSpine, resolveSearchPick } from "./explorer-core";

const HISTORY_CAP = 15;

function createExplorer() {
  let focusId = $state<string>(treeStore.data.rootId);
  let selectedGenusId = $state<string | null>(null);
  // Recently-viewed taxa, most-recent first. Every focused node is recorded;
  // re-viewing an entry moves it back to the front rather than duplicating.
  let history = $state<string[]>([]);

  function record(id: string) {
    history = [id, ...history.filter((h) => h !== id)].slice(0, HISTORY_CAP);
  }

  return {
    get focusId(): string {
      return focusId;
    },
    get selectedGenusId(): string | null {
      return selectedGenusId;
    },
    get revealed(): Set<string> {
      return revealedSpine(treeStore, selectedGenusId ?? focusId);
    },
    get highlightId(): string {
      return selectedGenusId ?? focusId;
    },
    get history(): string[] {
      return history;
    },
    focus(id: string) {
      focusId = id;
      selectedGenusId = null;
      record(id);
    },
    selectGenus(id: string) {
      selectedGenusId = id;
      record(id);
    },
    jumpTo(id: string) {
      const pick = resolveSearchPick(treeStore, id);
      focusId = pick.focusId;
      selectedGenusId = pick.selectedGenusId;
      record(pick.selectedGenusId ?? pick.focusId);
    },
  };
}

export const explorer = createExplorer();
