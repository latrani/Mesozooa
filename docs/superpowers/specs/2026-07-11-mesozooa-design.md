# Mesozooa — Design Spec

*A dinosaurs-only cladistics guessing game, plus a walkable dinosaur cladogram.*
Date: 2026-07-11

## 1. Concept

Mesozooa is a [Metazooa](https://metazooa.com)-style deduction game restricted to
Mesozoic dinosaur **genera**. Each turn the player guesses a genus; the game reports
the **most-specific clade the guess shares with the hidden target** and how "warm"
that is. The player triangulates up and down the dinosaur tree of life until they
name the mystery dinosaur.

The same tree data powers a second, co-equal surface: a **reference explorer** — a
walkable dinosaur cladogram (search, expand/collapse, group sizes, images, Wikipedia
links). The game needs the tree, so the reference tool comes almost for free and is a
first-class feature, not a game mode.

Audience: paleo-nerds. Tone: generous with obscurity, honest about cladistics.

## 2. Design pillars

1. **One tree, one source of truth.** Metazooa confuses players because it maintains
   *two* representations — a fixed Linnaean rank ladder (left infobox) and the actual
   named-clade tree (right) — and ranks are a lossy projection of the tree, so the two
   drift apart. Mesozooa keeps **only the tree**. Every piece of feedback is a pointer
   to a node in that tree, never a projection onto a parallel ladder.
2. **The warmth number is the remaining search space.** Warmth = the number of genera
   inside the shared clade. That number literally *is* how much of the tree is still in
   play, so it is honest, monotonic, and strategically meaningful. It shrinks toward 1
   (the answer). Warmth is computed by a swappable `WarmthProvider` so we can flip to a
   normalized 0–100% if playtesting shows the raw count gives too much away.
3. **Good cladistics only (for play).** The playable pool is filtered to genera with a
   well-resolved phylogenetic position. Poorly-resolved *nomina dubia* (single teeth
   dumped high in the tree) make mushy warmth signals and bad answers, so they are
   excluded from play — but remain visible in the reference explorer for completeness.

## 3. Data

### 3.1 Source

**Wikidata**, harvested at build time via SPARQL and baked into static JSON. Wikidata
was chosen because every ancestor node is a **named clade** (required by the
named-clade ladder), and it supplies labels, images (P18), and Wikipedia sitelinks for
free. It is queried **only at build time**; the shipped app has no backend and makes no
runtime network calls for game data.

Root: `Dinosauria` (Q430). Descendants gathered via `parent taxon` (P171) chains.

**Why not the alternatives.** PBDB has validity flags but bundles in *parataxonomy* —
fossil **egg** genera (oogenera like *Polyclonoolithus*) and **footprint** genera
(ichnogenera under Grallatoridae) — which are not animals to guess; Wikidata's
Dinosauria tree already excludes these. Open Tree of Life has many **unnamed** MRCA
internal nodes, which fights the named-clade ladder.

### 3.2 Scope filter — "Mesozoic"

Prune the modern-bird crown: exclude the subtree under **Neornithes (Q19163)**.
Mesozoic avialans (*Archaeopteryx* and kin, ~243 genera) are kept — they are
cladistically dinosaurs and small enough not to swallow the game. (Excluding all of
Aves/Q5113 is the fallback if Neornithes coverage proves messy.)

### 3.3 The two pools

Measured counts (Wikidata, 2026-07-11):

| Set | Count |
|---|---|
| Genera under Dinosauria incl. modern birds | 5,837 |
| Modern-bird crown (Neornithes) | 3,763 |
| **Reference pool** = Mesozoic genera (Neornithes pruned) | **~2,074** |
| Non-avian, resolved into a named family | 1,152 |
| **Playable pool** = non-avian, family + Wikipedia article | **~828** |

- **Reference pool (~2,074):** the entire Mesozoic tree. Everything is browsable in the
  reference explorer, poorly-resolved tail included.
- **Playable pool (~828):** the resolution-filtered subset. This is the set of allowed
  **guesses** *and* the set of possible **answers** (daily + practice). Autocomplete
  offers only this set.

### 3.4 Resolution filter (the knob)

**Principle:** a genus is *playable* only if its placement is specific enough that
warmth is meaningful.

- **v1 concrete rule:** the genus resolves into a named **family** (has an ancestor of
  rank family, Q35409) **and** has an English Wikipedia article. Yields ~828. The
  Wikipedia requirement doubles as attestation and guarantees every playable genus and
  every reveal screen has a working link.
- **Refinement (implement if the family rule drops good unranked-clade genera):**
  replace "has a family ancestor" with a **tree-based** metric computed after the tree
  is assembled — *the genus's smallest containing clade has ≤ N descendant genera* (or
  *depth ≥ K from root*). This captures well-placed genera that sit in unranked clades
  with no Linnaean family. The threshold is tuned during the build against the observed
  distribution, targeting ~800.

The exact final number is a build-time parameter; ~800 is the target.

### 3.5 Build pipeline (re-runnable script)

1. SPARQL: fetch all taxa with a P171 path to Dinosauria. Per taxon pull: QID, label,
   taxon name (P225), rank (P105), parent taxon (P171), image (P18), enwiki sitelink,
   and temporal-range fields where present.
2. Prune the Neornithes subtree.
3. Assemble a single rooted tree; drop taxa not on any root→genus path.
4. Compute per node: `descendantGenusCount` (the warmth number) and `depth`.
5. Compute the `playable` flag per genus via the §3.4 rule.
6. Emit committed artifacts:
   - `tree.json` — nodes `{id, name, rank, parentId, childrenIds, descendantGenusCount,
     depth, playable}`; genera additionally `{imageUrl, wikipediaUrl}`.
   - `genera-index.json` — the playable set for autocomplete `{id, name}` (+ a small
     synonym/alias map if cheap, for typo tolerance).
7. Data-quality report printed at build: pool sizes, orphans, genera with no image, etc.

**Data freshness:** Wikidata changes; the build is re-runnable to refresh. Bump a
`dataVersion` in the JSON; the daily-answer scheme (§5.1) must stay stable across
refreshes for a given date (see risks).

## 4. Architecture

Static SPA. Svelte + TypeScript + Vite. No backend.

Shared engine (framework-agnostic TS modules), consumed by both surfaces:

- **`treeStore`** — loads `tree.json`, indexes nodes by id and by name, exposes
  `getNode`, `children`, `pathToRoot`, `mrca(a, b)`.
- **`WarmthProvider`** — interface `warmth(sharedNode) → {value, display, fraction}`.
  Default `CountWarmth` (group size); alternate `PercentWarmth` (normalized). Selected
  by one config constant.
- **`search`** — autocomplete over the playable genera (prefix + fuzzy), the only input
  method for guesses.
- **`TreeView` component** — renders a subtree, highlights a set of nodes, supports
  reveal-as-you-go (game) and full expand/collapse (reference). Consumes node objects
  directly, so highlights can never disagree with feedback rows.

Game-only:

- **`gameEngine`** — holds `{target, guesses[], hintsUsed, status}`; `guess(genusId)`
  computes `mrca(guess, target)` and appends a result row referencing that node.
- **`dailyAnswer`** — deterministic `hash(dateString) → index into playable pool`.
- **UI:** search box, guess-rows list, warmest-trail breadcrumb, TreeView, reveal card,
  shareable result.

Reference-only:

- **`explorerView`** — full walkable tree, breadcrumb path, genus detail pane
  (image + Wikipedia link + group sizes). Reuses `TreeView`, `search`, `treeStore`.

### Feedback object (the anti-desync core)

A guess produces `mrca(guess, target)` — a single node object carrying `{name,
descendantGenusCount, pathToRoot}`. The guess **row**, the warmest-**trail** breadcrumb,
and the **tree** highlight all reference this same object. There is no separate ladder to
fall out of sync.

## 5. Game rules & UX

### 5.1 Modes

- **Daily:** `hash(YYYY-MM-DD)` seeds a deterministic pick from the playable pool — same
  dino for everyone, no server. Shareable emoji-grid result. One daily per date.
- **Practice:** unlimited; new random playable genus each round.

### 5.2 Turn loop

- Type a guess → autocomplete restricted to playable genera → submit.
- Result row shows the shared clade **name** + warmth (**group count** + a warmth bar;
  color cold→hot). Rows sorted or markable by warmth; best guess pinned.
- **Warmest trail** (left): the real root→best-shared-clade path, each crumb annotated
  with its shrinking group size. **Tree** (right): reveal-as-you-go — only branches the
  player's guesses have touched appear; the warmest path is highlighted. Same node
  objects both sides.
- Click a guess row → highlights its node on the tree. Hover a node → shows which
  guesses landed there.

### 5.3 Budget & hints

- **20 guesses.**
- **Hints:** after some misses, spend a hint to reveal a clade the target belongs to
  (walks one step down the target's true path from the current warmest shared node).

### 5.4 End states

- **Win/lose → reveal card:** target name, image, Wikipedia link, guess count, and the
  full path from Dinosauria to the target on the tree.
- Daily result renders as a shareable emoji grid (warmth per guess).

## 6. Reference explorer

- Walkable full Mesozoic cladogram (~2,074 genera): expand/collapse clades, search to
  jump, breadcrumb path, group sizes on every node.
- Genus pages: image, Wikipedia link, lineage. Poorly-resolved genera (non-playable) are
  shown but visibly marked as such.
- Shares `TreeView`, `search`, and `treeStore` with the game.

## 7. Out of scope (v1 / YAGNI)

- Accounts, servers, multiplayer, leaderboards, stats persistence beyond `localStorage`.
- Species-level play (genus is the unit).
- Egg/footprint parataxonomy.
- Live Wikidata queries at runtime.
- Custom-authored cladograms; we trust Wikidata's consensus placement.

## 8. Risks & open items

- **Wikidata taxonomic lag / errors:** consensus but crowd-sourced. Mitigation: build-time
  data-quality report; the resolution filter drops the worst-placed genera anyway.
- **Data refresh vs. stable daily:** re-running the build can change the playable pool and
  thus which genus a past date maps to. Mitigation: seed the daily off a **frozen ordered
  list** snapshotted per `dataVersion`, or index into a stable sorted-by-QID pool so
  membership changes perturb minimally. Finalize during implementation.
- **Warmth legibility:** raw group counts may over-reveal; `PercentWarmth` is the
  ready fallback (pillar 2).
- **Family filter strictness:** may drop well-resolved unranked-clade genera; the
  tree-based refinement (§3.4) is the mitigation, tuned to ~800.
- **Image licensing:** Wikidata P18 points at Commons; confirm hotlink/attribution
  approach for reveal/reference screens.
