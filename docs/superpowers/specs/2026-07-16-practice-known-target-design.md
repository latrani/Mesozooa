# Mesozooa — Practice Known-Target Param Design

**Date:** 2026-07-16
**Status:** Approved (brainstorm), pending implementation plan

## Problem

Practice mode picks a random target, so there's no way to walk a *specific* known game —
which is exactly what's needed to feel a particular lineage's behavior (e.g. play a game you
know is Stegosaurus and watch hints skip through the monotypic run). Add a URL param that seeds
practice with a chosen target.

## Prior facts (verified against the code)

- `game = createGame()` is a **module singleton** (`gameStore.svelte.ts`); its `state` persists
  for the page lifetime. The target changes ONLY via `newRound()`, called only by the "New
  round" button. **Switching tabs already preserves an in-progress practice game** — nothing in
  the routing/tab path resets it. Only a **page reload** loses it (fresh singleton → fresh
  random target). Practice is deliberately not persisted (unlike Daily's localStorage).
- The route grammar (`route.ts`) already carries a `taxon` slot, currently honored only on
  `explore`, resolved via `resolveTaxonRef` (slug or Q-id, case-normalized).
- `newRoundState(store, rng = Math.random)` already has an rng seam.

## Design

A **load-only seed**. The singleton already handles leave-and-return across tabs, so the param
only needs to be a clean entry point — no URL write-sync, no persistence.

### Grammar — `src/lib/route.ts`

Honor `taxon` on `practice` as well as `explore`. In `parseHash`, widen the guard that reads
`taxon` from `tab === "explore"` to `tab === "explore" || tab === "practice"`. Update the
grammar comment at the top of the file to show `#/practice?taxon=<slug-or-qid>`. `formatHash`
is NOT extended for practice (no write-sync — see below).

### Seeding — `src/lib/game/engine-core.ts`

Extend `newRoundState` with an optional explicit target:

```ts
export function newRoundState(
  store: TreeStore,
  rng: () => number = Math.random,
  targetId?: string,
): GameState
```

If `targetId` is provided AND playable (`store.isPlayable(targetId)`), use it verbatim;
otherwise fall back to the random roll. One fallback covers unknown-id, non-playable, and the
normal (no-arg) case. Mode stays `"practice"`, `maxGuesses: null`, as today.

### Store — `src/lib/game/gameStore.svelte.ts`

Add a method to start a round on an explicit target:

```ts
startWith(targetId: string) {
  state = newRoundState(treeStore, Math.random, targetId);
}
```

`newRound()` is unchanged (stays plain random).

### Wiring — `src/lib/nav.svelte.ts`

`apply(route)` gains a practice branch: when `route.tab === "practice" && route.taxon`, resolve
via `resolveTaxonRef(treeStore, route.taxon)`; if it resolves to a **playable genus**, call
`game.startWith(id)`. This fires on `hydrate()` (initial load) and on hashchange.

**Guard against clobbering an in-progress game.** `apply` runs on every hashchange to a
`#/practice?taxon=…` URL. It must only (re-)seed when the resolved target **differs from the
current practice target** — so navigating back to a stale param-URL, or a redundant hash write,
does not wipe an in-progress game. Concretely: `if (id && treeStore.getNode(id)?.playable && id
!== game.state.target) game.startWith(id)`. (nav importing `game` is consistent with it already
importing `explorer` and `treeStore`.)

### Explicitly NOT doing (scope guard)

- **No URL write-sync.** `App.svelte`'s hash-writing `$effect` keeps emitting bare `#/practice`
  as you play; the address bar does not grow a `?taxon=`. Do not extend `formatHash` or the
  App write effect for practice. (This is the "load-only" decision — the canonical hash for a
  live practice state is `#/practice`, so the existing loop-guard in App still holds: a parsed
  `#/practice?taxon=x` canonicalizes to `#/practice`, which equals the write side, so our own
  writes never bounce.)
- **No change to `newRound()`** — stays plain random. Re-roll to random is how you leave a
  pinned game.
- **No localStorage persistence** for practice.

## Behavior

- **First load** of `#/practice?taxon=stegosaurus` → practice starts on Stegosaurus. (Replaces
  the initial random round the singleton created at construction; no guesses lost — it's load
  time.)
- **Reload** of that URL → same target, fresh guesses (practice isn't persisted). A fresh known
  game — exactly what a walkthrough wants.
- **Tab away and back** (in-app) → in-progress game preserved by the singleton, param
  irrelevant. The differ-guard ensures the hashchange re-seed is a no-op when the target is
  unchanged.
- **Unknown slug / unresolvable ref / non-playable genus** → silently start/keep a normal
  random round. No error UI (dev affordance).

## Out of scope

- Practice persistence across reload (guesses).
- Any daily-mode change (daily's target is date-derived, not URL-driven).

## Addendum (2026-07-16, post-implementation) — FINAL: seed action route (supersedes above)

The design churned through three shapes before landing; recording the path honestly.

1. **Load-only** (Tasks 1–3, shipped): `#/practice?taxon=X` seeds on load/cross-tab arrival.
   Final review found same-tab `?taxon=` edits don't re-seed (canonical guard sees no change),
   so iterating targets needs a reload.
2. **Two-way sync** (Task 4, BUILT THEN REVERTED): made the practice target part of the
   canonical hash so edits re-seed. **Rejected by the user** — it writes the *answer* into the
   URL you play under (a spoiler), for *every* practice game including random ones. The whole
   reason two-way was resisted from the start.
3. **Seed action route** (FINAL): a dedicated `#/practice/seed?taxon=X` *action* that seeds
   practice and immediately redirects to a clean, param-free `#/practice`. Best of both — you
   can type/switch a known target and walk it, but the answer never lingers in the URL.

**Final design:**
- `parseHash`: `#/practice/seed?taxon=X` → `{ tab:"practice", taxon:X, seed:true }`; no taxon →
  plain `{ tab:"practice" }`. Plain `#/practice?taxon=X` **drops** the taxon (practice is
  param-free — its target is the answer). `formatHash`/`App.currentTaxonSlug` stay explore-only.
- `nav.apply` seed branch: resolve → `game.startWith(id)` if playable → `history.replaceState`
  to `#/practice` (not `location.hash=`, so the transient seed URL is no history entry and fires
  no hashchange). Non-playable/unknown ref → lands on plain practice.
- `App` hashchange handler: a `seed` route ALWAYS applies (its canonical form is `#/practice` ==
  `currentHash`, so the guard would wrongly skip it).

**Consequences:**
- No spoiler: the URL you play under is always bare `#/practice`; the answer appears only in the
  seed URL *you* typed, for one tick before redirect.
- Same-tab re-seed works: navigating to `#/practice/seed?taxon=Y` mid-game seeds Y and redirects.
- Not shareable-as-live-state (by design — that would be a spoiler). The seed URL is a shareable
  *setup* link, which is fine (whoever opens it chose to know the target).
- The differ-guard is gone (unnecessary — seed always redirects away, so there's no stale-param
  state to guard against; re-seeding the same target = restart that walkthrough, which is fine).

## Files touched

- `src/lib/route.ts` (parseHash guard + grammar comment)
- `src/lib/game/engine-core.ts` (`newRoundState` optional target)
- `src/lib/game/gameStore.svelte.ts` (`startWith`)
- `src/lib/nav.svelte.ts` (`apply` practice branch + differ-guard)
- Tests: `engine-core.test.ts` (newRoundState target/fallback), `route.test.ts` (practice taxon
  parse) if present.
