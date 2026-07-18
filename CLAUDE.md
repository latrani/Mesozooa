# Mesozooa

A dinosaurs-only, Metazooa-style cladistics guessing game, plus a walkable dinosaur
cladogram (reference explorer). Static SPA — **Svelte 5 (runes) + TypeScript + Vite**, no
backend. Tree data is harvested from **Wikidata** at build time; per-genus paleo clues from
**PBDB**. Everything is baked into committed JSON — no runtime network calls.

## The one thing to remember

**One tree, one source of truth.** Every piece of game feedback is a pointer to a node in
the dinosaur tree (the MRCA of guess + target), never a projection onto a parallel rank
ladder. Don't reintroduce a second representation. (This is why guess rows, the warmest
trail, and the TreeView all read the same node objects.)

## Status (what's built — all merged to `main`)

Built via spec → plan → subagent-driven execution. Design specs and implementation plans
live in `docs/superpowers/specs/` and `docs/superpowers/plans/`.

- **Foundation** — scaffold, pure tree lib (`src/lib/tree/`: `assemble`, `mrca`,
  `terminalClade`, `markPlayable`/`prunePlayable`), Wikidata + PBDB build pipeline,
  committed `src/data/tree.json`.
- **Game (Plan 2 + 2b)** — full game under `src/lib/game/`: `engine-core` (pure reducer +
  selectors), stores, and Svelte components. **Daily** (deterministic answer, 20-guess
  budget, hints, emoji share, `localStorage`) + **Practice** (unlimited). Shared
  `GameBoard`.
- **Reference explorer (Plan 3)** — `src/lib/explorer/`: walk-down cladogram reusing
  `TreeView`/`SearchBox`/`TaxonCard`/`treeStore`.
- **App** — three-tab nav **Daily · Practice · Explore** (`src/App.svelte`); stores are
  module singletons so tabs preserve state.
- **Leaf-disambiguation Plan A (data)** — playable pool notability-pruned to **≈785**. Base
  eligibility = genus + enwiki article (NO family-ancestor requirement — that gate excluded
  ~40% of notable genera like Oviraptor whose Wikidata parent skips its family). Pruned to
  require a paleo clue (age AND discovery location) and a **diversity-scaled adaptive cap**
  (3–7 per terminal set): tight on low-diversity "boring bucket" clades (one country / tight
  age span, where the clue can't disambiguate — e.g. Mamenchisauridae → 3), wide on
  well-spread "wastebasket" clades (many countries / wide age span — e.g. Saurischia).
  Dials in `DEFAULT_CAP_DIALS` (`src/lib/tree/playable.ts`). Clue in
  `src/data/genus-attributes.json` (age + discovery location, from PBDB). Ages are enriched at
  build time via `src/lib/geologic-time.ts` (`enrichAge`): a coarse `ageEpoch` is derived for
  every genus, and a stage `ageLabel` is derived from raw Ma for genera PBDB gives
  numbers-only (rescued the Morrison A-list: Diplodocus, Brachiosaurus, Ceratosaurus, … —
  which lacked interval strings and were wrongly pruned). Location is likewise layered: PBDB
  occurrences give country + state + formation, reduced to a coherent modal locale by
  `modalLocality` (`pbdb-parse.ts`, modal country → modal state within → modal formation
  within). Both clues render coarse-lead + parenthesised-detail via `formatClueAge` /
  `formatClueLocation` (`src/lib/game/clue.ts`, the single shared formatters): `Lived: {epoch}
  ({stage}, {Ma} mya)` and `Found in: {country} ({state}, {formation} Formation)`. `hasClue`
  and the cap diversity calc still gate on `discoveryLocation` (= country), so the finer
  layers don't shift the pool.
- **Leaf-disambiguation Plan B (clue MECHANIC)** — `terminalClueActive(state, store)`
  (`engine-core`) fires when the warmest shared clade reaches the target's terminal clade
  (count-based: `warmest.descendantGenusCount ≤ terminalClade(target)`, so hints that reveal
  a monotypic node below it still count). Both stores expose a `clue` getter composing the
  trigger with `clueFor()` (`src/lib/game/clue.ts`, over `genus-attributes.json`); the clue
  (age + discovery location, both when present) surfaces in the specimen right-rail. Guess
  budget is the `DAILY_MAX_GUESSES` config constant. No pool change (reads the existing
  `playable` flag).
- **Look-and-feel IA pass (Plans 1 + 2) — DONE, merged to `main`.** Two subagent-driven plans
  under `docs/superpowers/plans/`. **Plan 1 (tree engine):** pure `layoutSpine` +
  `centerOffsetFor` (`src/lib/game/spine-layout.ts`) + `SpineTree.svelte` — the game board is a
  horizontal focus+context spine (sought lineage straight, wrong guesses splayed, viewport
  follows the frontier); Explore keeps its faithful `TreeView` cladogram. **Plan 2 (screen
  recomposition):** four regions — header (wordmark + Daily·Practice·Explore), trail-scrubber +
  budget (crumbs pan the tree via `SpineTree.panTo`), tree + right-rail `Specimen`
  (`specimenState` selector: broad `N genera` → terminal `N sibling taxa` + clue → solved),
  bottom guess-history + input + hint. `nav` store (`src/lib/nav.svelte.ts`) lifts tab state so
  the game can hand off into Explore. Daily/Practice are thin wrappers over the
  shared `GameBoard`; end state unified on the specimen (`RevealCard` + Daily inline result +
  Share button removed; `share.ts` retained, unsurfaced; `CluePanel` deleted, folded into
  `Specimen`). Explore has a back-to-game button. Basic
  responsive collapse (specimen → bottom bar < 640px). **Structural CSS only** — visual
  treatment still deferred.

- **Visual pass (look-and-feel part 2) — merged to `main`.** Palette/type/material/motion over the
  IA structure, built subagent-driven in three phases:
  - *Base (10 tasks):* global token layer (`src/lib/styles/tokens.css` — two-layer: primitives +
    semantic roles; components read the semantic layer so a region recolors in one line), Hanken
    Grotesk (`@fontsource-variable`), warm adobe ground, dark terracotta placards (trail +
    specimen), turquoise hero spine, `warmthRampColor` (`src/lib/game/warmth-ramp.ts`) ore→gem ramp
    shown only in specimen chip + guess bars, mahogany CTAs (never blue), skeuomorphic shadow-box
    (now filled by the solved state's Wikipedia photo, `SpecimenCard.svelte`), responsive collapse. Spec:
    `docs/superpowers/specs/2026-07-13-mesozooa-visual-design.md` (LOCKED tokens, §2 = source of
    truth).
  - *Refinement (4 tasks):* tree labels above-and-right + tighter branches + non-shrinking SVG
    (`min-width:max-content` — the fix for both "tree too small" and "Explore tree giant"); Explore's
    `TreeView` adopts the shared tree treatment; narrow layout = vertical stacked lineage primary +
    full-size scrolling tree + pegged specimen/input.
  - *Component gallery (`/gallery.html`):* static "testing views" for iterating on any visual state
    WITHOUT playing (states don't vanish on navigation). Driven by the real components + engine
    selectors; fixture states built by running the real engine (`src/gallery/`). **Use this for
    visual/design iteration.** Second Vite entry; ships unlinked in the build.

- **Playtest reversals (2026-07-17).** Both overturn rules written above — play beat the doctrine,
  which is what play is for. Don't "restore" them.
  - *Explore grades genus labels by playability* (`gradeByPlayable` on `SpineTree`,
    `--node-nonplayable`). Reverses "Explore surfaces no `playable` markers": you browse Explore to
    find names to guess, so Explore has to say which names the guess box will accept. Playable
    genera hold full `--ink` wherever they sit; non-playable recede to `--ink-mute`, which is the
    off-spine clade color — collision accepted, genus-vs-clade is carried by the dot.
  - *End state turns the tree into links* (`linkLabels` on `SpineTree`). The specimen's "Explore
    around [answer]" button is gone; instead every revealed node is clickable once the round ends,
    routing through the same `nav.exploreAround`. Underlined only in the game, where the affordance
    is new mid-session; Explore stays unmarked because clicking the tree IS the mode there.

- **Local images + attribution + WebP downscale (2026-07-17).**
  Two coupled sub-projects that make the app self-contained (no runtime Commons hotlink) and
  legally attributed. **Harvest:** `scripts/fetch-images.ts` (`fetch:images`) pulls Commons
  `imageinfo`+`extmetadata` per P18 image — author/license into committed `data/image-credits.json`,
  the thumbnail into gitignored repo-root `images-src/`; presence-skips (file+credit present),
  `--force` re-harvests; emits `docs/superpowers/image-credits-report.md` (completeness + license +
  payload size + heaviest outliers). **Downscale:** `scripts/process-images.ts` (`process:images`)
  width-caps to 640 (never upscaling — enforced in code, `cwebp -resize` upscales unconditionally)
  + re-encodes to WebP into gitignored `public/images/`, via a sealed `encodeWebp()` (shells to
  `cwebp`, with a `sips`→PNG fallback for CMYK JPEGs + GIFs cwebp can't decode). Payload
  **370MB→53MB**. **Bake:** `build-tree.ts` rewrites `imageUrl`→`/images/<Qid>.webp` + attaches
  `imageAuthor`/`imageLicense`/`imageLicenseUrl` (drops the field when no processed webp → `? ? ?`
  placeholder). **UI:** `SpecimenCard.svelte` renders author + linked license (`formatCredit` in
  `src/lib/image-credits.ts`; "Wikimedia Commons" fallback for the 22 author-absent images; long
  author credits CSS-clamp with full text in `title`). 1663 images credited (0 non-free). Pure
  helpers TDD-tested; scripts controller-run (macOS `sips`/`cwebp`, build-only). Specs:
  `2026-07-17-local-images-attribution-design.md` + `2026-07-17-image-downscale-webp-design.md`.

- **Offline/portable PWA (2026-07-17).** Installable, fully-offline home-screen
  app via `vite-plugin-pwa` (Workbox SW + web manifest). **Precache-everything** (app shell + all
  1668 webp + fonts, ~56MB / 1692 entries) so any daily/practice answer's photo works with no signal;
  `registerType: autoUpdate`; gallery excluded (`globIgnores` + `navigateFallbackDenylist`). Manifest:
  standalone, `start_url:"/"`, on-palette colors (`--bg-page` bg, `--turq` theme); home-screen icon =
  the `genus.svg` footprint recolored turquoise on a paper tile, generated by `scripts/make-icons.ts`
  (rsvg, output committed to `public/icons/` — build has no rsvg dependency), apple-touch-icon linked
  in `index.html`. **Also fixed a 441MB build leak:** the pristine originals moved from `public/`
  (which Vite copies to `dist/`) to a repo-root gitignored `images-src/` — `dist` 508MB→66MB. Verified
  offline locally (`npm run preview` killed, app still ran). **NOTE for deploy:** `start_url` + absolute
  `/icons/` paths assume ROOT-path serving (fine for a domain; a subpath deploy would need Vite `base`).
  Spec: `2026-07-17-offline-pwa-design.md`. **iPad install needs the HTTPS deploy (nginx follow-up).**

## What's next

- **Detailed visual/design feedback** — iterate against `/gallery.html`; visual work now on `main`.
- **Taxonomy source question — NEEDS A BRAINSTORM (biggest open item).** Research written up in
  `docs/superpowers/specs/2026-07-17-taxonomy-source-research.md` (live-probed, reproducible).
  Short version: **Wikidata's `parent taxon` is not a cladogram**, and three tracked problems are
  one problem. Archaeopteryx is a dead guess (equidistant from every bird AND every raptor at
  Paraves/329, and it's `playable`); genus synonym-merging is blocked on detection; PBDB homonyms
  mis-date genera. No better source exists to swap in: **Open Tree prunes all extinct taxa** from
  its synthetic tree, OTT taxonomy is too coarse (skips Avialae/Paraves/Maniraptora), and **PBDB
  has the same flattening in a different place** (it fixes Archaeopteryx, then puts two obvious
  birds at Maniraptora). Every aggregator flattens contested phylogeny into a single parent.
  **The lead:** PBDB independently detects **6 of our 9 deferred synonym merges**, including the
  proven-silent Dracorex and BOTH cases where the sitelinks heuristic picks the survivor backwards.
  One PBDB taxonomy fetch plausibly addresses structure + synonymy + homonyms, via the fail-closed
  `NAME_DECISIONS` pattern already in the repo (harvest 2nd opinion → diff → committed disagreement
  report → build fails while undecided → curated map). **The decision to make: is PBDB a structural
  dependency or advisory/report-only?** The doc's §"The central question" argues advisory, on the
  reframe that we're ALREADY asserting a phylogeny (Wikidata's, by default, silently, unreviewed) —
  so the deliverable may be making that assertion deliberate rather than fixing a bug. Cheap first
  step, no tree changes: one fetch + one diff to measure how many structural disagreements actually
  exist. Don't start coding this; brainstorm first.
- **Release track (2026-07-17 decomposition).** Goal: public static deploy + an offline copy on an
  iPad for "dino camp." Done: local images + attribution, offline/portable PWA, and the HTTPS
  deploy (LIVE at `https://mesozooa.latrani.net/`, nginx + certbot on a personal cloud box;
  redeploy = rebuild, then rsync the `dist/` contents to the server; confirmed installed and
  running offline on the iPad). Still open: (a) **`npm audit`** dev-only vuln cleanup (none ship,
  not blocking); (b) **a11y keyboard nav** for the SVG tree nodes (deferred-findings §B); (c)
  **data-quality: taxonomy/Archaeopteryx + PBDB homonyms** (the item above, comfortably post-release).
- **Still deferred:** the polish nits in `docs/superpowers/deferred-findings.md` bucket A (tree
  scroll-centering, deep-lineage trail height, etc.).
- **NOT happening:** a dark theme. It fights the warm adobe/terracotta material — sun-baked clay
  has no night mode. The two-layer token split is a semantics preference, NOT theming groundwork;
  don't cite it as a reason to build one.

## Working agreements

- **Function first; defer look-and-feel.** Build structurally-correct, visually-minimal UI;
  aesthetics are a dedicated later pass with detailed user direction. Don't polish piecemeal.
- **IA/layout before visuals; the current pass is structural-CSS-only.** The user is a UX
  designer: settle information architecture and layout (in ASCII wireframes, not rendered
  mockups) before any color/type — and don't front-load or park visual decisions in structural
  specs. The look-and-feel work in flight builds correct structure with only the CSS the layout
  needs (flex/grid, scroll containers, geometry); palette, type, hairlines, and motion are the
  separate visual phase.
- **`verbatimModuleSyntax` is ON.** Type-only imports MUST use `import type`. Vitest does
  NOT catch violations — run `npx tsc --noEmit` (and `npx svelte-check` for `.svelte`) before
  committing. Pure logic is TDD-tested; Svelte components validated by build + running.
- **Deferred review findings** are tracked in `docs/superpowers/deferred-findings.md` — add
  newly-deferred items there (the SDD `progress.md` ledger is scratch).
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
