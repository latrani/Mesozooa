# Practice Known-Target Param Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let `#/practice?taxon=<slug-or-qid>` seed a practice game with a chosen target, so a known game can be walked (e.g. play a game you know is Stegosaurus and watch hints skip the monotypic run).

**Architecture:** A load-only seed. The practice game store is a module singleton that already survives tab switches; the param only needs to be a clean entry point. Three small changes: the route grammar honors `taxon` on practice, `newRoundState` accepts an optional explicit target with a playable-fallback, and `nav.apply` seeds the practice game on load/hashchange behind a differ-guard so it never clobbers an in-progress game. No URL write-sync, no persistence.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite. Pure logic is TDD-tested with Vitest; Svelte/store wiring validated by build + `svelte-check`.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` and `npx svelte-check --threshold error` before committing.
- **Test command:** `npm test` (Vitest, run-once). Single file: `npx vitest run src/lib/route.test.ts`.
- **No URL write-sync for practice.** Do NOT extend `formatHash` or `App.svelte`'s hash-writing effect for practice. The canonical hash for a live practice state stays `#/practice`.
- **Daily must still ignore `taxon`.** Only `explore` and `practice` honor it. The existing test asserting `#/daily?taxon=…` → `{tab:"daily"}` must stay green.
- **Fallback is silent.** Unknown/unresolvable/non-playable target → normal random round, no error UI.

---

### Task 1: Route grammar honors `taxon` on practice

**Files:**
- Modify: `src/lib/route.ts` (`parseHash` guard + top-of-file grammar comment)
- Test: `src/lib/route.test.ts`

**Interfaces:**
- Produces: `parseHash("#/practice?taxon=x")` → `{ tab: "practice", taxon: "x" }`; `#/daily?taxon=x` still → `{ tab: "daily" }`; `formatHash` unchanged.

- [ ] **Step 1: Write the failing tests**

In `src/lib/route.test.ts`, add inside `describe("parseHash", ...)` (after the explore taxon tests). Also change the existing `"ignores a taxon param on non-explore tabs"` test to use `daily` explicitly as the ignored case (it already does) and ADD a practice-honored case:

```ts
  it("reads a taxon param on practice", () => {
    expect(parseHash("#/practice?taxon=stegosaurus")).toEqual({
      tab: "practice",
      taxon: "stegosaurus",
    });
  });
  it("still ignores a taxon param on daily", () => {
    expect(parseHash("#/daily?taxon=stegosaurus")).toEqual({ tab: "daily" });
  });
```

- [ ] **Step 2: Run tests to verify the practice case fails**

Run: `npx vitest run src/lib/route.test.ts`
Expected: FAIL — "reads a taxon param on practice" gets `{ tab: "practice" }` (taxon dropped); the daily case already passes.

- [ ] **Step 3: Widen the guard**

In `src/lib/route.ts`, change the taxon guard in `parseHash` from:

```ts
  // taxon only meaningful on explore
  if (tab === "explore") {
```

to:

```ts
  // taxon meaningful on explore (focus) and practice (seed a known target); NOT daily
  if (tab === "explore" || tab === "practice") {
```

Also update the top-of-file grammar comment line to show the practice form:

```ts
//   #/daily  #/practice  #/practice?taxon=<slug-or-qid>  #/explore  #/explore?taxon=<slug-or-qid>
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run src/lib/route.test.ts`
Expected: PASS — all parseHash cases including the two new ones.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/route.ts src/lib/route.test.ts
git commit -m "feat(route): honor taxon param on practice (not daily)"
```

---

### Task 2: `newRoundState` accepts an optional explicit target

**Files:**
- Modify: `src/lib/game/engine-core.ts` (`newRoundState`)
- Test: `src/lib/game/engine-core.test.ts`

**Interfaces:**
- Consumes: `store.isPlayable(id): boolean`, `store.playableGenera(): TreeNode[]`.
- Produces: `newRoundState(store: TreeStore, rng?: () => number, targetId?: string): GameState` — if `targetId` is given and `store.isPlayable(targetId)`, the returned state's `target` is exactly `targetId`; otherwise the random roll (unchanged behavior for the no-arg and unknown/non-playable cases). Mode stays `"practice"`, `maxGuesses: null`.

- [ ] **Step 1: Write the failing tests**

In `src/lib/game/engine-core.test.ts`, add a new describe block. The game fixture's playable genera include `TR`, `TC`, `TB`, `LO` (genus + wikipediaUrl); `TF` (Tyrannosauridae, a family) is NOT playable.

```ts
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
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: FAIL — `newRoundState` ignores the third arg (TS may also error on the extra arg; that's fine, it confirms the signature needs widening).

- [ ] **Step 3: Implement the optional target**

In `src/lib/game/engine-core.ts`, replace `newRoundState` with:

```ts
export function newRoundState(
  store: TreeStore,
  rng: () => number = Math.random,
  targetId?: string,
): GameState {
  const pool = store.playableGenera();
  const target =
    targetId && store.isPlayable(targetId)
      ? targetId
      : pool[Math.floor(rng() * pool.length)].id;
  return { target, guesses: [], status: "playing", mode: "practice", maxGuesses: null, hintsUsed: 0 };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/game/engine-core.test.ts`
Expected: PASS — all four new cases plus every pre-existing test (no-arg callers are unaffected).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/game/engine-core.ts src/lib/game/engine-core.test.ts
git commit -m "feat(game): newRoundState accepts an optional explicit target with playable-fallback"
```

---

### Task 3: Store `startWith` + nav seeds practice on route

Wires the param end to end: the game store gains a way to start on an explicit target, and `nav.apply` seeds it when routing to `#/practice?taxon=…`, behind a differ-guard so it never clobbers an in-progress game.

**Files:**
- Modify: `src/lib/game/gameStore.svelte.ts` (add `startWith`)
- Modify: `src/lib/nav.svelte.ts` (import `game`; practice branch in `apply`)

**Interfaces:**
- Consumes: `newRoundState(store, rng, targetId)` (Task 2); `resolveTaxonRef(treeStore, ref): string | null`; `treeStore.getNode(id)?.playable`; `game.state.target`.
- Produces: `game.startWith(targetId: string): void` — starts a fresh practice round on that target (via `newRoundState`). `nav.apply` seeds practice when the route carries a playable taxon that differs from the current target.

- [ ] **Step 1: Add `startWith` to the game store**

In `src/lib/game/gameStore.svelte.ts`, the returned object has a `newRound()` method (around line 56). Add `startWith` right after it:

```ts
    newRound() {
      state = newRoundState(treeStore);
    },
    startWith(targetId: string) {
      state = newRoundState(treeStore, Math.random, targetId);
    },
```

- [ ] **Step 2: Seed practice in `nav.apply`**

In `src/lib/nav.svelte.ts`, add the `game` import to the existing import block:

```ts
import { game } from "./game/gameStore.svelte";
```

Then extend `apply` to handle practice. It currently reads:

```ts
    apply(route: Route) {
      tab = route.tab;
      if (route.tab === "explore" && route.taxon) {
        const id = resolveTaxonRef(treeStore, route.taxon);
        if (id) explorer.jumpTo(id);
      }
    },
```

Replace with:

```ts
    apply(route: Route) {
      tab = route.tab;
      if (route.tab === "explore" && route.taxon) {
        const id = resolveTaxonRef(treeStore, route.taxon);
        if (id) explorer.jumpTo(id);
      } else if (route.tab === "practice" && route.taxon) {
        // Load-only seed: start the known game only when it resolves to a playable genus AND
        // differs from the current target, so navigating back to a stale ?taxon= URL (or a
        // redundant hash write) never clobbers an in-progress practice game.
        const id = resolveTaxonRef(treeStore, route.taxon);
        if (id && treeStore.getNode(id)?.playable && id !== game.state.target) {
          game.startWith(id);
        }
      }
    },
```

- [ ] **Step 3: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check --threshold error`
Expected: clean. (No new unit test here — this is store/nav wiring over already-tested pure functions; verified live in Step 5. If `tsc` flags a circular import between `nav` and `gameStore`, note it — both are module singletons already cross-imported via `treeData`/`explorer`, so it should resolve, but report if not.)

- [ ] **Step 4: Full suite**

Run: `npm test`
Expected: all green (no behavior change to existing flows).

- [ ] **Step 5: Manual live verification (evidence before claiming done)**

The dev server runs on `http://localhost:5173`. Verify:
1. `http://localhost:5173/#/practice?taxon=stegosaurus` → the practice game's answer is Stegosaurus (play a wrong guess and confirm the warmth/lineage points at Stegosauria; or take hints down to it).
2. Tab to Explore and back to Practice → the same in-progress game is still there (not re-randomized).
3. `http://localhost:5173/#/practice?taxon=bogus-nope` → a normal random practice game starts (no crash, no error).
4. Hit "New round" on a pinned game → a fresh RANDOM target (pin does not stick to New round).

Note the observations in the commit body.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/gameStore.svelte.ts src/lib/nav.svelte.ts
git commit -m "feat(practice): seed a known target from #/practice?taxon= (load-only, differ-guarded)"
```

---

### Task 4: Two-way URL sync for practice (supersedes load-only)

Added after final whole-branch review: load-only left same-tab `?taxon=` edits unable to
re-seed (App's hashchange guard sees no canonical change), so iterating targets needed a reload.
Make the practice target part of the canonical hash — mirroring Explore's focus — so the write
effect reflects it and editing the param re-seeds. This SUPERSEDES the "no write-sync" note.

**Files:**
- Modify: `src/lib/route.ts` (`formatHash` — emit practice taxon)
- Modify: `src/App.svelte` (`currentTaxonSlug` + `canonicalFor` handle practice)
- Test: `src/lib/route.test.ts` (formatHash practice case)

**Interfaces:**
- Consumes: `taxonSlug(treeStore, id)`, `resolveTaxonRef`, `game.state.target`, `nav.tab`.
- Produces: `formatHash("practice", slug)` → `#/practice?taxon=<slug>`; App's canonical hash for
  a live practice game carries its target slug.

- [ ] **Step 1: Write the failing formatHash tests**

In `src/lib/route.test.ts`, inside `describe("formatHash", ...)`, add:

```ts
  it("appends an encoded taxon on practice", () => {
    expect(formatHash("practice", "stegosaurus")).toBe("#/practice?taxon=stegosaurus");
  });
```

And extend the existing `"round-trips with parseHash"` loop array to include a practice-taxon
hash:

```ts
    for (const h of ["#/daily", "#/practice", "#/practice?taxon=stegosaurus", "#/explore", "#/explore?taxon=coelophysis"]) {
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/lib/route.test.ts`
Expected: FAIL — practice formatHash returns bare `#/practice` (taxon dropped), round-trip fails.

- [ ] **Step 3: Extend `formatHash`**

In `src/lib/route.ts`, change `formatHash` to honor practice too:

```ts
/** Build the canonical hash for a tab (+ optional taxon, honored on explore and practice). */
export function formatHash(tab: Tab, taxon?: string): string {
  if ((tab === "explore" || tab === "practice") && taxon) {
    return `#/${tab}?taxon=${encodeURIComponent(taxon)}`;
  }
  return `#/${tab}`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run src/lib/route.test.ts`
Expected: PASS — practice formatHash + round-trip green, explore/daily cases unchanged.

- [ ] **Step 5: Make App's canonical hash carry the practice target**

In `src/App.svelte`, update `currentTaxonSlug` and `canonicalFor` so practice contributes its
target slug (parallel to explore's focus). Replace the current `currentTaxonSlug`:

```ts
  // Slug for the URL: explore's focus (unless the tree root), or practice's target.
  function currentTaxonSlug(): string | undefined {
    if (nav.tab === "explore") {
      return explorer.highlightId === rootId ? undefined : taxonSlug(treeStore, explorer.highlightId);
    }
    if (nav.tab === "practice") {
      return taxonSlug(treeStore, game.state.target);
    }
    return undefined;
  }
```

And extend `canonicalFor` so a parsed practice route normalizes through the same slug pipeline
(so a hand-typed `?taxon=Q14388` or a wrong-case slug canonicalizes to the same string the write
side emits — the loop guard):

```ts
  function canonicalFor(route: Route): string {
    let slug: string | undefined;
    if (route.tab === "explore" && route.taxon) {
      const id = resolveTaxonRef(treeStore, route.taxon);
      if (id && id !== rootId) slug = taxonSlug(treeStore, id);
    } else if (route.tab === "practice" && route.taxon) {
      const id = resolveTaxonRef(treeStore, route.taxon);
      if (id) slug = taxonSlug(treeStore, id);
    }
    return formatHash(route.tab, slug);
  }
```

Add the `game` import to App's script if not already present:

```ts
  import { game } from "./lib/game/gameStore.svelte";
```

- [ ] **Step 6: Typecheck + svelte-check + full suite**

Run: `npx tsc --noEmit && npx svelte-check --threshold error && npm test`
Expected: all green.

- [ ] **Step 7: Manual live verification (controller-owned; evidence before done)**

At `http://localhost:5173`:
1. Load `#/practice?taxon=stegosaurus` → game is Stegosaurus, and after load the URL still reads
   `#/practice?taxon=stegosaurus` (param persists, not stripped).
2. While playing, edit the address bar `?taxon=triceratops` → the game RE-SEEDS to Triceratops
   (no reload needed). This is the fix.
3. Hit "New round" → URL updates to `#/practice?taxon=<new-random-dino>`; no bounce/flicker.
4. Tab to Explore and back → in-progress game preserved; URL consistent.
5. `#/practice?taxon=bogus` → random game, no crash; URL settles to the random target.

Note observations in the commit body.

- [ ] **Step 8: Commit**

```bash
git add src/lib/route.ts src/lib/route.test.ts src/App.svelte
git commit -m "feat(practice): two-way URL sync for the taxon param (reliable re-seed, shareable)"
```

---

## Self-review notes

- **Spec coverage:** grammar (Task 1), `newRoundState` optional target + fallback (Task 2), `startWith` + nav seed + differ-guard + no write-sync (Task 3). All spec sections covered.
- **Daily-ignores-taxon** constraint: preserved by Task 1's guard (`explore || practice`, not daily) and its explicit test.
- **No write-sync:** no task touches `formatHash` or `App.svelte` — the address bar stays `#/practice` while playing, and `App`'s `canonicalFor` already only builds a taxon slug for explore, so the loop-guard holds.
- **hydrate() path:** `nav.hydrate()` (called in `App.svelte` before first paint) calls `apply(parseHash(...))`, so `#/practice?taxon=` seeds on initial load. The differ-guard makes the construction-time random round get replaced only when the resolved target differs (it will, on first load).
