import { describe, it, expect } from "vitest";
import {
  resolveSearchPick,
  searchSource,
  revealedSpine,
  pathPositions,
  slugify,
  taxonSlug,
  resolveTaxonRef,
} from "./explorer-core";
import { createTreeStore } from "../game/treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

describe("resolveSearchPick", () => {
  it("focuses a clade directly", () => {
    expect(resolveSearchPick(store, "T")).toEqual({ focusId: "T", selectedGenusId: null });
  });
  it("focuses a genus's parent and selects the genus", () => {
    expect(resolveSearchPick(store, "TR")).toEqual({ focusId: "TF", selectedGenusId: "TR" });
  });
  it("falls back to root for an unknown id", () => {
    expect(resolveSearchPick(store, "nope")).toEqual({ focusId: "Q430", selectedGenusId: null });
  });
});

describe("searchSource", () => {
  it("includes every named taxon (clades and genera)", () => {
    const ids = searchSource(store).map((e) => e.id).sort();
    expect(ids).toEqual(["CF", "LO", "O", "Q430", "T", "TB", "TC", "TF", "TR"]);
  });
});

describe("revealedSpine", () => {
  it("is the tip's root-path plus the children of every node on it", () => {
    // pathToRoot(TF)=[TF,T,Q430]; children TF={TR,TB}, T={TF,LO}, Q430={T,O}
    expect([...revealedSpine(store, "TF")].sort()).toEqual(
      ["LO", "O", "Q430", "T", "TB", "TF", "TR"],
    );
  });
  it("at the root is the root plus its children", () => {
    expect([...revealedSpine(store, "Q430")].sort()).toEqual(["O", "Q430", "T"]);
  });
  it("for a genus tip includes its lineage and each fork's siblings", () => {
    // pathToRoot(TR)=[TR,TF,T,Q430]; TR is a leaf genus
    expect([...revealedSpine(store, "TR")].sort()).toEqual(
      ["LO", "O", "Q430", "T", "TB", "TF", "TR"],
    );
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Coelophysis")).toBe("coelophysis");
    expect(slugify("Tyrannosauridae")).toBe("tyrannosauridae");
  });
  it("strips a parenthetical label override", () => {
    expect(slugify("bird (Aves)")).toBe("bird");
  });
  it("collapses spaces and trims stray punctuation", () => {
    expect(slugify("  Foo   Bar  ")).toBe("foo-bar");
  });
});

describe("taxonSlug", () => {
  it("slugs a node's display name", () => {
    expect(taxonSlug(store, "TR")).toBe("tyrannosaurus");
  });
  it("applies displayName before slugging the root label", () => {
    // fixture root is "Dinosauria" already; displayName maps the lowercase 'dinosaur' case
    expect(taxonSlug(store, "Q430")).toBe("dinosauria");
  });
  it("returns undefined for an unknown id", () => {
    expect(taxonSlug(store, "nope")).toBeUndefined();
  });
});

describe("resolveTaxonRef", () => {
  it("resolves a name slug to its node id", () => {
    expect(resolveTaxonRef(store, "tyrannosaurus")).toBe("TR");
  });
  it("is case-insensitive on the incoming ref", () => {
    expect(resolveTaxonRef(store, "Tyrannosaurus")).toBe("TR");
  });
  it("falls back to a raw Q-id when no name matches", () => {
    expect(resolveTaxonRef(store, "Q430")).toBe("Q430");
  });
  it("returns null for a ref that is neither a known slug nor a known id", () => {
    expect(resolveTaxonRef(store, "notathing")).toBeNull();
  });
});

describe("pathPositions", () => {
  it("runs 0 at the root to 1 at the tip", () => {
    const m = pathPositions(store, "TF");
    expect(m.get("Q430")).toBe(0);
    expect(m.get("T")).toBe(0.5);
    expect(m.get("TF")).toBe(1);
  });
  it("maps a single-node (root) path to 1", () => {
    expect(pathPositions(store, "Q430").get("Q430")).toBe(1);
  });
});
