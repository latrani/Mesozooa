import { describe, it, expect } from "vitest";
import {
  applyGuess,
  applyHint,
  applyForfeit,
  hintCost,
  movesUsed,
  newRoundState,
  newDailyState,
  warmestSharedNodeId,
  revealedNodeIds,
  nextHintRun,
  leafHintActive,
  playableDescendantCount,
  specimenState,
  refreshWarmth,
  HINT_COST_MAX,
  HINT_COST_MIN,
  DAILY_MAX_GUESSES,
} from "./engine-core";
import { createTreeStore } from "./treeStore";
import { createCountWarmth } from "./warmth";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS, MONO_FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";
import type { GameState } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);
const warmth = createCountWarmth(store.rootCount);

const monoTree = assembleTree(MONO_FIXTURE_RAWS, "MR", "test");
markPlayable(monoTree);
const monoStore = createTreeStore(monoTree);
const monoWarmth = createCountWarmth(monoStore.rootCount);

const practice = (target: string): GameState => ({
  target,
  guesses: [],
  status: "playing",
  mode: "practice",
  maxGuesses: null,
  hintsUsed: 0,
});

describe("refreshWarmth", () => {
  it("recomputes each guess's warmth from the current provider (for restored games)", () => {
    const s = applyGuess(practice("TC"), "TR", store, warmth);
    // Simulate a stored game whose fraction was frozen under an old formula.
    const stale: GameState = {
      ...s,
      guesses: s.guesses.map((g) => ({ ...g, warmth: { ...g.warmth, fraction: 0.123 } })),
    };
    const fresh = refreshWarmth(stale, store, warmth);
    // fraction is recomputed from the shared node (not the stored 0.123)
    expect(fresh.guesses[0].warmth.fraction).toBeCloseTo(
      warmth.warmth(store.getNode("Q430")!).fraction,
      6,
    );
    // identity preserved
    expect(fresh.guesses[0].guessId).toBe("TR");
    expect(fresh.guesses[0].sharedNodeId).toBe("Q430");
    expect(fresh.guesses[0].kind).toBe("guess");
    expect(fresh.status).toBe(stale.status);
  });
  it("returns an empty-guess game unchanged in shape", () => {
    const s = practice("TC");
    expect(refreshWarmth(s, store, warmth).guesses).toEqual([]);
  });
});

describe("applyForfeit", () => {
  it("ends a playing round as a loss (reveals the answer)", () => {
    const s = applyForfeit(applyGuess(practice("TC"), "TR", store, warmth));
    expect(s.status).toBe("lost");
  });
  it("keeps the guess record intact", () => {
    const played = applyGuess(practice("TC"), "TR", store, warmth);
    expect(applyForfeit(played).guesses).toEqual(played.guesses);
  });
  it("is a no-op once the round is already over", () => {
    const won = applyGuess(practice("TC"), "TC", store, warmth);
    expect(won.status).toBe("won");
    expect(applyForfeit(won)).toBe(won); // same reference, unchanged
  });
});

describe("applyGuess", () => {
  it("appends a guess result referencing mrca(guess, target)", () => {
    const s = applyGuess(practice("TC"), "TR", store, warmth);
    expect(s.guesses).toHaveLength(1);
    expect(s.guesses[0].sharedNodeId).toBe("Q430");
    expect(s.guesses[0].kind).toBe("guess");
    expect(s.guesses[0].warmth.value).toBe(4);
    expect(s.status).toBe("playing");
  });
  it("wins when the guess is the target", () => {
    expect(applyGuess(practice("TC"), "TC", store, warmth).status).toBe("won");
  });
  it("rejects a non-playable id", () => {
    expect(() => applyGuess(practice("TC"), "TF", store, warmth)).toThrow();
  });
  it("no-ops a duplicate guess", () => {
    const s1 = applyGuess(practice("TC"), "TR", store, warmth);
    expect(applyGuess(s1, "TR", store, warmth).guesses).toHaveLength(1);
  });
  it("practice is never lost (unlimited)", () => {
    let s = practice("TC");
    for (const id of ["TR", "TB"]) s = applyGuess(s, id, store, warmth);
    expect(s.status).toBe("playing");
  });
});

describe("daily budget", () => {
  it("is lost when the budget is exhausted without a win", () => {
    let s = newDailyState("TC", 2);
    s = applyGuess(s, "TR", store, warmth);
    expect(s.status).toBe("playing");
    s = applyGuess(s, "TB", store, warmth);
    expect(s.status).toBe("lost");
  });
  it("a winning final guess wins, not loses", () => {
    let s = newDailyState("TC", 2);
    s = applyGuess(s, "TR", store, warmth);
    s = applyGuess(s, "TC", store, warmth);
    expect(s.status).toBe("won");
  });
});

describe("nextHintRun", () => {
  it("returns a single-node run to the next narrowing when it's not monotypic", () => {
    let s = newDailyState("TC");
    s = applyGuess(s, "TR", store, warmth); // mrca(TR,TC)=Q430
    expect(nextHintRun(s, store)).toEqual(["O"]); // Q430 -> O (count 1 < 4): one strict step
  });
  it("is empty with no guesses", () => {
    expect(nextHintRun(newDailyState("TC"), store)).toEqual([]);
  });
  it("skips through a monotypic run to the branch point in one run", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth); // mrca(GA1,OT)=MR
    s = applyHint(s, monoStore, monoWarmth);         // hint 1: MR -> B1 (3 < 4), one step
    expect(s.guesses.at(-1)!.sharedNodeId).toBe("B1");
    // Next run walks MA(3), MB(3) — both monotypic — down to SA(2), the strict narrowing.
    expect(nextHintRun(s, monoStore)).toEqual(["MA", "MB", "SA"]);
  });
});

describe("applyHint", () => {
  it("no-ops without a prior guess", () => {
    const s = applyHint(newDailyState("TR"), store, warmth);
    expect(s.guesses).toHaveLength(0);
    expect(s.hintsUsed).toBe(0);
  });
  it("appends a hint step and increments hintsUsed", () => {
    let s = newDailyState("TR");
    s = applyGuess(s, "TC", store, warmth); // mrca Q430
    s = applyHint(s, store, warmth); // -> T
    expect(s.guesses).toHaveLength(2);
    expect(s.guesses[1].kind).toBe("branchHint");
    expect(s.guesses[1].sharedNodeId).toBe("T");
    expect(s.hintsUsed).toBe(1);
    expect(s.status).toBe("playing");
  });
  it("walks one step deeper each hint until the terminal clade, then the clue takes over", () => {
    let s = newDailyState("TR");
    s = applyGuess(s, "TC", store, warmth); // mrca Q430
    s = applyHint(s, store, warmth); // -> hint T (3)
    s = applyHint(s, store, warmth); // -> hint TF (2) == terminalClade(TR)
    expect(s.guesses.filter((g) => g.kind === "branchHint").map((g) => g.sharedNodeId)).toEqual(["T", "TF"]);
    // Now at the terminal clade: the next press yields the clue, not a target-revealing hint.
    expect(leafHintActive(s, store)).toBe(true);
    s = applyHint(s, store, warmth);
    expect(s.guesses.at(-1)!.kind).toBe("leafHint");
  });
  it("counts toward the budget and can lose the game", () => {
    let s = newDailyState("TR", 2);
    s = applyGuess(s, "TC", store, warmth); // moves 1
    s = applyHint(s, store, warmth); // hint T costs > 1 -> exceeds budget
    expect(s.status).toBe("lost");
  });
  it("no-ops when the game is over", () => {
    const won = applyGuess(newDailyState("TC"), "TC", store, warmth);
    expect(applyHint(won, store, warmth)).toBe(won);
  });
});

describe("clue does not block the winning guess", () => {
  it("the clue press records a clue row and leaves the game playing so the win still works", () => {
    let s = newDailyState("TR");
    s = applyGuess(s, "TB", store, warmth); // mrca TF == terminalClade(TR) -> clue active
    s = applyHint(s, store, warmth); // clue (does not reveal the target genus)
    expect(s.guesses.at(-1)!.kind).toBe("leafHint");
    expect(revealedNodeIds(s, store).has("TR")).toBe(false);
    expect(s.status).toBe("playing");
    s = applyGuess(s, "TR", store, warmth); // the deserved winning guess must still work
    expect(s.status).toBe("won");
  });
});

describe("selectors with hint rows", () => {
  it("warmest and revealed include the hinted clade", () => {
    let s = newDailyState("TR");
    s = applyGuess(s, "TC", store, warmth); // mrca Q430 (count 4)
    s = applyHint(s, store, warmth); // reveals T (count 3)
    expect(warmestSharedNodeId(s, store)).toBe("T");
    expect(revealedNodeIds(s, store).has("T")).toBe(true);
  });
});

describe("hintCost and movesUsed", () => {
  it("charges a bounded, above-MIN cost for a shallow (near-root) next hint", () => {
    // target TR: lineage [Q430,T,TF,TR]; guessing TC shares only Q430, so next hint node is
    // T (index 1) — a shallow hint. Cost sits above MIN and no higher than MAX.
    const s0 = newDailyState("TR", 20);
    const s1 = applyGuess(s0, "TC", store, warmth); // TC shares only Q430 with TR
    const c = hintCost(s1, store);
    expect(c).toBeGreaterThan(HINT_COST_MIN);
    expect(c).toBeLessThanOrEqual(HINT_COST_MAX);
  });
  it("charges less for a deeper next hint than a shallower one", () => {
    const s0 = newDailyState("TR", 20);
    const s1 = applyGuess(s0, "TC", store, warmth); // next hint node T (shallow)
    const shallow = hintCost(s1, store);
    const s2 = applyHint(s1, store, warmth); // reveal T; next hint node now TF (deeper)
    const deeper = hintCost(s2, store);
    expect(deeper).toBeLessThan(shallow);
  });
  it("charges HINT_COST_MIN at the leaf-terminal state (the clue)", () => {
    // Once warmth has bottomed at TR's terminal clade, the press yields the clue at MIN cost.
    const s0 = newDailyState("TR", 20);
    const s1 = applyGuess(s0, "TB", store, warmth); // TB shares TF with TR -> warmest at terminal clade
    expect(leafHintActive(s1, store)).toBe(true);
    expect(hintCost(s1, store)).toBe(HINT_COST_MIN);
  });
  it("movesUsed sums each row's cost (guesses=1, clue=MIN)", () => {
    const s0 = newDailyState("TR", 20);
    const s1 = applyGuess(s0, "TB", store, warmth); // guess = 1
    const s2 = applyHint(s1, store, warmth); // clue = HINT_COST_MIN
    expect(movesUsed(s2)).toBe(1 + HINT_COST_MIN);
  });
});

describe("clue press does not spoil the target", () => {
  it("records a clue row without revealing the target on the tree", () => {
    const s0 = newDailyState("TR", 20);
    const s1 = applyGuess(s0, "TB", store, warmth); // lands at terminal clade
    const s2 = applyHint(s1, store, warmth);
    expect(s2.guesses.at(-1)!.kind).toBe("leafHint");
    expect(revealedNodeIds(s2, store).has("TR")).toBe(false); // target not spoiled
    expect(movesUsed(s2)).toBe(1 + HINT_COST_MIN); // guess(1) + clue(MIN)
  });
});

describe("revealedNodeIds reveals the answer once the round ends", () => {
  it("adds the target's lineage on a loss, but not while still playing", () => {
    const playing = applyGuess(practice("TC"), "TR", store, warmth); // wrong guess, still playing
    expect(revealedNodeIds(playing, store).has("TC")).toBe(false); // not spoiled mid-play
    const lost = applyForfeit(playing);
    expect(lost.status).toBe("lost");
    expect(revealedNodeIds(lost, store).has("TC")).toBe(true); // answer revealed on the tree
  });
});

describe("newRoundState", () => {
  it("creates a playing practice state", () => {
    const s = newRoundState(store, () => 0);
    expect(s.mode).toBe("practice");
    expect(s.maxGuesses).toBeNull();
    expect(s.status).toBe("playing");
    expect(store.isPlayable(s.target)).toBe(true);
  });
});

describe("newRoundState explicit target", () => {
  it("uses an explicit playable target verbatim", () => {
    const s = newRoundState(store, Math.random, "TC");
    expect(s.target).toBe("TC");
    expect(s.mode).toBe("practice");
    expect(s.maxGuesses).toBeNull();
    expect(s.guesses).toEqual([]);
  });
  it("falls back to a random playable target when the id is not playable", () => {
    // TF is a family node, not a playable genus -> ignored, random roll used instead.
    const s = newRoundState(store, () => 0, "TF");
    expect(s.target).not.toBe("TF");
    expect(store.isPlayable(s.target)).toBe(true);
  });
  it("falls back when the id is unknown", () => {
    const s = newRoundState(store, () => 0, "NOPE");
    expect(store.isPlayable(s.target)).toBe(true);
  });
  it("still rolls random with no explicit target", () => {
    const s = newRoundState(store, () => 0);
    expect(store.isPlayable(s.target)).toBe(true);
  });
});

describe("DAILY_MAX_GUESSES", () => {
  it("is the default budget for a daily state", () => {
    expect(DAILY_MAX_GUESSES).toBe(20);
    expect(newDailyState("TC").maxGuesses).toBe(DAILY_MAX_GUESSES);
  });
});

describe("leafHintActive", () => {
  it("is inactive before any guess", () => {
    expect(leafHintActive(practice("TR"), store)).toBe(false);
  });
  it("is inactive while the warmest clade is above the terminal clade", () => {
    // guess TC: mrca(TC,TR)=Q430 (count 4) > terminalClade(TR)=TF (count 2)
    const s = applyGuess(practice("TR"), "TC", store, warmth);
    expect(leafHintActive(s, store)).toBe(false);
  });
  it("is active when the warmest clade equals the terminal clade", () => {
    // guess TB: mrca(TB,TR)=TF == terminalClade(TR)
    const s = applyGuess(practice("TR"), "TB", store, warmth);
    expect(leafHintActive(s, store)).toBe(true);
  });
  it("stays active once a later guess drops warmth to the terminal clade", () => {
    let s = applyGuess(practice("TR"), "TC", store, warmth); // warmest Q430 -> inactive
    s = applyGuess(s, "TB", store, warmth); // warmest now TF -> active
    expect(leafHintActive(s, store)).toBe(true);
  });
  it("is active once a hint drives warmth to the terminal clade", () => {
    let s = newDailyState("TR");
    s = applyGuess(s, "TC", store, warmth); // warmest Q430 (4)
    s = applyHint(s, store, warmth); // -> T (3)
    s = applyHint(s, store, warmth); // -> TF (2) == terminal
    expect(warmestSharedNodeId(s, store)).toBe("TF");
    expect(leafHintActive(s, store)).toBe(true);
  });
  it("is inactive once the game is no longer playing", () => {
    const won = applyGuess(practice("TR"), "TR", store, warmth); // status "won"
    expect(won.status).toBe("won");
    expect(leafHintActive(won, store)).toBe(false);
  });
});

describe("playableDescendantCount", () => {
  it("counts playable genera at or below a node", () => {
    expect(playableDescendantCount(store, "TF")).toBe(2); // TR, TB
    expect(playableDescendantCount(store, "Q430")).toBe(4); // TR, TB, TC, LO
    expect(playableDescendantCount(store, "O")).toBe(1); // TC
  });
  it("counts a playable leaf as itself", () => {
    expect(playableDescendantCount(store, "TR")).toBe(1);
  });
});

describe("specimenState", () => {
  const daily1 = (target: string): GameState => ({
    target,
    guesses: [],
    status: "playing",
    mode: "daily",
    maxGuesses: 1,
    hintsUsed: 0,
  });

  it("is empty with no guesses", () => {
    expect(specimenState(practice("TR"), store)).toEqual({ kind: "empty" });
  });

  it("is broad when the warmest clade is still large", () => {
    const s = applyGuess(practice("TR"), "TC", store, warmth); // mrca=Q430 (count 4)
    expect(specimenState(s, store)).toEqual({ kind: "broad", count: 4 });
  });

  it("is terminal (with sibling count) when warmth bottoms out at the terminal clade", () => {
    const s = applyGuess(practice("TR"), "TB", store, warmth); // mrca=TF (count 2 = terminal)
    expect(specimenState(s, store)).toEqual({ kind: "terminal", siblingCount: 2 });
  });

  it("is solved/won on a correct guess (hints excluded from guessCount)", () => {
    const s = applyGuess(practice("TR"), "TR", store, warmth);
    expect(specimenState(s, store)).toEqual({
      kind: "solved",
      outcome: "won",
      targetId: "TR",
      guessCount: 1,
    });
  });

  it("is solved/lost when the daily budget is exhausted, revealing the target", () => {
    const s = applyGuess(daily1("TR"), "TC", store, warmth); // wrong, budget=1 -> lost
    expect(specimenState(s, store)).toEqual({
      kind: "solved",
      outcome: "lost",
      targetId: "TR",
      guessCount: 1,
    });
  });
});

describe("skip-through hint behavior", () => {
  it("reveals the whole monotypic run in one press, one row, warmth at the branch point", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth); // mrca MR
    s = applyHint(s, monoStore, monoWarmth);         // hint 1 -> B1
    const rowsBefore = s.guesses.length;
    s = applyHint(s, monoStore, monoWarmth);         // hint 2 -> skip MA, MB -> SA
    expect(s.guesses.length).toBe(rowsBefore + 1);   // exactly one new row
    const row = s.guesses.at(-1)!;
    expect(row.kind).toBe("branchHint");
    expect(row.sharedNodeId).toBe("SA");             // row names the branch point
    // the skipped intermediates are revealed on the tree (via pathToRoot(SA))
    const revealed = revealedNodeIds(s, monoStore);
    expect(revealed.has("MA")).toBe(true);
    expect(revealed.has("MB")).toBe(true);
    // warmth reads the branch point's real narrowing (count 2)
    expect(row.warmth.value).toBe(monoStore.getNode("SA")!.descendantGenusCount);
    // the target genus is NEVER revealed by a hint
    expect(revealed.has("GA1")).toBe(false);
    expect(s.hintsUsed).toBe(2);
  });
  it("charges the run's cost at the branch point (deeper => cheaper than a shallow step)", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth);
    const shallow = hintCost(s, monoStore);          // step to B1 (shallow)
    s = applyHint(s, monoStore, monoWarmth);          // reveal B1
    const deepRun = hintCost(s, monoStore);           // run to SA (deeper branch point)
    expect(deepRun).toBeLessThan(shallow);
    expect(deepRun).toBeGreaterThanOrEqual(HINT_COST_MIN);
  });
  it("hands off to the leaf hint once the run reaches the terminal clade", () => {
    let s = newDailyState("GA1");
    s = applyGuess(s, "OT", monoStore, monoWarmth);
    s = applyHint(s, monoStore, monoWarmth); // -> B1
    s = applyHint(s, monoStore, monoWarmth); // -> SA (== terminalClade(GA1))
    expect(leafHintActive(s, monoStore)).toBe(true);
    s = applyHint(s, monoStore, monoWarmth); // now the leaf hint
    expect(s.guesses.at(-1)!.kind).toBe("leafHint");
  });
});
