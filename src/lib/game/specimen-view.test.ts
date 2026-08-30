import { describe, it, expect } from "vitest";
import { clueFieldsFrom, nodeView, specimenView } from "./specimen-view";
import { applyGuess } from "./engine-core";
import { createTreeStore } from "./treeStore";
import { warmthForTarget } from "./warmth";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";
import type { TreeNode } from "../tree/types";
import type { GenusAttribute } from "../attributes";
import type { GameState } from "./types";

function node(over: Partial<TreeNode>): TreeNode {
  return {
    id: "Q1", name: "Testosaurus", rankId: null, parentId: null, childrenIds: [],
    depth: 5, branchDepth: 0, descendantGenusCount: 1, isGenus: true, playable: true, sitelinks: 3,
    ...over,
  };
}

describe("clueFieldsFrom", () => {
  it("returns [] when there is no clue", () => {
    expect(clueFieldsFrom(null)).toEqual([]);
  });
  it("emits a Lived + Found in row with layered detail", () => {
    const clue: GenusAttribute = {
      ageEpoch: "Late Jurassic", ageLabel: "Tithonian", ageStartMa: 152, ageEndMa: 145,
      discoveryLocation: "United States", discoveryState: "Colorado", discoveryFormation: "Morrison",
    };
    expect(clueFieldsFrom(clue)).toEqual([
      { label: "Lived", value: "Late Jurassic", detail: "(Tithonian, 152–145 mya)" },
      { label: "Found in", value: "United States", detail: "(Colorado, Morrison Formation)" },
    ]);
  });
  it("omits a layer that is absent (age only)", () => {
    expect(clueFieldsFrom({ ageEpoch: "Cretaceous" })).toEqual([
      { label: "Lived", value: "Cretaceous", detail: undefined },
    ]);
  });
});

describe("nodeView", () => {
  it("genus with image -> photo mount, title, wiki link", () => {
    const v = nodeView(node({
      id: "Q100196", name: "Archaeopteryx", imageUrl: "/images/Q100196.webp",
      imageAuthor: "Emily Willoughby", imageLicense: "CC BY-SA 4.0",
      imageLicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      wikipediaUrl: "https://en.wikipedia.org/wiki/Archaeopteryx",
    }));
    expect(v.title).toBe("Archaeopteryx");
    expect(v.mount).toEqual({
      kind: "photo", url: "/images/Q100196.webp", alt: "Archaeopteryx",
      credit: { author: "Emily Willoughby", licenseShort: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
    });
    expect(v.note).toBeNull();
    expect(v.link).toEqual({ href: "https://en.wikipedia.org/wiki/Archaeopteryx", label: "Wikipedia ↗" });
  });
  it("genus without image -> 'Specimen missing' slip, no link when no wiki", () => {
    const v = nodeView(node({ id: "Qx", name: "Nopix" }));
    expect(v.mount).toEqual({ kind: "slip", text: "Specimen missing", tilt: 3.5 });
    expect(v.link).toBeNull();
  });
  it("clade -> genus-count note, no fields", () => {
    const v = nodeView(node({ id: "Qc", name: "Theropoda", isGenus: false, descendantGenusCount: 12 }));
    expect(v.fields).toEqual([]);
    expect(v.note).toBe("12 genera in this clade");
  });
});

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);
// Only "TC" is guessed against warmth in this file; scope the provider to that target.
const warmth = warmthForTarget(store, "TC");
const practice = (target: string): GameState => ({
  target, guesses: [], status: "playing", mode: "practice", maxGuesses: null, hintsUsed: 0,
});

describe("specimenView", () => {
  it("empty -> unidentified placeholder", () => {
    const v = specimenView(practice("TC"), store);
    expect(v.title).toBeNull();
    expect(v.mount).toEqual({ kind: "slip", text: "New exhibit coming soon!", tilt: -4 });
    expect(v.fields).toEqual([
      { label: "Lived", value: null },
      { label: "Found in", value: null },
    ]);
    expect(v.link).toBeNull();
  });
  it("solved -> delegates to nodeView (title = the taxon name)", () => {
    const won = applyGuess(practice("TC"), "TC", store, warmth); // guess == target -> won
    expect(won.status).toBe("won");
    const v = specimenView(won, store);
    expect(v.title).toBe(store.getNode("TC")!.name);
  });
});

describe("the anchor note", () => {
  // FIXTURE: Q430 > T > {TF > {TR, TB}, LO}; Q430 > O > CF > TC. All four genera playable.
  const anchorTree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
  markPlayable(anchorTree);
  const anchorStore = createTreeStore(anchorTree);
  const w = warmthForTarget(anchorStore, "TR");
  const round = (): GameState => ({
    target: "TR", guesses: [], status: "playing", mode: "practice", maxGuesses: null, hintsUsed: 0,
  });

  it("is absent before warmth pins at the anchor", () => {
    // Guessing across the tree leaves the trail broad; the note must not appear yet.
    const s = applyGuess(round(), "TC", anchorStore, w);
    const v = specimenView(s, anchorStore);
    expect(v.anchor).toBeNull();
  });

  it("names the warmest shared clade and its candidate count once pinned", () => {
    // Tarbosaurus shares Tyrannosauridae with the target, which is its terminal clade.
    const s = applyGuess(round(), "TB", anchorStore, w);
    const v = specimenView(s, anchorStore);
    expect(v.anchor).not.toBeNull();
    expect(v.anchor!.cladeId).toBe("TF");
    expect(v.anchor!.cladeName).toBe("Tyrannosauridae");
    // TF holds TR + TB; TB is now guessed and eliminated, leaving one candidate.
    expect(v.anchor!.candidates).toBe(1);
  });

  it("counts down only the guesses INSIDE the clade", () => {
    // Triceratops is nowhere near Tyrannosauridae, so it eliminates nothing there.
    let s = applyGuess(round(), "TB", anchorStore, w);
    const before = specimenView(s, anchorStore).anchor!.candidates;
    s = applyGuess(s, "TC", anchorStore, w);
    expect(specimenView(s, anchorStore).anchor!.candidates).toBe(before);
  });

  it("is absent once the round is over", () => {
    const s = applyGuess(round(), "TR", anchorStore, w); // solved
    expect(specimenView(s, anchorStore).anchor).toBeNull();
  });

  it("counts the POOL, not the clade — a sparser tier leaves fewer candidates", () => {
    // Same clade, a pool that excludes Tarbosaurus: the note must speak for the tier in play.
    const sparse = createTreeStore(anchorTree, ["TR", "TC"]);
    const sw = warmthForTarget(sparse, "TR");
    const s = applyGuess(round(), "TC", sparse, sw);
    const v = specimenView(s, sparse);
    // With only TR and TC in the pool, TF holds a single pool member, so the terminal clade
    // climbs to the root — and the count is of pool members, not of genera.
    expect(v.anchor!.candidates).toBeLessThan(anchorTree.nodes[v.anchor!.cladeId].descendantGenusCount);
  });
});
