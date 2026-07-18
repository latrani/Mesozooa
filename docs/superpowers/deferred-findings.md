# Mesozooa — Deferred Findings Backlog

A durable record of review findings and design items **intentionally deferred** rather than
fixed at the time. The per-plan SDD `progress.md` ledgers are scratch (overwritten each plan),
so this file is the source of truth for deferred work.

**Maintenance:** whenever a code review defers a Minor finding (or a design problem is parked
for later), add it here with its file location, why it was deferred, and its bucket. When an
item is resolved, move it to "Resolved" with the fixing commit. Keep it honest — this is the
backlog, not a trophy case.

Last updated: 2026-07-12 (after foundation, Plan 2 game slice, Plan 3 explorer, Plan 2b
game completion, and the 2b code-quality fast-follows — all merged to `main`).

---

## D. Data / build-pipeline (needs a fetch re-run)

Batch these with the next data-regeneration pass (`npm run fetch:wikidata` → `fetch:pbdb`
→ `build:data`).

- **Monotypy: two definitions coincide only by data luck (re-verify at next harvest)** — the
  monotypy fix (`cc8d59c`) uses two different "monotypic" tests on purpose: the Explore layout
  straightens on **structural single-child** (`store.children(id).length === 1`,
  `spine-layout.ts`), while skip-through hints walk on **strict genus-count narrowing**
  (`descendantGenusCount <`, `nextHintRun` in `engine-core.ts`). They agree — a straightened run
  is exactly the run a hint skips — ONLY because in the current `tree.json` all 108 single-child
  nodes have a count equal to their child, and no multi-child node has a zero-genus child
  (verified against committed data at merge). A future harvest that introduced a **multi-child
  clade with a zero-genus child** would break the equivalence: layout would keep it splayed
  (2+ children) while a hint would skip it (child adds no genera), so the tree picture and the
  hint reveal would disagree. Not a bug today; re-run the check after any `build:data` (query
  `tree.json` for internal nodes with a zero-`descendantGenusCount` child). Fix if it ever fires:
  unify both surfaces on the count test.

- **Paraves is flattened: Eumaniraptora/Avialae are siblings, and Archaeopteryx is a dead guess**
  — Wikidata's single `parent taxon` chain is filled in by different editors against different
  phylogenies, and Paraves is where that shows worst. It has 9 direct children including
  **Eumaniraptora (7 genera)** alongside **Avialae (222)**, **Dromaeosauridae (53)** and
  **Troodontidae (38)** — but Eumaniraptora *is* Avialae + Deinonychosauria in standard usage, so
  those three belong INSIDE it, not beside it. (`Deinonychosauria` is likewise a 1-genus rump.)
  Archaeopteryx hangs off the Eumaniraptora rump via Archaeopterygiformes → Archaeopterygidae,
  i.e. outside Avialae entirely — a real but minority position (some 2011 analyses recover it as a
  deinonychosaur), not the mainstream basal-avialan view.
  **Game impact:** MRCA(Archaeopteryx, Ichthyornis) = MRCA(Archaeopteryx, Jeholornis) =
  MRCA(Archaeopteryx, Velociraptor) = **Paraves, 329 genera**. The most famous Mesozoic bird is
  equidistant from every bird AND every raptor, and it's `playable`, so a very common guess returns
  near-zero information. Same root cause as the Oviraptor parent-skip noted in CLAUDE.md.
  Fix is a design call, not a patch: either curate parent overrides for the Paraves backbone (cf.
  `NAME_DECISIONS`), or stop trusting `parent taxon` for the bird stem and pull structure from a
  phylogeny source. Worth a brainstorm — it's the same "Wikidata's chain is not a cladogram"
  problem the synonym-merge work keeps hitting.
  **→ Researched 2026-07-17: `specs/2026-07-17-taxonomy-source-research.md`.** No drop-in source
  exists (Open Tree prunes ALL extinct taxa; PBDB has the same flattening one node over). Same root
  cause as **Genus synonym-merging** and **PBDB homonym contamination** below — treat the three as
  one brainstorm, not three fixes.

- **PBDB homonym contamination silently mis-dates genera** — PBDB is matched by bare genus name
  (`pbdbByName[n.name]` in `build-tree.ts`), so a dinosaur genus sharing a name with a
  non-dinosaur taxon inherits the WRONG occurrences, and the clue then states a confident lie.
  Surfaced by the Mesozoic gate (`e5c74eb`+), which cut two obvious cases as a side effect:
  **Cardiodon** (Middle Jurassic sauropod → PBDB said Serravallian–Piacenzian, 13.82–2.58 Ma) and
  **Alocodon** (Middle Jurassic ornithischian, Portugal → PBDB said Ypresian–Lutetian, 56–45.9 Ma).
  Both are ~150 Myr off. The gate only catches collisions whose homonym is **Cenozoic**; a
  collision with another *Mesozoic* taxon produces a plausible-but-wrong age/location and passes
  every check we have. 2 detected in a sample of 13 is a poor ratio, so more are likely hiding
  inside the playable pool. Fix would constrain the PBDB query by taxon (`base_name=Dinosauria`)
  or cross-check returned occurrences against the expected clade, rather than trusting the name.

- **Per-image attribution (REQUIRED before public release) — RESOLVED** (branch
  `local-images-attribution`, 2026-07-17). `scripts/fetch-images.ts` harvests Commons `imageinfo` +
  `extmetadata` (Artist/LicenseShortName/LicenseUrl) per image; `sanitizeArtist`/`formatCredit`
  (`src/lib/image-credits.ts`) sanitize + format; `build-tree.ts` bakes `imageAuthor`/`imageLicense`/
  `imageLicenseUrl` + local `/images/<Qid>.webp` paths into `tree.json`; `SpecimenCard.svelte` renders
  the credit (author + linked license, "Wikimedia Commons" fallback when author absent). 1663 images
  credited (0 non-free, 22 author-absent-on-Commons). Images ALSO localized (no runtime Commons
  hotlink: 0 `wikimedia` in any `imageUrl`) and downscaled to WebP (370MB→53MB, sub-project A.5,
  `scripts/process-images.ts`). See specs `2026-07-17-local-images-attribution-design.md` +
  `2026-07-17-image-downscale-webp-design.md`.

### Release hygiene

- **`npm audit`: 5 dev-only vulns in the vite/vitest tree (defer + upgrade, 2026-07-17).** `npm
  install` reports 3 moderate / 1 high / 1 critical, ALL in dev tooling — `vite`/`vitest` (devDeps)
  and their transitives (`esbuild`, `vite-node`, `@vitest/mocker`). **None are in `dependencies`;
  none ship.** Every advisory is a dev-server / test-UI vector (esbuild dev-server request leak; vite
  path-traversal / `server.fs.deny` bypass / launch-editor NTLM, one Windows-only; vitest UI
  arbitrary-file-read) — the deployed site is static `dist/` with no server, so a player can't be hit.
  NOT a release blocker. Fix = its own small task AFTER the PWA branch: bump vite/vitest (likely a
  `vitest@4` major), re-run the 239-test suite, confirm green. Do NOT `npm audit fix --force`
  mid-feature (it force-jumps the major and could break tests).

- **PWA: SW-registration injected into the dev-only `gallery.html` too (cosmetic, 2026-07-17).**
  `vite-plugin-pwa` auto-injects the `registerSW.js` script + manifest link into every build entry, so
  `dist/gallery.html` carries them despite being a dev-only, unlinked page. Harmless: the gallery is
  NOT precached (verified: 0 gallery entries in the SW precache list), and opening it would just
  register the app's SW. The app (`index.html`) is correct. User chose ship-as-is. Fix if ever tidying:
  filter the register-sw injection to the app entry only.

- **Spine planar-nesting test passes trivially after the A-Z rework (2026-07-17).** In
  `spine-layout.test.ts` "off-spine nesting is planar", the A-Z split now routes the before/after
  blocks to DIFFERENT sides, so the cross-parent deepest-innermost nesting path (still implemented in
  `layoutSpine` via `deepestFirst`) is no longer stress-tested — each side has a single attach-depth,
  so the assertion passes without exercising the crossing scenario. The code is correct (reviewer
  hand-verified), but the guard is gone. Add a fixture where two DIFFERENT parents fan same-side
  same-column blocks to re-exercise it.

### New (deferred from the local-images/downscale work — all Minor, non-blocking)

- **`process-images.ts`: `sips` width-read failure → un-capped encode.** If `sips -g pixelWidth` output
  doesn't match the regex, `srcWidth=0`, so `0 > MAX_WIDTH` is false and the file encodes at full
  resolution (no `-resize`). Fails SAFE (never upscales), doesn't fire on a clean macOS run — but a
  genuinely oversized image whose width couldn't be read would ship un-capped. Fix: treat a failed
  width read as an error (or skip), don't silently fall through to full-res.
- **`process-images.ts`: `dirBytes` counts dotfiles.** `dirBytes(SRC_DIR)` sums all entries (incl.
  `.DS_Store`) while the processing loop filters dotfiles, so the reported "originals size"/ratio is
  slightly inflated. Cosmetic (report-only). Fix: filter dotfiles in `dirBytes`.
- **`fetch-images.ts`: final `writeFile(credits)` outside try/catch.** A disk-write throw on the final
  flush could lose ≤24 credit entries since the last periodic (every-25) flush; a re-run's
  presence-skip recovers them anyway. Fix: wrap the final write (or flush-then-report).

## A. Look-and-feel pass (cosmetic / visual)

Components ship intentionally minimal (semantic class hooks, no styling). The dedicated
look-and-feel pass owns all of this — do NOT fix piecemeal. See `docs/superpowers/specs/`
design notes and the `aesthetics-defer-until-functional` memory.

- Warmth/emphasis **color scale** — `TreeView`/`GuessList` expose class hooks only; no color yet.
- **Tab, budget, hint-button, share, daily-result styling** — `App.svelte`, `Daily.svelte`.
- **Hint rows visually indistinct from guesses** — `GuessList.svelte` renders `kind:"hint"` rows
  the same as guesses; mark/style them.
- **Deep/wide subtrees → tall-or-wide auto-fit SVG** — `TreeView` auto-fits; interactive
  **pan/zoom** is the intended fix once large subtrees are shown (explorer especially).
- **Non-playable badge / active-tab styling** — `NodeDetail.svelte`, `App.svelte`.
- **Specimen bottom-bar `align-items: baseline` jitter** — on narrow screens the compact specimen
  bar aligns mixed font sizes on the baseline (`Specimen.svelte`); revisit alongside type sizing in
  the visual pass (spec-mandated structural CSS for now).
- **Empty-state tree column doesn't flex-fill** — `GameBoard.svelte`'s `.middle :global(.tree-scroll)`
  flex rule doesn't apply before the first guess (SpineTree renders `.tree-empty`, not `.tree-scroll`),
  so the empty prompt sits beside the 12rem specimen instead of filling. Self-corrects on first guess.
  Fix later: flex the empty branch or wrap it in `.tree-scroll`.

## B. Accessibility (functional-ish; lands with the interaction/L&F pass)

- **Clickable SVG tree nodes have no keyboard path** — `TreeView.svelte` adds `onclick` on the
  `<g>` with `a11y_click_events_have_key_events` suppressed. Make tree navigation keyboard-reachable
  before any real release.

## C. Code-quality / negligible — intentionally left as-is (documented)

Judged not worth changing; recorded so they aren't "rediscovered" as if new.

- `assemble.ts` BFS uses `queue.shift()` → O(n²). Build-time only, ~2k nodes. Fine.
- `fetch-wikidata.ts` builds a redundant intermediate Map. Harmless, build-time.
- `fetch-wikidata.ts` `rankId` assumes ≤1 `P105` (rank) statement per taxon; multiples would dup
  rows (benign — `byId`/`assembleTree` dedup by id).
- `build-tree.ts` `dataVersion` uses UTC `toISOString()` (can be a day ahead of local). Cosmetic
  build stamp. (The *daily* date was fixed to local in Plan 2b; this build stamp was not.)
- `engine-core.ts` `store.getNode(id)!` non-null assertions — safe by `TreeStore` invariants.
- **~784 KB JS bundle** — `tree.json` is baked in by design (no runtime Wikidata). Expected; the
  Vite chunk-size warning is benign.
- `warmestSharedNodeId` ranks by raw `descendantGenusCount`, bypassing the `WarmthProvider` —
  equivalent for the default `CountWarmth`. Unify only if a non-count provider is ever added.
- Unreachable defensive branch in `applyHint` (`nextHintNode` null when `w === target`) is untested;
  reachable only after a win, which `status !== "playing"` already short-circuits.
- `scripts/pbdb.ts` `batch.includes(g)` is O(n²) per batch (BATCH=80, network-bound — negligible);
  linear retry backoff.
- `pbdbAges` first-record-wins (`!out[g]`) is order-dependent under a cross-kingdom name **homonym**
  in the same batch; committed `raw-pbdb.json` freezes the result (deterministic build). Low
  incidence for dino names.
- **Wikidata↔PBDB name-match homonym risk** — attributes are keyed by genus `name`; a dinosaur
  genus whose name collides with a non-dino PBDB taxon could inherit its age/location. No dino-scope
  guard on the PBDB side. Low probability; accepted.
- **PBDB country code → name mapping happens at fetch time** (`modalLocation` in the fetch), so a
  `COUNTRY_NAMES` change needs a `fetch:pbdb` re-run to land. Future: store the raw `cc` and map at
  build time so the map can be tuned without re-fetching.
- `spine-layout.test.ts` has no assertion for **3+ off-spine blocks stacked on the same side** — the
  `aboveCursor`/`belowCursor` accumulation path is hand-verified correct but not test-locked (the
  fixture doesn't make a same-side 3-child case convenient). Add when Plan 2 touches fixtures.

## D. Design problems (each needs its own brainstorm, not a patch)

- **Leaf-disambiguation** — DESIGN DONE (see `docs/superpowers/specs/2026-07-12-mesozooa-leaf-disambiguation-design.md`);
  Plan A (data: notability prune to 674 + PBDB clue) merged. **Plan B (the clue mechanic) still to
  build.** Plan B note: the clue must fire/group by `terminalClade(target)` — the same grouping the
  prune uses — so the sibling set the player disambiguates is genuinely ≤ CAP (7).
- **Genus synonym-merging** — the name-disagreement work (`a3179a7`) surfaced ~9 genus→genus
  synonym-sinks (Wikipedia redirects one genus's article to another: Teyuwasu→Staurikosaurus,
  Othnielosaurus→Nanosaurus, Dollodon→Mantellisaurus, Hanssuesia→Stegoceras, Liassaurus→Sarcosaurus,
  Camptodontornis→Longipteryx, Sangonghesaurus→Tianchisaurus, and — the two best-known —
  **Stygimoloch→Pachycephalosaurus** (Q131161, verified live: enwiki `Stygimoloch` redirects to
  `Pachycephalosaurus`; currently mislabeled `Pachycephalosaurus spinifer`) and
  **Cathetosaurus→Camarasaurus** (Q16975532, enwiki `Cathetosaurus` redirects to `Camarasaurus
  lewisi`; currently labeled with that binomial)). These
  are genuine MERGES (drop the junior node, reparent its children onto the senior), not label fixes —
  so they were deferred: the junior currently keeps its own name (the two well-known ones are the
  only genus nodes whose display name is a binomial — grep `\s` in the resolved names to find them). Blocker: `dedupeRaws` picks the
  merge survivor by **sitelinks**, which merges 2 of the 8 BACKWARDS (Teyuwasu sl=16 would beat
  Staurikosaurus sl=0; Othnielosaurus sl=17 beats Nanosaurus sl=16). Needs a **forced-merge-target**
  mechanism (the decision names the survivor Q-id, overriding sitelinks) + per-merge verification of
  survivor + child reparenting. The 77-candidate redirect signal is mostly benign clade-granularity
  (`Neotheropoda→Theropoda`) and must NOT be swept in.
  **Detection is the deeper problem — the ~9 is a FLOOR, not the population.** The redirect harvest
  is advisory and sparse: only **39 of 2073 genera** carry any captured `redirectTarget`, so a sink
  is invisible unless (a) its redirect happened to be captured OR (b) its en/enwiki/P225 names
  disagree enough to trip the conflict gate. A sink that keeps its own name AND whose redirect was
  missed is fully silent. Proven case: **Dracorex→Pachycephalosaurus** (Q134203 — the third
  Pachycephalosaurus growth-stage alongside Stygimoloch; enwiki `Dracorex` redirects to
  `Pachycephalosaurus`, verified live) has NO captured `redirectTarget` and all three names agree on
  "Dracorex", so nothing flagged it — it sits in the tree correctly labeled but taxonomically
  should merge. And there's **no cheap structural detector**: Wikidata parents these sinks to a
  shared CLADE (Dracorex/Stygimoloch/Pachycephalosaurus are all siblings under Pachycephalosauria
  Q131376), never genus-under-genus, so a rank-based sweep finds zero. So the merge spec cannot just
  consume this list — it must FIRST run a complete enwiki-redirect resolution over every genus to
  discover the real sink population, THEN apply forced-merge-targets. Own spec.
  **→ 2026-07-17: PBDB may solve BOTH blockers — see `specs/2026-07-17-taxonomy-source-research.md`.**
  Tracking taxonomic opinions IS PBDB's core competency (`taxon_status` + `accepted_name`), and probed
  live against this exact list it independently detects **6 of the 9**: Dracorex→Pachycephalosaurus
  (the proven-silent case — no captured redirect, all names agree, nothing flagged it), Stygimoloch,
  Cathetosaurus, Dollodon, and **both cases sitelinks merges BACKWARDS** (Teyuwasu→Staurikosaurus,
  Othnielosaurus→Nanosaurus), naming the senior from published opinion rather than popularity. So
  detection may not need the full redirect-resolution prerequisite, and the survivor problem may just
  dissolve. The 3 misses (Hanssuesia, Camptodontornis, Sangonghesaurus — PBDB says *valid*, enwiki
  redirects) are genuine source disagreements = exactly what the fail-closed decisions map is for.
- **`NAME_DECISIONS` collision guard** — a decision whose `name` equals a *different* extant node's
  name silently triggers a dedupe MERGE (resolveName runs before case-grouping). Caught once at
  final review (a draft had renamed Hesperornithiformes→Hesperornithes and Herrerasauridae→
  Herrerasauria, each colliding with a real sibling node and collapsing a clade rung; reverted before
  merge). The build gate detects *field* disagreements but NOT decision→node collisions. Add a
  build-time check: for each `NAME_DECISIONS[id].name`, if another node natively carries that name,
  FAIL with "decision would merge id into <other>". Pairs with the forced-merge-target mechanism above.
- **Explorer deep-link / URL state** (e.g. `?focus=Q…`) — deferred.
- **Historical-daily reproducibility** — a data rebuild can shift which genus a *past* date maps to
  (simple current-pool indexing was chosen over snapshot-per-`dataVersion`). Accepted for v1.
- **Streak / stats tracking** — deferred (only per-date daily state is persisted).

---

## Resolved (kept for reference — don't re-litigate)

- **highlightId not reset on new round** — fixed at Plan 2 finish (`2aac6ae`).
- **Daily UTC-drift** — `todayString` uses local date components (Plan 2b).
- **Hint-reveals-target soft-lock** — dup guard scoped to `kind:"guess"` (`5b27e8d`, with test).
- **Monotypic hint-walk stall** — `nextHintNode` walks from the deepest revealed lineage node
  (`ae7d43e`, with test).
- **Plan 2b code-quality fast-follows** (`fe5ae96`): share/budget cap derived from `maxGuesses`;
  strict daily deserialize (guess-row shape + `mode`); stale localStorage keys pruned on load;
  `canHint` reflects real hint availability (`nextHintNode`).
- **mrca unknown-id contract** — the game validates guesses against the playable pool
  (`gameEngine`/`isPlayable`), so `mrca` is never fed an unknown id in play.
- **PBDB locations at 14%** — `pbdbLocations` queried `taxon_name` (misses species-level
  occurrences); switched to `base_name` → 72% (`3f457d3`).
- **Raw country codes in clues** — PBDB emits `UK` (not ISO `GB`); expanded `COUNTRY_NAMES` to cover
  all observed codes + rebuilt → 0 raw codes (`3238c81`).
- **Lowercase clade label "bird" (Aves) + "dinosaur" (Dinosauria)** — the name-disagreement system
  (`a3179a7`) made these explicit `NAME_DECISIONS` (vernacular→scientific), so the tree now carries
  `Aves`/`Dinosauria` directly. 0 lowercase-initial names in the rebuilt tree; the `displayName`
  "dinosaur"→"Dinosauria" render-time hack is now redundant (kept, harmless). Supersedes the earlier
  "extend displayName to title-case" proposal.
- **Label-less nodes rendering as bare Q-ids (incl. Troodon)** — Wikidata items with no `en` label
  fell back to the Q-id placeholder. Fixed by harvesting P225 (taxon name) + enwiki title and
  resolving names from the best available source (`a3179a7`); 0 bare Q-id names in the rebuilt tree.
- **Game tree genus-counts + branch hover-tip** — whole-tree `descendantGenusCount` beside game
  clade labels was a confusing non-playable signal; removed via a `showCounts` prop (Explore keeps
  them). Guessed-at-branch hover tooltip removed entirely (`16808b6`).
- **Parenthetical subgenus names drop the age (Poekilopleuron)** — PBDB files some genera under a
  `Genus (Subgenus)` name (e.g. `Megalosaurus (Poekilopleuron)`, Megalosaurus being the classic
  wastebasket genus). `genusOf()` in `scripts/pbdb.ts` splits on the first space → keys the age to
  the outer genus, so the subgenus never receives its (perfectly good) interval label and gets
  pruned for a missing age. Deferred as a side-issue during the age-label enrichment work; fix would
  teach `genusOf` to handle the parenthetical form. Only known casualty so far: Poekilopleuron.
