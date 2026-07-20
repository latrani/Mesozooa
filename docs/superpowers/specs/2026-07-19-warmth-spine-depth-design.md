# Mesozooa — Two-Phase Warmth (retiring "genera remaining" as a closeness metric)

*Design spec. Fixes issue [#39](https://github.com/latrani/Mesozooa/issues/39): "Warmth coloring
is misleading when depths are different."*
Date: 2026-07-19

## 1. The problem

Warmth (the closeness signal, ore → gem, painted on guess bars and the warmest trail) is
currently computed from `descendantGenusCount` of the shared clade: the smaller the clade under
the MRCA of (guess, target), the warmer. See `createCountWarmth` in `src/lib/game/warmth.ts`.

That metric lies, because the tree is **randomly bushy**. A clade can be phylogenetically *very
close* to the target yet *enormous*. The reported symptom: with **Migmanychion** as the target,
guessing other maniraptorans drove the MRCA up to **Maniraptora**, which is about as close as a
guess could land short of the terminal clade, but Maniraptora is a big bushy radiation, so its
high genus count painted the guess "way off." A player reading Explore then wrongly concludes the
answer cannot be a near-child of Maniraptora.

Genus count answers "how big is this clade?" We are asking "how close to the answer are you?"
Those are different questions, and clade size is a bad proxy for the second one because bushiness
is noise. "Genera remaining" was a proxy we adopted before we understood the tree's shape; this
spec retires it **as a closeness metric**.

## 2. The load-bearing insight

**The MRCA of (guess, target) is always an ancestor of the target.** So every guess lands
somewhere on the target's single **root-to-tip spine** (the path from Dinosauria down to the
answer). A guess cannot move you *off* that spine, only higher or lower on it.

Along that one spine, two quantities are strictly co-monotonic:

- `descendantGenusCount` only ever **decreases** as you descend (each child clade is a subset).
- `depth` only ever **increases**.

Therefore **ranking** guesses by warmth is *identical* whether you rank by count or by depth. The
bug is not in *which* guess is warmest, nor in *which* node the feedback points at. It is purely
in how a spine position is mapped to a **color**. We are swapping the ruler, not the ordering.

## 3. The design: two-phase warmth (find the clade, then find the leaf)

The game already has two phases, and the engine already computes the boundary between them:

- **Phase 1, find the clade.** Narrow from the root down to the target's **terminal clade** `T`:
  the smallest clade that contains the target *and* a genus-sibling. That is exactly
  `terminalClade(target)` (`src/lib/tree/terminal.ts`), which walks up from the target skipping
  monotypic (`descendantGenusCount === 1`) ancestors and stops at the first clade with a sibling.
- **Phase 2, find the leaf.** You have reached `T`; the remaining candidates are siblings, and the
  **field clue** (Lived / Found in) is the mechanic that disambiguates them, *not* warmth. The
  phase boundary is exactly `leafHintActive` (`warmestCount <= terminalCount`): the instant your
  warmest guess reaches `T`, the clue unlocks.

Warmth is defined to respect that boundary. With `branchDepth(n)` = the number of real narrowing
steps from the root to `n` (monotypic runs collapsed; see §3.1):

```
T = terminalClade(target)

warmth(MRCA m) =
  1.0                                        if m is the target       (solved)
  ANCHOR                                     if m is at or below T     (phase 2: leaf hunt)
  ANCHOR * branchDepth(m) / branchDepth(T)   otherwise                (phase 1: clade hunt)

ANCHOR = 0.9   (recommended; see §3.2)
```

Three properties this buys:

1. **Reaching the terminal clade reads `ANCHOR` (0.9) for every target, shallow or deep.** That is
   the "you found the best clade available; now use the clue" landmark, and because the boundary
   *is* `leafHintActive`, warmth hits 0.9 in lockstep with the clue unlocking. Warmth never claims
   "more clade to narrow" when there is none.
2. **Phase 1 is a full-range ramp for every target.** It is normalized to the terminal clade's own
   depth (`branchDepth(T)`), so a deep target gets a rich 0→0.9 runway *and* a shallow one is
   anchored hot at `T`. A lone global decay could not do both: on a deep target it leaves every
   realistic guess stuck cold (a fellow theropod ~10 steps out reads ≈0.05), whereas the
   normalized ramp reads that same guess a legible ≈0.5.
3. **Genus count never enters.** Bushiness is gone from the signal entirely.

Worked examples (real tree data, `ANCHOR = 0.9`, linear ramp):

| target (terminal clade) | guess | MRCA | phase | warmth |
|---|---|---|---|---|
| **Velociraptor** (Velociraptorinae, deep) | Adasaurus (sister) | Velociraptorinae | 2 | 0.90 |
| | Tyrannosaurus (fellow coelurosaur) | Tyrannoraptora | 1 | 0.50 |
| | Diplodocus (sauropod) | Eusaurischia | 1 | 0.10 |
| | Triceratops (ornithischian) | Dinosauria | 1 | 0.00 |
| **Stegosaurus** (Stegosaurinae) | Kentrosaurus | Stegosauridae | 1 | 0.77 |
| | Triceratops | Genasauria | 1 | 0.39 |
| | Tyrannosaurus | Dinosauria | 1 | 0.00 |

The "one step from the answer feels the same everywhere" property of an earlier steps-remaining
draft is intentionally **given up** here. It is replaced by the stronger "*reaching the best
available clade* feels the same everywhere (0.9)," which is the accomplishment that actually
matters, and it comes with a full-range phase-1 runway that steps-remaining lacked.

### 3.1 branchDepth: collapsing monotypic runs

Warmth counts *real narrowing steps*, not raw tree depth. A monotypic node (one child, so
`descendantGenusCount` unchanged from its parent) is not a decision and reveals no node on the
tree, so it must not cool the bar. `branchDepth(n)` counts only edges where the child's
`descendantGenusCount` is strictly below the parent's — **the same test `revealedNodeIds` already
uses** to skip chain nodes (§6). Using it here keeps warmth and node-reveal in lockstep: a step of
warmth corresponds to a node lighting up, always.

In practice the magnitude is small (the deep spines here collapse only ~1 node) but the coherence
is the point. Precompute `branchDepth` as a field alongside `depth` in `assemble`
(`src/lib/tree/`), so warmth stays a subtraction rather than a per-call spine walk.

### 3.2 The anchor and ramp shape (deferred to feel-tuning)

Structural decisions are fixed (two phases; the boundary at `T`; phase 1 normalized to
`branchDepth(T)`). Two knobs are look-and-feel, deferred to a gallery pass
(`aesthetics-defer-until-functional`):

- **`ANCHOR`** — warmth at the terminal clade. `0.9` is the recommended start: clearly hot, with
  headroom below `1.0` (solved) so "at the clue" and "solved" stay visually distinct.
- **Ramp shape** — start **linear** (`ANCHOR * branchDepth(m) / branchDepth(T)`). A gentle concave
  lift could later make mid-phase-1 guesses read a touch warmer; that is a single tunable and does
  not change architecture. The old `WARMTH_CURVE = 0.4` was for the log-count metric and is dropped.

Data check performed while choosing the default: a global decay of `0.9^steps` was rejected because
it re-creates the deep-target cold-slog (a fellow theropod reads ≈0.05–0.13); the normalized linear
ramp reads that same guess ≈0.5, the intended "right neighborhood" signal.

### 3.3 Removing the degenerate targets (playable-pool response)

The two-phase model exposes a real degeneracy: when the terminal clade is very **shallow**, phase 1
has no runway and warmth collapses. Two flavors:

- **Unitary (`branchDepth(T) = 0`, terminal clade = Dinosauria).** Every guess reaches `T`
  immediately, so *every* guess reads `0.9`. No signal at all — and literally undefined in the
  formula (`x / 0`). Example: **Sulaimanisaurus**, the lone playable genus hanging directly off
  Dinosauria.
- **Binary (`branchDepth(T) = 1`, terminal clade = Saurischia or Ornithischia).** Warmth has
  exactly two values: `0.9` if the guess is on the target's half of the tree, `0` otherwise.
  Example: **Saurophaganax**, grafted straight onto Saurischia; its "sibling set" is an unnatural
  grab-bag and its warmth is a coin flip.

The fix is a **playable-pool prune**, not a warmth special-case: exclude a genus from the playable
pool when `branchDepth(terminalClade(genus)) <= 1`. This is a data-driven restatement of "no direct
children of Dinosauria / Saurischia / Ornithischia" — *exactly* the 16 genera that phrasing catches
(of 785 playable) — but expressed by the property that actually matters (runway), so it generalizes
correctly and stays true if the tree changes. Details:

- **Threshold `<= 1`** removes the 16 unitary+binary genera. It is deliberately *not* extended to
  `branchDepth(T) = 2..3` (Theropoda, Sauropodomorpha, Herrerasauridae; ~20 more genera): those
  have a thin-but-real runway (mid-phase warmth ≈ 0.3–0.6, not binary). Whether they feel too thin
  is a **playtest question**, tracked separately, not cut on spec.
- This also guarantees every surviving target has `branchDepth(T) >= 2`, so the phase-1 normalizer
  is always `>= 2`: a real gradient always exists and the `x / 0` case cannot arise. **The pool cut
  and the formula's well-definedness are the same fix.**
- Implementation lives in the existing prune stage (`src/lib/tree/playable.ts`, which already calls
  `terminalClade`). It gates targets *and* guesses (one pool, `playable` flag), which is fine:
  these 16 high-grafted genera are nobody's meaningful sibling and lose nothing as guesses.
- It does **not** touch Migmanychion (terminal clade Maniraptora, `branchDepth` ~14): a deep
  terminal clade with a full runway plays correctly and stays in. The degeneracy was never about
  the terminal clade's *size*, only its *depth*.

## 4. Interface change: the WarmthProvider becomes target-aware

Genus count is a self-contained global number, so today `WarmthProvider.warmth(node)` takes only
a node. Two-phase warmth is **relative to the target**: it needs the target's identity (to detect
solved) and its terminal clade's runway (`branchDepth(T)`, the phase-1 normalizer and phase-2
boundary). This is the one real structural change.

**New shape** (names illustrative, settle in the plan):

```ts
export interface WarmthProvider {
  warmth(node: TreeNode): Warmth; // node is the MRCA; see §3 for the two-phase formula
}

// Target-scoped: constructed per game once the target is known.
export function createTwoPhaseWarmth(opts: {
  targetId: string;            // to detect the solved (m === target) case
  terminalBranchDepth: number; // branchDepth(terminalClade(target)); the ramp denominator
  anchor?: number;             // default 0.9
}): WarmthProvider;
// warmth(m): m.id === targetId -> 1.0;
//            m.branchDepth >= terminalBranchDepth -> anchor;
//            else -> anchor * m.branchDepth / terminalBranchDepth
```

The provider reads `node.branchDepth` (the precomputed field from §3.1), so it stays a subtraction.
Since the pool cut (§3.3) guarantees `terminalBranchDepth >= 2` for every playable target, the
denominator is never zero.

Consequences:

- The provider is now **game-scoped, not tree-scoped**. It is constructed where the target is
  known: `dailyStore.svelte.ts` and `gameStore.svelte.ts` (currently
  `createCountWarmth(treeStore.rootCount)`), which compute `terminalClade(target)` and pass its
  `branchDepth`.
- `SpineTree.svelte` also constructs a provider (line ~84). The game board colors spine nodes by
  warmth; **Explore does not color by warmth** (it uses `gradeByPlayable`). Confirm during
  implementation whether SpineTree needs the provider passed in from the game store (target
  known) rather than self-constructing it, and that the Explore path never requires a target.
- `recomputeWarmths` (`engine-core.ts`) re-derives each guess's warmth from the current provider
  on load. With a target-aware provider this still works, since the target is fixed for the game;
  the provider simply carries `targetDepth`.
- The `Warmth.display` field currently formats `"N genera"`. Since the number is no longer a
  closeness statement, drop or repurpose this string (see §5). The color-driving `fraction` and
  the raw `value` are what matter.
- This retires the speculative `PercentWarmth` provider mentioned in `CLAUDE.md` (percent of
  genera). Update that line in `CLAUDE.md` when implementing.

## 5. Deletions: cruft from before the clue mechanic

The sibling-disambiguation problem is now handled by the **field clue** (Lived / Found in), not by
telling the player a count. The following are leftovers that compute scale numbers the UI either
throws away or should no longer show. They are **deleted, not reworked**:

- **`WarmestTrail.svelte` rung count** (`<em>({node.descendantGenusCount})</em>`, ~line 20): the
  only genus-count number a player currently *sees* during the guessing loop. Remove it. The rung
  carries the warmth color and the clade name; that is enough.
- **`specimenState` `broad.count` payload** (`engine-core.ts`): computed but never rendered
  (`specimenView` shows the "? ? ?" placeholder in the broad state). Delete the payload; `broad`
  becomes a bare `{ kind: "broad" }`.
- **`specimenState` `terminal.siblingCount` payload** + **`playableDescendantCount`**: computed
  but read by nothing outside tests. The clue does this job now. Delete the payload and the
  helper; `terminal` becomes `{ kind: "terminal" }`.

## 6. What stays untouched

- **Narrowing / info-gain logic** in `revealedNodeIds` (`engine-core.ts`), which uses strict
  count *decrease* to skip single-child chain nodes that do not actually shrink the candidate
  pool. This is an information-gain test, not a closeness metric. It stays. (If desired it could
  later be re-expressed in depth terms, but there is no reason to touch it here.)
- **`warmestSharedNodeId`** may keep using count internally, since on the spine count and depth
  give identical results (a zero-behavior-change cleanup to depth is optional, and must not alter
  results).
- **`leafHintActive`** stays as-is (`warmestCount <= terminalCount`), and is now *load-bearing for
  warmth*: it defines the phase-2 boundary that §3's formula also tests (`branchDepth(m) >=
  branchDepth(T)`). The two expressions are equivalent (both mean "the MRCA has reached `T`"), and
  the plan must keep them in agreement so warmth flips to `ANCHOR` exactly when the clue unlocks.
- **Explore's "N genera in this clade"** (`nodeView` in `specimen-view.ts`, and the `showCounts`
  labels in `SpineTree.svelte`). Explore is the faithful reference explorer, not the guessing
  loop, so an honest genus count is legitimate context there. Keep it, **de-emphasized** as a
  minor visual pass (not a structural change; can ride along or be a follow-up).

## 7. Testing

- **`branchDepth` (tree assemble tests)**: assert it collapses monotypic runs — a single-child
  chain adds 0; a real narrowing adds 1 — and equals the strict-count-decrease count from root.
- **`warmth.test.ts`**: replace the count/log anchors with two-phase anchors. Assert: MRCA = target
  → `1.0` (solved); MRCA at/below `T` → `ANCHOR`, *and identical across two targets of different
  depth* (the anchor-invariance property); a mid-phase-1 node → `ANCHOR * branchDepth(m) /
  branchDepth(T)` exactly; monotonic increase as the MRCA descends; and the phase flip to `ANCHOR`
  lands exactly at `leafHintActive`. Add the **Velociraptor** regression (fellow coelurosaur reads
  a legible mid-value ≈0.5, not cold) and the **Migmanychion** regression (deep terminal clade,
  full runway, near-terminal guess reads hot).
- **Playable-pool prune (`playable.test.ts`)**: assert genera with `branchDepth(terminalClade) <= 1`
  are excluded (Sulaimanisaurus, Saurophaganax gone), that the count drops from 785 by 16, and that
  every surviving playable target has `branchDepth(T) >= 2`. Confirm a deep-terminal genus
  (Migmanychion) survives.
- **`engine-core.test.ts`**: update `specimenState` tests for the slimmed `broad` / `terminal`
  shapes; drop `siblingCount` / `broad.count` assertions. Confirm `warmestSharedNodeId` and
  `leafHintActive` still pick the same nodes (behavior-preserving), and that `leafHintActive` and
  the warmth phase-2 test agree.
- **Provider construction**: the target-aware provider means the daily/practice stores and any
  SpineTree wiring must pass `targetId` + `terminalBranchDepth`; add/adjust tests or type checks so
  a provider is never constructed without them in a game context.
- Run `npx tsc --noEmit` and `npx svelte-check` (the `verbatimModuleSyntax` + Svelte gates) after
  the payload-shape changes, since removing fields from `SpecimenState` will surface every reader.
- **Data regression guard**: the prune shrinks the playable pool by 16, tripping the `build-tree.ts`
  >10% regression check? No (16/785 ≈ 2%), but confirm the committed-output check passes and does
  not need `ALLOW_DATA_REGRESSION=1`.

## 8. Out of scope

- **Whether to *start* showing "N siblings left."** It is a legitimate pool-size signal (not
  closeness) and could aid leaf disambiguation, but that belongs to the leaf-disambiguation design
  pass, not here. This spec only *removes* the currently-dead payload; a future spec may decide to
  surface a sibling count deliberately.
- **`ANCHOR` value and phase-1 ramp shape** (linear vs concave): deferred to a look-and-feel tuning
  pass (§3.2).
- **Extending the prune to `branchDepth(T) = 2..3`** (Theropoda / Sauropodomorpha / Herrerasauridae,
  ~20 genera): a playtest question about whether a thin runway feels too thin (§3.3). File as a
  tracked follow-up, do not cut on spec.
- **The Explore de-emphasis visual treatment**: minor, may be a follow-up.
- Any change to guess ordering, the warmest-trail structure, the tree topology, or the clue
  mechanic.
