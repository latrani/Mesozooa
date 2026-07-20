# Daily-Dino Calendar (#44) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Override the daily answer on specific dates with chosen dinosaurs (Ghost Ranch camp week), every other day keeping the deterministic pick. Calendar is by-name, validated at build, resolved to a committed date→id map, applied at runtime before the hash with a fallback.

**Architecture:** `dailyAnswer` gains an optional id-space `calendar: Record<date,id>` param (override if today's id is present + still in pool, else deterministic). A committed name-keyed `DAILY_CALENDAR` source is resolved+validated in `build-tree.ts` against the playable set, emitting `src/data/daily-calendar.json`. `dailyStore` imports that JSON and passes it. Schedule and pin stay separate — the calendar never auto-pins.

**Tech Stack:** TypeScript, Vitest (pure TDD), tsx build script, Svelte 5. `verbatimModuleSyntax` ON.

## Global Constraints

- **`verbatimModuleSyntax` is ON.** Type-only imports use `import type`; `DAILY_CALENDAR` and the JSON import are runtime values.
- **Calendar does NOT auto-pin.** A calendar entry must name an ALREADY-playable genus; the build warns + omits otherwise. Never mutate the pool from the calendar.
- **Runtime falls back cleanly.** Any date whose override id is absent or not in the current pool → deterministic pick.
- **Name→id resolution happens at BUILD**, not runtime. `dailyAnswer` stays a pure id-space function.
- **Never run `build:data` on stale raws** (CLAUDE.md). Task 4 rebuilds; raws are current from this session (no re-fetch needed — the calendar doesn't change the pool).
- **Merge workflow:** feature branch → main, no PRs, Indi pushes. Commit with `Closes #44`.

---

### Task 1: `dailyAnswer` accepts an override calendar (pure, TDD)

**Files:**
- Modify: `src/lib/game/daily.ts` (`dailyAnswer`)
- Test: `src/lib/game/daily.test.ts` (extend the existing `describe("dailyAnswer")` block)

**Interfaces:**
- Consumes: existing `pool: {id}[]`.
- Produces: `dailyAnswer(dateStr, pool, calendar?: Record<string, string>): string` — `calendar` maps date→genus id and defaults to `{}` (existing 2-arg callers/tests unaffected). Returns `calendar[dateStr]` iff that id is in `pool`; else the deterministic pick.

- [ ] **Step 1: Write the failing tests**

Add inside the existing `describe("dailyAnswer", ...)` block in `src/lib/game/daily.test.ts` (which defines `const pool = [{ id: "Q100" }, { id: "Q9" }, { id: "Q30" }];`). Append after the "can differ across dates" test:

```typescript
  it("returns the calendar override when the date is present and the id is in the pool", () => {
    expect(dailyAnswer("2026-07-28", pool, { "2026-07-28": "Q30" })).toBe("Q30");
  });
  it("ignores an override whose id is NOT in the pool (falls back to deterministic)", () => {
    const cal = { "2026-07-28": "Q999" }; // Q999 not in pool
    expect(dailyAnswer("2026-07-28", pool, cal)).toBe(dailyAnswer("2026-07-28", pool));
  });
  it("uses the deterministic pick for a date not in the calendar", () => {
    const cal = { "2026-07-28": "Q30" };
    expect(dailyAnswer("2026-07-12", pool, cal)).toBe(dailyAnswer("2026-07-12", pool));
  });
  it("defaults to no calendar (2-arg call unchanged)", () => {
    expect(pool.map((p) => p.id)).toContain(dailyAnswer("2026-07-12", pool));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/daily.test.ts`
Expected: the override tests FAIL (3rd arg ignored — `dailyAnswer("2026-07-28", pool, {...})` returns the deterministic pick, not `"Q30"`).

- [ ] **Step 3: Implement the override**

In `src/lib/game/daily.ts`, replace `dailyAnswer`:

```typescript
export function dailyAnswer(
  dateStr: string,
  pool: { id: string }[],
  calendar: Record<string, string> = {},
): string {
  // Special-day override (#44): use the scheduled id iff it's still in the playable pool. The
  // pool.some guard is defense-in-depth — the build only emits playable ids, but a committed-map /
  // pool drift (a genus later pruned) falls back cleanly rather than returning an unplayable answer.
  const override = calendar[dateStr];
  if (override && pool.some((p) => p.id === override)) return override;
  const sorted = [...pool].sort((a, b) => qnum(a.id) - qnum(b.id));
  return sorted[hashDate(dateStr) % sorted.length].id;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/daily.test.ts`
Expected: PASS (all prior + 4 new). Existing 2-arg tests still pass (default `{}`).

- [ ] **Step 5: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/daily.ts src/lib/game/daily.test.ts
git commit -m "feat(daily): dailyAnswer accepts an optional date->id override calendar"
```

---

### Task 2: `DAILY_CALENDAR` source + build resolution + emit

**Files:**
- Create: `src/lib/game/daily-calendar.ts`
- Modify: `scripts/build-tree.ts` (resolution block after the playable `index` is built ~line 196; new emit ~line 271; report ~line 284)

**Interfaces:**
- Consumes: `DAILY_CALENDAR: Record<string,string>` (date→name); the finalized `playable` TreeNode[] (already in scope in build-tree, ~line 195).
- Produces: committed `src/data/daily-calendar.json` = `Record<string,string>` (date→genus id), containing only entries whose name resolved to a playable genus.

- [ ] **Step 1: Create the calendar source**

Create `src/lib/game/daily-calendar.ts`:

```typescript
// Special-day daily overrides, by exact LOCAL date (YYYY-MM-DD) → genus NAME. Every name must be
// PLAYABLE (naturally or via an ALWAYS_PLAYABLE pin, #46); the build warns + omits otherwise, and
// that date falls back to the deterministic pick. The calendar never auto-pins — scheduling and
// pinning are separate deliberate acts. See docs/superpowers/specs/2026-07-20-daily-calendar-design.md.
export const DAILY_CALENDAR: Record<string, string> = {
  "2026-07-27": "Coelophysis",
  "2026-07-28": "Tawa",
  "2026-07-29": "Pentaceratops",
  "2026-07-30": "Suskityrannus",
  "2026-07-31": "Zuniceratops",
};
```

- [ ] **Step 2: Import DAILY_CALENDAR in build-tree**

Add near the other imports (top of `scripts/build-tree.ts`, alongside `ALWAYS_PLAYABLE`):

```typescript
import { DAILY_CALENDAR } from "../src/lib/game/daily-calendar";
```

- [ ] **Step 3: Resolve + validate the calendar (after the playable index is built)**

In `build-tree.ts`, the playable set + index are built ~line 195-196:

```typescript
  const playable = playableGenera(tree);
  const index = playable
    .map((n) => ({ id: n.id, name: n.name }))
    ...
```

After the `index` assignment (and after `clueOut` is built, so it's near the other emitted-data prep), add:

```typescript
  // Resolve the daily calendar (#44) date→name against the PLAYABLE set → committed date→id map.
  // A name that isn't a playable genus is omitted + warned; that date falls back at runtime. The
  // calendar never pins (schedule and pin are separate) — an unplayable entry is a curation error.
  const playableByName = new Map(playable.map((n) => [n.name, n.id]));
  const dailyCalendar: Record<string, string> = {};
  const calReport: string[] = [];
  for (const [date, name] of Object.entries(DAILY_CALENDAR)) {
    const id = playableByName.get(name);
    if (id) { dailyCalendar[date] = id; calReport.push(`  ✓ ${date}: ${name} (${id})`); }
    else { calReport.push(`  ⚠ ${date}: "${name}" not playable — falls back`); }
  }
```

- [ ] **Step 4: Emit the resolved map**

In the emit block (~line 267-271, alongside the other `writeFile`s), add:

```typescript
  await writeFile("src/data/daily-calendar.json", JSON.stringify(dailyCalendar));
```

- [ ] **Step 5: Print the calendar report**

In the report log block (~line 283-284, after the always-playable pins log), add:

```typescript
  console.log(`daily calendar: ${Object.keys(dailyCalendar).length}/${Object.keys(DAILY_CALENDAR).length} dates resolved`);
  for (const line of calReport) console.log(line);
```

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit** (source + build wiring; the emitted JSON lands in Task 4's rebuild)

```bash
git add src/lib/game/daily-calendar.ts scripts/build-tree.ts
git commit -m "feat(build): resolve DAILY_CALENDAR names to a committed date->id map with a report"
```

---

### Task 3: Wire the calendar into `dailyStore`

**Files:**
- Modify: `src/lib/game/dailyStore.svelte.ts` (~line 16 import, ~line 35 call site)

**Interfaces:**
- Consumes: `dailyAnswer(..., calendar)` (Task 1); `src/data/daily-calendar.json` (Task 2's emitted file).
- Produces: the daily store now applies the calendar. No new exports.

NOTE: `src/data/daily-calendar.json` does not exist until Task 4's build runs. To keep this task
type-clean and committable on its own, create a placeholder empty map now; Task 4 overwrites it with
the real resolved map. (The build always rewrites it, so the placeholder is transient.)

- [ ] **Step 1: Create a placeholder committed map**

Create `src/data/daily-calendar.json` with an empty object so the import resolves before the first
post-feature build:

```json
{}
```

- [ ] **Step 2: Import + pass the calendar**

In `src/lib/game/dailyStore.svelte.ts`, add the import near the `dailyAnswer` import (~line 16):

```typescript
import dailyCalendar from "../../data/daily-calendar.json";
```

Then change the call site (~line 35) from:

```typescript
  const pool = treeStore.playableGenera().map((n) => ({ id: n.id }));
  return newDailyState(dailyAnswer(date, pool));
```

to:

```typescript
  const pool = treeStore.playableGenera().map((n) => ({ id: n.id }));
  return newDailyState(dailyAnswer(date, pool, dailyCalendar as Record<string, string>));
```

- [ ] **Step 3: Verify types + build compile**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: clean. (JSON module import resolves; `resolveJsonModule` is already on since `clue.ts` imports `genus-attributes.json` the same way.)

- [ ] **Step 4: Commit**

```bash
git add src/data/daily-calendar.json src/lib/game/dailyStore.svelte.ts
git commit -m "feat(daily): dailyStore applies the committed daily-calendar override map"
```

---

### Task 4: Rebuild + verify the calendar resolves and drives the answer

**Files:**
- Modify (generated, committed): `src/data/daily-calendar.json` (+ the usual `tree.json`/`genera-index.json`/`genus-attributes.json`/`meta.json` if anything drifted).

**Interfaces:**
- Consumes: Tasks 1-3; current raws.
- Produces: the real resolved `daily-calendar.json`.

- [ ] **Step 1: Build**

Run: `npm run build:data 2>&1 | tail -30`
Expected: build report includes `daily calendar: 5/5 dates resolved` with a `✓` line per date (all 5 seed genera are playable). GUARD 2 unaffected. No name-gate/regression trip.

- [ ] **Step 2: Verify the emitted map**

Run:
```bash
node -e 'const c=JSON.parse(require("fs").readFileSync("src/data/daily-calendar.json","utf8"));const t=JSON.parse(require("fs").readFileSync("src/data/tree.json","utf8"));for(const [d,id] of Object.entries(c)){const n=Object.values(t.nodes).find(x=>x.id===id);console.log(d,"->",id,n?n.name:"MISSING");}'
```
Expected: 5 entries, e.g. `2026-07-28 -> <qid> Tawa`, `2026-07-30 -> <qid> Suskityrannus`, etc. — each id resolving to the intended genus name.

- [ ] **Step 3: Verify the answer for a calendar date (pure)**

Run:
```bash
node -e 'const {dailyAnswer}=require("./src/lib/game/daily.ts"); ' 2>/dev/null || npx tsx -e '
import { dailyAnswer } from "./src/lib/game/daily";
import cal from "./src/data/daily-calendar.json" assert { type: "json" };
import { readFileSync } from "node:fs";
const pool = JSON.parse(readFileSync("src/data/genera-index.json","utf8")).map((x:any)=>({id:x.id}));
const t = JSON.parse(readFileSync("src/data/tree.json","utf8"));
const name = (id:string)=>Object.values(t.nodes).find((n:any)=>n.id===id)?.name;
const a = dailyAnswer("2026-07-28", pool, cal as Record<string,string>);
console.log("2026-07-28 answer:", a, name(a), "(expect Tawa)");
const b = dailyAnswer("2026-06-15", pool, cal as Record<string,string>);
console.log("2026-06-15 (non-calendar) answer:", b, name(b), "(deterministic)");
'
```
Expected: `2026-07-28 answer: <qid> Tawa`; the non-calendar date returns some deterministic genus (not necessarily notable).

- [ ] **Step 4: Full validation**

Run: `npx tsc --noEmit && npx vitest run && npx svelte-check 2>&1 | tail -5`
Expected: all pass (290+ tests).

- [ ] **Step 5: Commit**

```bash
git add src/data/daily-calendar.json src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json src/data/meta.json
git commit -m "data: build resolved daily-calendar map — Ghost Ranch camp week (Closes #44)

Coelophysis / Tawa / Pentaceratops / Suskityrannus / Zuniceratops on
2026-07-27..31. All 5 resolve (already playable); other days keep the
deterministic pick."
```

---

## Self-review notes

- **Spec coverage:** override param + fallback (Task 1), by-name source + build validate/emit/report (Task 2), runtime wiring (Task 3), rebuild + verify Tawa-on-07-28 (Task 4). All covered.
- **Placeholder file rationale:** Task 3 needs `daily-calendar.json` to exist for the import to type-check before Task 4's build writes the real one. Empty `{}` is a safe transient (build always overwrites; an empty calendar just means "all deterministic").
- **Type consistency:** `dailyAnswer(date, pool, calendar?)` signature matches Task 1 def ↔ Task 3 call. `DAILY_CALENDAR: Record<string,string>` (name-keyed) vs emitted `daily-calendar.json: Record<string,string>` (id-keyed) — same TS type, different key space; documented so they're not conflated.
- **No regression:** default `{}` keeps the 2-arg `dailyAnswer` behavior; existing daily tests pass unchanged.
