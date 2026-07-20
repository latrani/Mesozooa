import { describe, it, expect } from "vitest";
import { chipsFor } from "./chip-view";
import { createTreeStore } from "./treeStore";
import { assembleTree } from "../tree/assemble";
import { FIXTURE_RAWS } from "../tree/fixture";
import { warmthForTarget } from "./warmth";
import type { GuessResult } from "./types";

const tree = assembleTree(FIXTURE_RAWS, "Q430", "test");
const store = createTreeStore(tree);
// These tests only need a valid provider (colors, not fraction values); any playable target works.
const warmth = warmthForTarget(tree, "TR");

// helper to build a GuessResult row
function row(kind: GuessResult["kind"], guessId: string, sharedNodeId: string): GuessResult {
  return { guessId, sharedNodeId, warmth: warmth.warmth(store.getNode(sharedNodeId)!), kind, cost: 1 };
}

describe("chipsFor", () => {
  it("maps a guess to a genus chip: dot color + name link + shared-clade link", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, {});
    expect(chips).toHaveLength(1);
    const c = chips[0];
    expect(c.kind).toBe("guess");
    if (c.kind !== "guess") throw new Error("kind");
    expect(c.name).toBe(store.getNode("TR")!.name);
    expect(c.nodeId).toBe("TR");
    expect(c.sharedName).toBe(store.getNode("TF")!.name);
    expect(c.sharedNodeId).toBe("TF");
    expect(c.dotColor).toMatch(/^#|rgb|hsl|color/); // a resolved color string
  });

  it("maps a branchHint to a hint chip: 'Hint:' label + clade link, no genus name", () => {
    const chips = chipsFor([row("branchHint", "TF", "TF")], store, {});
    const c = chips[0];
    expect(c.kind).toBe("branchHint");
    if (c.kind !== "branchHint") throw new Error("kind");
    expect(c.sharedName).toBe(store.getNode("TF")!.name);
    expect(c.sharedNodeId).toBe("TF");
    expect((c as Record<string, unknown>).name).toBeUndefined();
  });

  it("maps a leafHint to a text-only chip with no node link", () => {
    const chips = chipsFor([row("leafHint", "Q430", "Q430")], store, {});
    const c = chips[0];
    expect(c.kind).toBe("leafHint");
    if (c.kind !== "leafHint") throw new Error("kind");
    expect(c.label).toBe("Field clue");
    expect((c as Record<string, unknown>).nodeId).toBeUndefined();
  });

  it("orders newest-first", () => {
    const chips = chipsFor([row("guess", "TR", "TF"), row("guess", "TB", "TF")], store, {});
    expect(chips[0].kind === "guess" && chips[0].nodeId).toBe("TB");
  });

  it("prepends an answer chip on win (outcome color = gem end)", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, { answerId: "TR", won: true });
    expect(chips[0].kind).toBe("answer");
    if (chips[0].kind !== "answer") throw new Error("kind");
    expect(chips[0].name).toBe(store.getNode("TR")!.name);
    expect(chips[0].nodeId).toBe("TR");
    expect(chips[0].won).toBe(true);
  });

  it("on a win, the winning guess appears once as the answer chip, not also as a guess chip", () => {
    // last guess is the winner: guessId === sharedNodeId === target
    const chips = chipsFor([row("guess", "TR", "TF"), row("guess", "TR", "TR")], store, {
      answerId: "TR",
      won: true,
    });
    const targetChips = chips.filter(
      (c) => (c.kind === "guess" && c.guessId === "TR") || (c.kind === "answer" && c.nodeId === "TR"),
    );
    expect(targetChips).toHaveLength(1);
    expect(targetChips[0].kind).toBe("answer");
    expect(chips.some((c) => c.kind === "guess" && c.guessId === "TR")).toBe(false);
  });

  it("prepends an answer chip on loss (outcome color = most-recent guess warmth)", () => {
    const chips = chipsFor([row("guess", "TR", "TF")], store, { answerId: "TB", won: false });
    expect(chips[0].kind).toBe("answer");
    if (chips[0].kind !== "answer") throw new Error("kind");
    expect(chips[0].won).toBe(false);
  });
});
