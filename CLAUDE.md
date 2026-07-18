# Mesozooa

A dinosaurs-only, Metazooa-style cladistics guessing game, plus a walkable dinosaur
cladogram (reference explorer). Static SPA — **Svelte 5 (runes) + TypeScript + Vite**, no
backend. Tree data is harvested from **Wikidata** at build time; per-genus paleo clues from
**PBDB**. Everything is baked into committed JSON — no runtime network calls. Live at
`https://mesozooa.latrani.net/`.

## The one thing to remember

**One tree, one source of truth.** Every piece of game feedback is a pointer to a node in
the dinosaur tree (the MRCA of guess + target), never a projection onto a parallel rank
ladder. Don't reintroduce a second representation. (This is why guess rows, the warmest
trail, and the tree all read the same node objects.)

## Architecture

Built spec-first; design specs live in `docs/superpowers/specs/`, implementation plans in
`docs/superpowers/plans/`. Feature history is in git and GitHub issues — this section is the
durable code map, not a changelog.

**Pure core (TDD-tested):**
- `src/lib/tree/` — the tree itself: `assemble`, `mrca`, `terminalClade`,
  `markPlayable`/`prunePlayable`. Playable pool + `DEFAULT_CAP_DIALS` in `playable.ts`.
- `src/lib/game/engine-core.ts` — pure reducer + selectors: `applyGuess`/`applyHint`/`applyForfeit`,
  `warmestSharedNodeId`, `revealedNodeIds`, `specimenState`, `leafHintActive` (the terminal-clue
  trigger).
- `src/lib/game/` pure helpers: `warmth.ts` (swappable `WarmthProvider`), `warmth-ramp.ts`
  (ore→gem), `spine-layout.ts` (`layoutSpine` + `centerOffsetFor`), `specimen-view.ts`,
  `clue.ts` (`clueFor` + the shared `formatClueAge`/`formatClueLocation`), `zoom.ts`
  (pinch/scroll math).
- `src/lib/geologic-time.ts` (`enrichAge`, `isMesozoic`, `MESOZOIC_END_MA`), `pbdb-parse.ts`
  (`modalLocality`), `image-credits.ts` (`formatCredit`).

**UI (Svelte 5 runes):**
- `src/lib/game/components/` — `GameBoard` (shared by Daily + Practice), `SpineTree` (the
  horizontal focus+context spine; pinch/wheel/button zoom), `SpecimenPlacard`, guess list, search.
- `src/lib/explorer/` — `Explorer.svelte` + `explorer-core.ts`; reuses `SpineTree`.
- `src/App.svelte` — three-tab nav (Daily · Practice · Explore). Stores (`dailyStore`,
  `gameStore`, explorer store) are module singletons so tabs preserve state. `src/lib/nav.svelte.ts`
  lifts tab state and the game→Explore handoff.
- Visual system: `src/lib/styles/tokens.css`, two layers (primitives + semantic roles) so a
  region recolors in one line. Locked visual spec: `docs/superpowers/specs/2026-07-13-mesozooa-visual-design.md`
  §2. Warm adobe/terracotta ground; the ore→gem warmth ramp shows only in the specimen chip + guess bars.

**Data + build:**
- `src/data/*.json` — committed game data (`tree.json`, `genus-attributes.json`, `meta.json`)
  plus `data/image-credits.json`. No runtime network calls.
- `scripts/` — the harvest pipeline (`fetch-wikidata` → `fetch-pbdb` → `fetch-images` →
  `process-images` → `build-tree`; see **Key parameters** for the `npm run fetch` chain and macOS steps).
- Offline PWA via `vite-plugin-pwa` (precache-everything). `src/gallery/` → `/gallery.html`, a
  static harness of every visual state (driven by the real components + engine); **use it for
  visual iteration.**

**Load-bearing design decisions (don't undo without cause):**
- The game board and Explore render the ONE `SpineTree`; game feedback is always a tree node.
- Specimen progresses broad (`N genera`) → terminal (`N sibling taxa` + clue) → solved, via
  `specimenState`.
- **Playtest reversals — do NOT "restore" the originals** (play beat the doctrine): Explore grades
  genus labels by playability (`gradeByPlayable`, so you can see which names the guess box accepts);
  end-state turns revealed nodes into Explore links (`linkLabels`).

## Open threads

Work items live in GitHub issues now (see **Working agreements → Tracking deferred work**). The
durable *context* stays here:

- **Taxonomy source — biggest open design question; brainstorm before coding** (epic
  [#13](https://github.com/latrani/Mesozooa/issues/13); research in
  `docs/superpowers/specs/2026-07-17-taxonomy-source-research.md`). The load-bearing fact:
  **Wikidata's `parent taxon` is not a cladogram**, and we're already asserting its phylogeny
  silently. The decision is whether PBDB becomes a *structural* second opinion or an
  *advisory/report-only* one (via the fail-closed `NAME_DECISIONS` pattern). One decision drives
  three symptoms — Archaeopteryx as a dead-equidistant guess, genus synonym merges, PBDB homonym
  mis-dating. Cheap first step (no tree change): one PBDB taxonomy fetch + one diff to size it.
- **Not happening — a dark theme** (closed [#26](https://github.com/latrani/Mesozooa/issues/26)).
  It fights the warm adobe/terracotta material; sun-baked clay has no night mode. The two-layer
  token split is a semantics preference, NOT theming groundwork.

## Working agreements

- **Function first; defer look-and-feel.** Build structurally-correct, visually-minimal UI;
  aesthetics are a dedicated later pass with detailed user direction. Don't polish piecemeal.
- **IA/layout before visuals.** The user is a UX designer: settle information architecture and
  layout (in ASCII wireframes, not rendered mockups) before any color/type. Don't front-load or
  park visual decisions in structural specs.
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Vitest does
  NOT catch violations — run `npx tsc --noEmit` (and `npx svelte-check` for `.svelte`) before
  committing. Pure logic is TDD-tested; Svelte components validated by build + running.
- **Tracking deferred work — file GitHub issues, NOT doc entries.** When a review defers a finding,
  a design problem is parked, or a tradeoff is accepted, open an issue on `latrani/Mesozooa`. Label
  meanings: `epic` (multi-symptom design question, umbrella), `tech-debt` (a deferred fix / check /
  test gap), `by-design` (accepted-as-correct — file it **closed** so the rationale is searchable and
  not re-flagged), `wontfix` (a declined problem). Delivery follows the usual rule: commit fixes with
  `Closes #N` but leave unpushed (Indi pushes). The retired `docs/superpowers/deferred-findings.md` is
  now history only (Resolved log + a short accepted-micro-tradeoffs appendix); the SDD `progress.md`
  ledger is still scratch.
- **`build:data` regenerates ALL committed data from the gitignored, machine-local raws — so a
  stale/incomplete raw pull silently DEGRADES the committed output.** This bit us once (2026-07-17:
  a Jul-14 `raw-pbdb.json` predating the state/formation harvest wiped clue location detail when
  `build:data` ran to bake image credits). Rule: **never run `build:data` without a current
  `fetch:pbdb`/`fetch` first.** Two fail-closed guards in `build-tree.ts` now enforce this (stale-raw
  input check + committed-output regression check, >10% drop); override an intentional shrink with
  `ALLOW_DATA_REGRESSION=1`.

## Key parameters

- **Reference pool** ≈ 1,813 Mesozoic genera — all browsable in Explore. Scoped by three cuts in
  `build-tree.ts`: the Neornithes subtree, any genus PBDB dates entirely after the **K–Pg boundary**
  (`isMesozoic` / `MESOZOIC_END_MA` in `geologic-time.ts` — it's called Meso·zooa), and **undated
  genera under Aves** (`AVES` in `tree/types.ts`), Aves being the only clade here that crosses the
  boundary and so the only place a missing date can hide a Cenozoic taxon. Undated genera elsewhere
  are kept: they're Mesozoic by construction, and ~57% of the pool has no PBDB data at all.
- **Playable pool ≈ 785** — base = genus + enwiki; pruned to require a paleo clue (age AND
  location) and a diversity-scaled adaptive cap (3–7 per terminal set, tight on low-diversity
  "boring bucket" clades, wide on well-spread ones). Gates guesses/autocomplete AND
  daily/practice answers (one pool; `playable` flag). Cap dials = `DEFAULT_CAP_DIALS` in
  `src/lib/tree/playable.ts`.
- **Warmth** = size of the shared clade (`descendantGenusCount`), via a swappable
  `WarmthProvider` (`CountWarmth` now; `PercentWarmth` a config swap).
- **Build:** `npm run fetch` runs the whole pipeline — `fetch:wikidata` → `fetch:pbdb` →
  `fetch:images` → `process:images` → `build:data` — regenerating the committed `src/data/*.json`
  (each stage stays runnable individually for debugging). `fetch:images` (Commons thumbnails +
  credits → gitignored repo-root `images-src/` + committed `data/image-credits.json`) and
  `process:images` (width-cap + WebP → gitignored `public/images/`, the shipped assets) are
  macOS-only build steps
  (`sips`/`cwebp`) and network-bound; both presence-skip so re-runs are cheap. `build:data` also
  emits `src/data/meta.json` (`dataPulledAt` = older of the two raw mtimes, i.e. when the raws were
  last pulled; surfaced in the app footer). See `src/data/README.md`.
