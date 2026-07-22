# Streak & Stats — Design

Issue: [#24](https://github.com/latrani/Mesozooa/issues/24). Persist play history — a
daily-win streak plus rolling volume/win-ratio and average-moves stats.

## Goal

Give the game a Wordle-style sense of continuity: a daily-win streak the player doesn't
want to break, plus lightweight volume stats (recent plays, win ratio, average moves).
Everything is local-only (`localStorage`), consistent with the app's no-backend model.

## Definitions (settled)

- **Streak** = consecutive calendar days each ending in a daily **win**. A daily **loss**
  (the 20-guess cap) breaks it; a **missed day** also breaks it (strict Wordle model). The
  daily has no forfeit, so those are the only two break conditions.
- **Counted play** = a game that reaches a *decided* end: a **win**, a daily **loss**, or a
  practice **forfeit**. Abandoning a practice game via "New round" logs nothing. **Seeded**
  practice (`#/practice/seed`) is excluded entirely — it logs nothing.
- **Volume stats** count both daily and non-seeded practice.
- **Windows are rolling:** "this week" = trailing 7 days, "this month" = trailing 30 days,
  measured from now against each play's timestamp.
- **Average moves** = mean `movesUsed` (guesses + hint costs, matching the in-game counter)
  over **won** games only (losses cluster at the cap and would be noise). Shown as two
  separate numbers: **daily** and **overall** (daily + non-seeded practice).

## Data model

An append-only **play log** (for rolling windows) plus O(1) **all-time accumulators** (for
lifetime totals and average moves) plus a date-driven **streak record**. The log is the only
thing the rolling windows read; the accumulators never need the full log walked.

```
localStorage key: mesozooa:stats:1

Stats {
  version: 1,
  streak:  { current: number, best: number, lastWinDate: string | null },  // "YYYY-MM-DD"
  daily:   { played: number, won: number, moveSum: number },   // moveSum = Σ movesUsed over wins
  overall: { played: number, won: number, moveSum: number },   // daily + non-seeded practice
  log:     Array<{ t: number, mode: "daily" | "practice", won: boolean, moves: number }>,
}
```

- `moveSum` divided by `won` gives average moves; kept as a running sum so the average is O(1)
  and independent of the log (which could someday be capped/pruned without losing lifetime
  numbers).
- The log grows unbounded for now. At the app's play rate that's negligible; capping is a
  future concern, and the accumulators mean a cap wouldn't corrupt lifetime stats. **No cap in
  this slice** (noted so a later prune is a known, safe change, not a silent one).

### The `seeded` gap

`GameState` currently has no way to distinguish a seeded practice game from a normal one at
completion time. Add an optional field:

```ts
// types.ts — GameState
seeded?: true;   // set only by practiceStore.startWith(); absent otherwise
```

- Set in `newRoundState` when called via `startWith` (seeded path), absent for `newRound`.
- **Ignored** by the engine reducer and by persistence serialization/deserialization
  (backward-compatible: old saves lack it, which reads as "not seeded").
- Read **only** by the stats-logging hook, to skip seeded games.

## Modules

### `src/lib/game/stats.ts` (pure, TDD-tested)

Mirrors the pure-helper convention (`search-nav`, `a11y-tree`). No DOM, no Svelte.

- `emptyStats(): Stats` — zeroed record.
- `recordPlay(stats, play, today): Stats` — returns a NEW stats object with the play appended
  to the log, the right accumulators bumped, and the streak updated. `play` =
  `{ t, mode, won, moves }`; `today` = "YYYY-MM-DD" (injected for testability).
  - Streak logic (daily plays only):
    - daily **win** on `today`: if `lastWinDate === today` → no change (idempotent guard, see
      Logging); if `lastWinDate` is `today − 1 day` → `current += 1`; otherwise → `current = 1`.
      Then `best = max(best, current)`, `lastWinDate = today`.
    - daily **loss**: `current = 0` (leaves `best` and `lastWinDate` alone).
    - practice plays never touch the streak.
  - Accumulators: every counted play bumps `overall`; daily plays also bump `daily`. A win adds
    `moves` to the relevant `moveSum`.
- `windowStats(stats, now, days): { played, won, ratio }` — filters `log` on `t >= now − days*86400_000`.
  `ratio` is `won/played` or `null` when `played === 0`.
- `avgMoves(acc): number | null` — `acc.won ? acc.moveSum / acc.won : null`.
- `deserializeStats(raw: string | null): Stats` — JSON-parse + shape-guard; returns
  `emptyStats()` on null/garbage/legacy (mirrors `deserializeGame`'s fail-safe posture).

Date arithmetic operates on "YYYY-MM-DD" strings via the existing `todayString` helper
(`daily.ts`) and a small pure day-difference; no `Date.now()` inside the pure functions
(callers inject `t`/`today`), keeping them deterministic under test.

### `src/lib/game/statsStore.svelte.ts` (impure, thin)

Mirrors `dailyStore`/`practiceStore`: module singleton, `$state` seeded from
`deserializeStats(localStorage.getItem(...))`, saves on every mutation.

- `record(play)` — the logging entry point; calls `recordPlay` with `todayString()` and saves.
- `reset()` — sets state to `emptyStats()` and clears the key.
- Derived getters for the UI: `streak`, `week` (`windowStats(_, now, 7)`), `month`
  (`windowStats(_, now, 30)`), `dailyAvg`/`overallAvg` (`avgMoves`), `allTime`
  (`{ played, won, ratio }` from `overall`).

### Logging hook (in `dailyStore` and `practiceStore`)

Record **once** on the `playing → won/lost` transition — never on re-render, or a solved game
sitting on screen double-counts. Implementation: after the reducer runs in `guess()` /
`forfeit()`, compare previous status to new status; if it just became terminal, call
`statsStore.record(...)`, skipping when `state.seeded`.

- Daily: records on win or the 20-cap loss. `moves = movesUsed(state)`.
- Practice: records on win or forfeit. `newRound()` while playing logs nothing (abandon).
- Idempotence backstop: the `lastWinDate === today` guard in `recordPlay` means even if a daily
  win were somehow recorded twice on the same date, the **streak** wouldn't double-count. This
  guard protects the streak ONLY — the accumulators and the log are NOT idempotent, so the
  transition-edge guard in the hook is the sole defense against double-counting plays. `record`
  must fire exactly once per completed game; don't call it defensively "just in case."

## UI

### Surface — not a nav tab

Stats is not a "mode," and a fourth nav button would break the three-label active-mode
indicator animation in `App.svelte`. Instead, mirror the existing `HowToPlay` pattern: a header
button (beside "How to play") that opens a `Modal` (`src/lib/components/Modal.svelte`).

- `StatsPanel.svelte` — the header button + `<Modal title="Your stats">` wrapping the content.
- `StatsContent.svelte` (or a snippet) — the actual stat readout, mounted in **two** places:
  the modal body, and inline on the daily **end-screen** (the `ended` block in `GameBoard`,
  daily only) for the Wordle "solve → see your streak" moment. One content component, two
  mounts, no duplication.

### Panel contents

- **Streak** — current + best (the hero number).
- **Last 7 days** / **Last 30 days** — plays + win % each.
- **Average moves** — daily and overall, side by side. "—" when no wins yet.
- **All-time** — total plays + overall win %.
- **Empty state** — before any recorded play: a gentle "Play the daily to start a streak"
  rather than a wall of zeros.

### Reset

A `btn-secondary` "Reset stats" at the panel bottom. Destructive (wipes a streak), so a
**two-step inline confirm**: the first click swaps the button for an inline
"Erase all stats? This can't be undone. [Cancel] [Erase]". Confirm calls `statsStore.reset()`.
No native `confirm()` — inconsistent with the modal aesthetic. Not a raw one-tap wipe.

## Testing

- `stats.test.ts` (pure, the bulk): streak extend / gap-reset / loss-reset / idempotent
  same-day; accumulator bumps for daily vs practice, win vs loss; `windowStats` boundary
  (a play exactly at the window edge); `avgMoves` including the zero-wins `null`;
  `deserializeStats` on null / garbage / valid round-trip.
- Store + hook validated by build + running (Svelte components aren't unit-tested here),
  including a live check that a completed daily logs exactly once and a seeded practice logs
  nothing.

## Out of scope

- Win-distribution histogram (Wordle's guess-count bars) — could layer on later using the log's
  `moves` field; not in this slice.
- Share/export of stats.
- Syncing across devices (local-only by design).
- Log capping/pruning (accumulators make it a safe future change).
```
