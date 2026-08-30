# Difficulty Modes — Slice 3: Tier Setting + UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the tier a real, persisted player setting that both game lanes obey — switchable mid-game without losing either game — and surface it where it stays readable during play.

**Architecture:** A `tierSetting` rune store holds the active tier and hands out the matching lensed store from slice 2. Both game stores keep **one `GameState` per tier**, so switching is a read of a different slot rather than a reload — non-destructive by construction. Persistence keys gain the tier. `GameBoard` stops importing `treeStore` and reads `store.tree`, so the board always renders against the tier its game is actually being played in.

**Tech Stack:** Svelte 5 (runes) + TypeScript. No new dependencies.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` and `npx svelte-check` before committing.
- **Switching tiers must never destroy a game.** Both lanes hold per-tier state; a switch changes which slot is read, nothing else.
- **Existing players keep their in-progress games.** v1 keys migrate into the Medium slot rather than being dropped.
- **The board renders against its own game's tier**, not a global import. `GameBoard` takes the tree store through the game store.
- Stats stay global in this slice — per-tier streaks are slice 4. Noted, not forgotten.

---

### Task 1: The tier setting

**Files:**
- Create: `src/lib/game/tierStore.svelte.ts`

- [x] **Step 1:** A rune store exposing `tier`, `store` (the lensed `TreeStore` for that tier), and `set(t)`. Persist to `mesozooa:tier:1`, tolerate a junk value by falling back to Medium, and survive `localStorage` being absent (SSR/tests).

---

### Task 2: Tier-scoped persistence, with a v1 migration

**Files:**
- Modify: `src/lib/game/persistence.ts`
- Modify: `src/lib/game/persistence.test.ts`

- [x] **Step 1:** `dailyKey(tier, date)` → `mesozooa:daily:2:<tier>:<date>`, `practiceKey(tier)` → `mesozooa:practice:2:<tier>`. Keep the v1 constants as `LEGACY_*` for the migration.
- [x] **Step 2:** `staleDailyKeys` prunes every v2 daily key for a past date across all tiers, and any v1 daily key at all (superseded once migrated).
- [x] **Step 3:** Migration readers — when the Medium slot has no v2 save, fall back to the v1 key so an in-progress game survives the upgrade. Easy and Hard have no legacy to inherit.

---

### Task 3: Per-tier game state in both lanes

**Files:**
- Modify: `src/lib/game/dailyStore.svelte.ts`
- Modify: `src/lib/game/practiceStore.svelte.ts`

- [x] **Step 1:** Replace the single `state` with a `Record<Tier, GameState>` initialized eagerly for all three tiers, and read/write the active tier's slot. Every getter and mutator switches from the module-level `treeStore` to `tierSetting.store`.
- [x] **Step 2:** Expose `tree` on both stores so `GameBoard` can render against the right lens.
- [x] **Step 3:** Daily draws its answer from the active tier's pool, so each tier already gets its own puzzle. Cross-tier distinctness, per-tier stats and the share badge are slice 4.

---

### Task 4: `GameBoard` renders against its game's tier

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`
- Modify: `src/gallery/fixtures.ts`

- [x] **Step 1:** Add `tree: TreeStore` to the store prop interface; replace every `treeStore` reference in the component with `store.tree`. Autocomplete entries come from `store.tree.playableGenera()`, so the guess box offers exactly the tier's pool.
- [x] **Step 2:** Gallery fixtures expose `tree: tierStores.medium` — a visual harness must not shift under the player's setting.

---

### Task 5: The control

**Files:**
- Create: `src/lib/components/TierControl.svelte`
- Modify: `src/App.svelte`, `src/lib/game/components/GameBoard.svelte`

- [x] **Step 1:** A button showing the active tier, opening a small popover listing the three with their pool sizes and a one-line description, closing on pick, Escape, or outside click.
- [x] **Step 2:** Desktop — in the header beside How to play / Stats. Phone — in the board status row beside the move counter, since the header cannot carry a fourth control at that width (design spec § IA).

---

### Task 6: Explore grades by the current tier

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`, `src/lib/explorer/components/Explorer.svelte`

- [x] **Step 1:** `SpineTree` takes an `isPlayable` predicate instead of reading the baked `node.playable` flag; Explorer passes the active tier's. Otherwise Explore tells an Easy player that 734 names are guessable when 100 are.

---

## Verification

- [x] `npx vitest run`, `npx tsc --noEmit`, `npx svelte-check`, `npm run build` — all clean
- [x] Switch tiers mid-game in both lanes; both games survive and resume intact
- [x] Easy autocomplete offers only Easy names; Hard offers ~1,170
- [x] Each tier has its own daily answer
- [x] Explore's playable grading changes with the tier
