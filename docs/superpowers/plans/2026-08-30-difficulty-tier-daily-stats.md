# Difficulty Modes — Slice 4: Daily, Stats and Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each tier its own daily puzzle, its own streak and history, and a share result that says which tier it was — so an Easy 4/20 and a Hard 4/20 stop sharing a scoreboard.

**Architecture:** One pure `dailyAnswersByTier` derives all three answers together, in tier order, each excluding the ones already drawn — so no genus is the answer twice on one date. `Stats` goes to v2, keyed by tier, with v1 folding into Medium. `StatsContent` gains tier tabs; the share headline gains the tier.

**Tech Stack:** Svelte 5 (runes) + TypeScript, Vitest. No new dependencies.

## Constraint: the daily calendar stays Medium-only this slice

`src/data/daily-calendar.json` is **emitted by `build:data`** from `src/lib/game/daily-calendar.ts`, so its shape cannot change without a pipeline run, and the raws needed for that are gitignored and absent here.

There is also a real design conflict underneath: pools nest, so a genus scheduled for Easy is necessarily in Medium and Hard too — a calendar entry applied to every tier would hand all three the same answer and defeat distinctness. Applying it to the **lowest** tier that can host it is the other candidate, and it is a scheduling decision rather than a mechanical one.

So this slice keeps the calendar authoritative for **Medium** (which is exactly today's behavior, unchanged for existing players), and Easy and Hard derive around it, excluding whatever it picked. Per-tier scheduling needs both a reshaped `daily-calendar.ts` and a decision on the above; deferred deliberately, not dropped.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` and `npx svelte-check` before committing.
- **No stats may be lost.** v1 folds into Medium — that was the only pool, so it is the only honest home for it.
- **A calendar-scheduled day must still be scheduled.** Distinctness may never evict the calendar's pick; the other tiers move instead.
- Pure logic is TDD-tested: write the test first, watch it fail, then implement.

---

### Task 1: One draw for all three tiers

**Files:**
- Modify: `src/lib/game/daily.ts`, `src/lib/game/daily.test.ts`

**Interfaces:**
- Produces: `dailyAnswersByTier(date, poolByTier, calendar) => Record<Tier, string>`

- [x] **Step 1: Failing tests** — the three answers are distinct on a date where pools overlap; the calendar's pick goes to Medium and the others avoid it; a calendar entry outside Medium's pool falls back cleanly; a tier whose pool is exhausted by exclusion still returns something rather than `undefined`.
- [x] **Step 2: Implement** — assign Medium's calendar pick first if it is in Medium's pool, then walk the tiers in order, each drawing from its pool minus what is already taken. `dailyAnswer` itself is unchanged and still does the hashing.

---

### Task 2: Stats v2, keyed by tier

**Files:**
- Modify: `src/lib/game/stats.ts`, `src/lib/game/stats.test.ts`

- [x] **Step 1: Failing tests** — a v1 blob deserializes with its streak, accumulators and log intact under Medium; a v2 blob round-trips; recording a win on Easy leaves Medium's streak untouched; a junk blob still yields empty stats.
- [x] **Step 2: Reshape** — `Stats.version: 2`, `byTier: Record<Tier, { streak; daily; overall }>`, and `PlayLog` gains `tier`. `recordPlay` takes the play's tier and touches only that tier's slot. `windowStats` filters by tier.
- [x] **Step 3: Migrate** — `deserializeStats` accepts v1 and folds it wholesale into Medium, backfilling `tier: "medium"` on every logged play.

---

### Task 3: The stores record their tier

**Files:**
- Modify: `src/lib/game/dailyStore.svelte.ts`, `src/lib/game/practiceStore.svelte.ts`, `src/lib/game/statsStore.svelte.ts`

- [x] **Step 1:** Daily takes its answer from `dailyAnswersByTier`. Both lanes pass the active tier to `statsStore.record`.
- [x] **Step 2:** `statsStore` exposes a per-tier view — `viewFor(tier)` returning the same `StatsView` shape the panel already consumes, so the component contract is unchanged.

---

### Task 4: Tier tabs in the stats panel

**Files:**
- Modify: `src/lib/components/StatsContent.svelte`, `src/gallery/fixtures.ts`

- [x] **Step 1:** Three tabs, defaulting to the active tier, each showing that tier's streak and history. The empty state becomes per-tier ("Play the Easy daily to start a streak"), since an empty Hard is not evidence of an empty Easy.
- [x] **Step 2:** Reset stays global and says so — one button, all tiers, with the existing confirm step.

---

### Task 5: The share says which tier

**Files:**
- Modify: `src/lib/game/share.ts`, `src/lib/game/share.test.ts`, `src/lib/game/components/Daily.svelte`

- [x] **Step 1:** Headline becomes `Mesozooa 2026-08-30 · Hard`. Shown for **every** tier including Medium: an unlabelled result would be ambiguous between "Medium" and "posted before tiers existed", which is exactly the confusion the badge exists to prevent.

---

## Verification

- [x] `npx vitest run`, `npx tsc --noEmit`, `npx svelte-check`, `npm run build` — all clean
- [x] The three daily answers are distinct today
- [x] A v1 stats blob in localStorage survives the upgrade under Medium
- [x] Winning on one tier moves only that tier's streak
- [x] Share text carries the tier
