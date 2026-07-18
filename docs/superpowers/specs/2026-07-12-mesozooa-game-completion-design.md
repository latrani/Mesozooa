# Mesozooa — Game Completion (Plan 2b) Design

*Daily mode, guess budget, hints, share grid, and persistence — completing the game.*
Date: 2026-07-12

Refines the overall [Mesozooa design spec](./2026-07-11-mesozooa-design.md) §5 and the
[game slice design](./2026-07-11-mesozooa-game-slice-design.md), which built Practice mode
and deferred these features. Reuse-heavy: extends the merged game engine and components
rather than duplicating them.

## 1. Scope & navigation

Completes the game with: **daily mode** (deterministic answer), a **20-guess budget** for
daily, **hints**, an **emoji share grid**, and **localStorage persistence** for the daily.

Navigation: replace the App's Play/Explore toggle with **three top-level tabs — Daily ·
Practice · Explore** — Daily is the default landing tab. Daily and Practice reuse a shared
game board; Explore is unchanged.

**Deferred (not in this plan):** a streak/stats tracker (only per-date daily state is
persisted); all visual polish (look-and-feel pass).

## 2. Engine changes (pure, extends `engine-core`)

Extend the merged game state (behavior-preserving for Practice; guarded by existing tests):

- `GameState` gains: `mode: "practice" | "daily"`, `maxGuesses: number | null`,
  `hintsUsed: number`; `status` becomes `"playing" | "won" | "lost"`.
- `GuessResult` gains: `kind: "guess" | "hint"`.
- `newRoundState` (practice) → `mode:"practice"`, `maxGuesses:null`, `hintsUsed:0`. Practice
  is never `"lost"` (unlimited).
- `applyGuess`: unchanged for practice. When `maxGuesses` is set and the appended guess is
  not a win and `guesses.length >= maxGuesses`, `status` becomes `"lost"`.
- `MAX_HINTS = 3`.

## 3. Daily answer (pure, deterministic)

`dailyAnswer(dateStr: string, pool: {id: string}[]): string`:

- `pool` is the playable genera **sorted by numeric QID** (stable id; parse the digits after
  `Q`). Stable sort makes the daily reproducible for a given data set.
- `hashDate(dateStr)` = a 32-bit FNV-1a hash of the `YYYY-MM-DD` string.
- Returns `pool[hashDate(dateStr) % pool.length].id`.

The date is the player's **local** date, formatted manually from `getFullYear()` /
`getMonth()+1` / `getDate()` (zero-padded) — **not** `toISOString()` (which is UTC and drifts
a day; this fixes the foundation carry-forward). `todayString(): string` returns it.

Same date + same data ⇒ same target for everyone. A data rebuild can shift which genus a
*past* date maps to (accepted; documented — no snapshot infrastructure in v1).

## 4. Hints (reuse the feedback machinery)

A hint reveals the **next node down the target's true lineage** from the player's current
warmest shared clade.

- **Availability:** at least one `kind:"guess"` result exists (hints require a warmest clade,
  which needs ≥1 guess), AND `hintsUsed < MAX_HINTS`, AND `status === "playing"`, AND budget
  remains. Otherwise `applyHint` is a no-op (button disabled).
- `nextHintNode(state, store): string`: take the root→target path (`pathToRoot(target)`
  reversed); let `w = warmestSharedNodeId(state, store)` (an ancestor of target, so on the
  path); return the node one step deeper toward the target (the child of `w` on the path). If
  `w` is the target's parent, that node is the target genus itself (an acceptable extreme —
  see below).
- `applyHint(state, store, warmth)`: appends a `{ kind:"hint", guessId: <nextHintNode>,
  sharedNodeId: <nextHintNode>, warmth }` result, increments `hintsUsed`. Because
  `sharedNodeId` is a deeper ancestor of the target, it flows through the *same*
  `warmestSharedNodeId` / `revealedNodeIds` machinery — the warmest trail advances and the
  tree reveals that clade. A hint **never sets `won`** (you must still guess the genus), and
  it **counts as one of the 20 guesses** (so it can trigger `lost` if it is the 20th action).
- Extreme case: if the hint reveals the target genus node (warmest clade was the target's
  parent), its name shows on the tree, but you still must submit it as a guess to win.

## 5. Persistence (localStorage, daily only)

- Key: `mesozooa:daily:1:<YYYY-MM-DD>` → JSON of the daily `GameState`.
- `serializeDaily(state): string` / `deserializeDaily(json): GameState | null` — pure,
  tested; `deserialize` returns `null` on malformed/absent data.
- On daily-store init: read today's key; if present and valid, hydrate (resume mid-day, or
  show a completed result read-only); else start a fresh daily for today's `dailyAnswer`.
- Save after every guess/hint. A completed daily (`won`/`lost`) persists and is read-only
  (input disabled), with the share available.
- Practice is **not** persisted. No streak/stats store in v1.

## 6. Share grid

After a daily ends (`won`/`lost`), a Share button copies text produced by pure
`buildShareText(state, dateStr): string`:

```
Mesozooa 2026-07-12  4/20
🟦🟩🟨🎯
```

- Header: `Mesozooa <date>  <n>/20` on a win (`n` = guesses used), `Mesozooa <date>  X/20` on
  a loss.
- One emoji per result row in order. Warmth buckets by `warmth.fraction`:
  `🟦 <0.2`, `🟩 <0.4`, `🟨 <0.6`, `🟧 <0.8`, `🟥 ≥0.8`. A `kind:"hint"` row → `💡`. The
  winning guess → `🎯`.
- Rows wrapped 5 emoji per line.

The Share button copies the text to the clipboard (`navigator.clipboard.writeText`), with a
transient "Copied" acknowledgement.

## 7. Components & reuse

- Extract a shared **`GameBoard.svelte`** from the current practice `Game.svelte`: the
  `SearchBox` + `GuessList` + `WarmestTrail` + `TreeView` + reveal wiring, parameterized by a
  store exposing the common interface (`state`, `warmestId`, `revealed`, `guess(id)`) plus a
  `disabled` flag. Both surfaces embed it.
- **`Practice.svelte`** = `GameBoard` (practice store) + "New round".
- **`Daily.svelte`** = `GameBoard` (daily store) + a budget indicator (`n/20`), a **Hint**
  button (`N left`, disabled per §4), lose handling (reveal card on `lost`), and a **Share**
  button on completion.
- Stores: keep the practice singleton (now carrying `mode:"practice"` fields); add a
  `dailyStore.svelte.ts` singleton wrapping the daily `GameState` + persistence + `guess` +
  `hint`. Both reuse `engine-core`.
- `GuessList`/reveal show hint rows distinctly (a plain marker in v1; styling deferred).
- App: three-tab nav (`Daily` default), each rendering its surface; the game stores are
  singletons, so switching tabs preserves state.

## 8. Testing

Pure logic gets TDD unit tests against the foundation fixture / small inputs:

- `engine-core`: `applyGuess` sets `lost` when the daily budget is exhausted without a win;
  `applyHint` appends a hint step, increments `hintsUsed`, is a no-op without a prior guess /
  when hints exhausted / when not playing, and can trigger `lost` as the 20th action;
  `nextHintNode` returns the correct next lineage node; practice remains unlimited.
- `dailyAnswer`: deterministic for a fixed date; different dates differ; stable numeric-QID
  sort; `todayString` zero-pads and uses local date components.
- persistence: `serializeDaily`/`deserializeDaily` round-trip; `deserialize` returns `null`
  on garbage.
- `buildShareText`: header (win vs loss), warmth-bucket emoji, hint `💡`, win `🎯`, 5-per-line
  wrapping.

Components validated by tsc + `svelte-check` + `npm run build` + running on real data
(a real daily round is driven end-to-end, including a hint and the share output). Existing
game/explorer tests must stay green.

## 9. Out of scope (Plan 2b)

- Streak/stats tracking; historical-daily snapshotting; server/accounts (unchanged from main
  spec §7). All visual/aesthetic design (look-and-feel pass).
