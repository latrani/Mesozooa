import { describe, it, expect } from "vitest";
import { markPlayable, playableGenera, prunePlayable, adaptiveCap, DEFAULT_CAP_DIALS } from "./playable";
import type { CapDials } from "./playable";
import { assembleTree, pruneSubtree } from "./assemble";
import { terminalClade } from "./terminal";
import { FIXTURE_RAWS } from "./fixture";
import { NEORNITHES, DINOSAURIA } from "./types";
import type { GenusAttributes, GenusAttribute } from "../attributes";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);

describe("markPlayable", () => {
  it("marks genera with a wikipedia article playable", () => {
    expect(tree.nodes["TR"].playable).toBe(true);
    expect(tree.nodes["TB"].playable).toBe(true);
    expect(tree.nodes["TC"].playable).toBe(true);
  });
  it("marks a genus with an article even without a family ancestor", () => {
    // LO ("Loosey") sits directly under Theropoda, no family — now playable.
    expect(tree.nodes["LO"].playable).toBe(true);
  });
  it("never marks non-genus nodes", () => {
    expect(tree.nodes["TF"].playable).toBe(false);
  });
  it("playableGenera returns exactly the playable set", () => {
    expect(playableGenera(tree).map((n) => n.id).sort()).toEqual(["LO", "TB", "TC", "TR"]);
  });
});

describe("adaptiveCap", () => {
  const D: CapDials = DEFAULT_CAP_DIALS;
  const at = (loc: string, start: number, end: number): GenusAttribute => ({
    ageLabel: "x", discoveryLocation: loc, ageStartMa: start, ageEndMa: end,
  });

  it("returns CAP_MAX for a well-spread (diverse) set", () => {
    // many countries, wide age range -> score ~1 -> cap 7
    const members = [
      at("USA", 200, 190), at("China", 150, 140), at("Argentina", 100, 90),
      at("UK", 80, 70), at("Niger", 120, 110), at("Germany", 60, 50),
    ];
    expect(adaptiveCap(members, D)).toBe(7);
  });

  it("returns CAP_MIN for a boring bucket (one country, tight age)", () => {
    // 5/6 China, all ~same age -> low diversity -> cap 3
    const members = [
      at("China", 165, 160), at("China", 164, 159), at("China", 166, 161),
      at("China", 163, 158), at("China", 167, 162), at("Niger", 165, 160),
    ];
    expect(adaptiveCap(members, D)).toBe(3);
  });

  it("clamps within [CAP_MIN, CAP_MAX]", () => {
    const c = adaptiveCap([at("USA", 100, 90), at("China", 80, 70)], D);
    expect(c).toBeGreaterThanOrEqual(D.capMin);
    expect(c).toBeLessThanOrEqual(D.capMax);
  });
});

describe("prunePlayable", () => {
  function freshTree() {
    const t = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
    markPlayable(t); // base playable now: TR, TB, TC, LO (all have wiki)
    t.nodes["TR"].sitelinks = 5;
    t.nodes["TB"].sitelinks = 3;
    t.nodes["TC"].sitelinks = 9;
    t.nodes["LO"].sitelinks = 4;
    // Give every base-playable genus an image so existing tests exercise cap/clue/pin logic in
    // isolation from the image gate (added #50). Image-gate behavior is tested separately below.
    t.nodes["TR"].imageUrl = "tr.jpg";
    t.nodes["TB"].imageUrl = "tb.jpg";
    t.nodes["TC"].imageUrl = "tc.jpg";
    t.nodes["LO"].imageUrl = "lo.jpg";
    return t;
  }
  const clue: GenusAttributes = {
    TR: { ageLabel: "Maastrichtian", discoveryLocation: "Canada" },
    TB: { ageLabel: "Campanian", discoveryLocation: "Mongolia" },
    TC: { ageLabel: "Maastrichtian", discoveryLocation: "USA" },
    LO: { ageLabel: "Norian", discoveryLocation: "Argentina" },
  };

  it("keeps the top-cap most-notable per terminal set", () => {
    const t = freshTree();
    // TR & TB share terminal clade TF; cap 1 -> keep TR (5>3). LO & TC excluded by branchDepth rule.
    prunePlayable(t, clue, () => 1);
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR"]);
  });
  it("keeps everyone when cap >= set size", () => {
    const t = freshTree();
    prunePlayable(t, clue, () => 7);
    // LO & TC excluded by branchDepth rule (their terminal clades have branchDepth <= 1)
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("drops genera with no clue regardless of notability", () => {
    const t = freshTree();
    prunePlayable(t, { TR: { ageLabel: "x", discoveryLocation: "y" }, TB: { ageLabel: "x", discoveryLocation: "y" }, LO: { ageLabel: "x", discoveryLocation: "y" } }, () => 7); // TC no clue
    // LO excluded by branchDepth rule (terminal clade T has branchDepth = 1)
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("breaks sitelink ties by ascending id", () => {
    const t = freshTree();
    t.nodes["TR"].sitelinks = 3; // tie with TB in clade TF
    prunePlayable(t, clue, () => 1);
    // TC & LO excluded by branchDepth rule; among TR/TB tie, TB wins (ascending id)
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB"]);
  });
  it("pins a cap-bumped genus, evicting the lowest non-pinned winner", () => {
    const t = freshTree();
    // TR(5) & TB(3) share terminal clade TF; cap 1 normally keeps TR. Pin TB -> TB survives, TR evicted.
    prunePlayable(t, clue, () => 1, new Set(["TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB"]);
  });
  it("pin is a no-op when the genus already wins its cap slot", () => {
    const t = freshTree();
    // Pin TR, which already wins cap 1 in TF. Result unchanged: just TR.
    prunePlayable(t, clue, () => 1, new Set(["TR"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR"]);
  });
  it("pins a genus with no clue, evicting the non-pinned winner (pin bypasses all gates, #50)", () => {
    const t = freshTree();
    // Clue map omits TB -> TB has no clue. Under #50 a pin bypasses the clue gate, so pinned TB
    // enters clade TF and, sorting to the top, survives cap 1 and evicts the non-pinned TR.
    const noTB: GenusAttributes = { TR: clue.TR, TC: clue.TC, LO: clue.LO };
    prunePlayable(t, noTB, () => 1, new Set(["TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB"]);
  });
  it("pinning both members of a clade keeps both even past cap", () => {
    const t = freshTree();
    // Pin TR and TB, cap 1. Both pinned -> both sort to top -> both survive the cap-1 trim.
    prunePlayable(t, clue, () => 1, new Set(["TR", "TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("keeps a low-sitelinks pin AND the top non-pin, trimming the middle (pin sits above notability)", () => {
    // TF clade holds TR(5), TB(3). Add a third genus TX(9, highest) to TF so cap 2 must choose 2 of 3.
    // Pin the LOWEST (TB=3), cap 2: TB survives as a pin on top; the one remaining slot goes to the
    // highest NON-pin (TX=9), and TR(5) — higher than the pin but not pinned — is trimmed. Proves the
    // pin key sits ABOVE the sitelinks order while non-pins still rank among themselves by notability.
    const t = freshTree();
    // Inject TX into clade TF (sibling of TR/TB under family TF).
    t.nodes["TX"] = {
      ...t.nodes["TR"], id: "TX", name: "TXsaurus", sitelinks: 9,
    };
    t.nodes["TF"].childrenIds = [...t.nodes["TF"].childrenIds, "TX"];
    const attrs: GenusAttributes = { ...clue, TX: { ageLabel: "Campanian", discoveryLocation: "USA" } };
    prunePlayable(t, attrs, () => 2, new Set(["TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TX"]);
  });
  it("excludes an imageless non-pinned genus", () => {
    const t = freshTree();
    delete t.nodes["TB"].imageUrl; // TB now imageless; TR(5) & TB(3) share clade TF, cap 7
    prunePlayable(t, clue, () => 7);
    // TB dropped for no image; TR kept. (TC & LO excluded by the branchDepth rule as before.)
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR"]);
  });
  it("keeps an imageless genus when it is PINNED (pin overrides the image gate)", () => {
    const t = freshTree();
    delete t.nodes["TB"].imageUrl;
    prunePlayable(t, clue, () => 7, new Set(["TB"]));
    // TB imageless but pinned -> kept; TR kept.
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("pin overrides the clue gate too (no clue, still playable)", () => {
    const t = freshTree();
    const noTB = { TR: clue.TR, TC: clue.TC, LO: clue.LO }; // TB has no clue
    prunePlayable(t, noTB, () => 7, new Set(["TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("image-having genera refill cap slots freed by an imageless drop", () => {
    // TF clade: TR(5), TB(3), + inject TX(9) with an image. Make TB imageless, cap 2.
    const t = freshTree();
    t.nodes["TX"] = { ...t.nodes["TR"], id: "TX", name: "TXsaurus", sitelinks: 9, imageUrl: "tx.jpg" };
    t.nodes["TF"].childrenIds = [...t.nodes["TF"].childrenIds, "TX"];
    delete t.nodes["TB"].imageUrl;
    const attrs = { ...clue, TX: { ageLabel: "Campanian", discoveryLocation: "USA" } };
    prunePlayable(t, attrs, () => 2, new Set());
    // Imageless TB dropped pre-cap; the 2 slots go to the image-having TX(9) and TR(5), not TB.
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR", "TX"]);
  });
});

describe("prunePlayable shallow-terminal exclusion", () => {
  it("drops genera whose terminal clade has branchDepth <= 1", () => {
    const tree = assembleTree(FIXTURE_RAWS, "Q430", "test");
    // Give every genus a clue so only the branchDepth rule can exclude them.
    const attrs: GenusAttributes = {};
    for (const n of Object.values(tree.nodes)) {
      if (n.isGenus) attrs[n.id] = { discoveryLocation: "US", ageStartMa: 80, ageEndMa: 70 };
    }
    markPlayable(tree);
    prunePlayable(tree, attrs, () => 99); // cap high so only the rule prunes
    let foundShallow = false;
    for (const n of Object.values(tree.nodes)) {
      if (!n.isGenus) continue;
      const bd = tree.nodes[terminalClade(tree, n.id)].branchDepth;
      if (bd <= 1) {
        foundShallow = true;
        expect(n.playable).toBe(false);
      }
    }
    expect(foundShallow).toBe(true); // Verify the test actually found a shallow case
  });
});
