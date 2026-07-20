# Daily-dino calendar (#44)

**2026-07-20. Status: DESIGN, approved for implementation.**

## Problem

The daily answer is a deterministic hash of the date over the playable pool (`dailyAnswer` in
`src/lib/game/daily.ts`). We want to override specific dates with chosen dinosaurs — Ghost Ranch camp
week, themed days ("murder turkey" Velociraptor on Thanksgiving) — while every other day keeps the
deterministic pick.

Seed calendar (from #44):

| Date | Dino |
|---|---|
| 2026-07-27 | Coelophysis |
| 2026-07-28 | Tawa |
| 2026-07-29 | Pentaceratops |
| 2026-07-30 | Suskityrannus |
| 2026-07-31 | Zuniceratops |

All six candidate genera (incl. Velociraptor) are **already playable** (verified 2026-07-20), so the
seed calendar has no pool dependency.

## Decisions

- **Calendar is exact-date, by genus name.** Keys are `YYYY-MM-DD` (matched against the same local
  `todayString()` the daily already uses); values are genus **names** (matching #44's "define by
  name"). No recurring/month-day keys — Thanksgiving is the 4th Thursday (not a fixed date), so a raw
  `MM-DD` wouldn't catch it anyway; add specific dated entries per year instead.
- **Schedule and pin stay separate.** The calendar does **NOT** auto-pin. A calendar entry must name a
  genus that is **already playable** (naturally, or via an explicit `ALWAYS_PLAYABLE` pin, #46). The
  calendar never silently mutates the permanent pool or evicts a clade neighbor as a side effect of
  scheduling a special day. To feature a not-yet-playable dino, add it to `ALWAYS_PLAYABLE` *and* the
  calendar — two deliberate acts.
- **Build validates; runtime falls back.** `build:data` checks every calendar entry against the
  playable pool and warns loudly on any name that's unknown or not playable (like the #46 pin report).
  At runtime, any date whose entry is missing/unresolved silently falls back to the deterministic pick
  ("if we goof it, quietly falls back" — #44).
- **Name→id resolved at build.** The calendar source is name-keyed, but `dailyAnswer` works in
  id-space. The build resolves each name to a genus id and emits a committed `date → id` map; the
  runtime does zero name matching and `dailyAnswer` stays a pure, unit-testable id-space function.

## Design

### Source: committed name-keyed calendar

```typescript
// src/lib/game/daily-calendar.ts
// Special-day daily overrides, by exact local date → genus NAME. Every name must be PLAYABLE
// (naturally or via an ALWAYS_PLAYABLE pin, #46) — the build warns + that date falls back otherwise.
// The calendar never auto-pins; scheduling and pinning are separate deliberate acts. See
// docs/superpowers/specs/2026-07-20-daily-calendar-design.md.
export const DAILY_CALENDAR: Record<string, string> = {
  "2026-07-27": "Coelophysis",
  "2026-07-28": "Tawa",
  "2026-07-29": "Pentaceratops",
  "2026-07-30": "Suskityrannus",
  "2026-07-31": "Zuniceratops",
};
```

### Build: validate + emit a resolved date→id map

In `build-tree.ts`, after the playable set is finalized, resolve `DAILY_CALENDAR` against the
playable genera (by name), producing a committed `Record<string, string>` of `date → genus id`:

- name resolves to a **playable** genus → add `{date: id}` to the emitted map; report `✓`.
- name unknown, or resolves to a non-playable genus → **omit** from the map; report `⚠ … — falls back`.

Emit the resolved map into the committed data (a new `src/data/daily-calendar.json`, mirroring
`genera-index.json`/`genus-attributes.json`). Print a calendar section in the build report
(`daily calendar: N/M dates resolved`, with the per-date outcomes).

Validation reuses the same "is it in the playable set" check the pin report uses — a calendar entry
that isn't playable is exactly the failure to warn about.

### Runtime: override before the hash

`dailyAnswer` gains the resolved override map (id-space, so no tree access needed):

```typescript
export function dailyAnswer(
  dateStr: string,
  pool: { id: string }[],
  calendar: Record<string, string> = {},
): string {
  const override = calendar[dateStr];
  if (override && pool.some((p) => p.id === override)) return override; // scheduled + still playable
  const sorted = [...pool].sort((a, b) => qnum(a.id) - qnum(b.id));
  return sorted[hashDate(dateStr) % sorted.length].id;
}
```

The `pool.some(...)` guard is defense-in-depth: even though the build only emits playable ids, a
committed-map/pool drift (e.g. a genus later pruned) still falls back cleanly rather than returning an
unplayable id. `dailyStore` passes the imported `daily-calendar.json` as `calendar`.

## Out of scope

- **Auto-pinning from the calendar.** Rejected: keeps schedule/pin separate; a pin is permanent +
  cap-only and shouldn't be a silent side effect of a one-day schedule.
- **Recurring / holiday dates.** Exact dates only (Thanksgiving's floating date defeats MM-DD).
- **Multiple dinos per date / ranges.** One dino per date.
- **Un-pinnable calendar entries.** If a future calendar names a no-clue/degenerate genus (e.g.
  Overoraptor), it can't be playable, so it warns + falls back — no special handling.

## Success criteria

- `DAILY_CALENDAR` with the 5 seed dates → `build:data` emits `src/data/daily-calendar.json` mapping
  each date to its genus id (all 5 resolve, since all are playable), and the build report shows
  `daily calendar: 5/5 dates resolved`.
- On 2026-07-28 (local), the daily answer is **Tawa**; on a non-calendar date, it's the deterministic
  pick (unchanged from today).
- A bogus entry (e.g. `"2026-07-27": "Notadino"`) warns at build and is omitted from the map; that
  date falls back at runtime.
- `dailyAnswer` unit tests: override returned when date present + id in pool; deterministic pick when
  date absent; fallback when override id not in pool. Existing `dailyAnswer` tests still pass (3-arg
  call with default `{}`).
- `npx tsc --noEmit`, `npx vitest run`, `npx svelte-check` clean. GUARD 2 unaffected (calendar doesn't
  change the pool).

## Verification

- Pure `dailyAnswer` tests (TDD): the three branches above + determinism preserved.
- Build check: the 5 seed dates resolve; a temp bogus entry warns + is omitted.
- Runtime spot-check: set the clock / pass a fixed date to confirm 2026-07-28 → Tawa in the app.
