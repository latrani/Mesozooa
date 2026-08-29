# Difficulty modes (#77)

## Problem

Three tiers. Medium is what ships today. Hard ("Mesozoic Mind") opens the pool to every
genus with good data. Easy is a curated ~100 famous dinosaurs.

The trap is that a tier looks like a filter on `playableGenera()` and isn't. Every ruler the
game feeds back with — warmth, the terminal clade, hint costs, "N genera in this clade" — is
computed against the **full** 1,817-genus tree. Shrink the pool without moving the rulers and
Easy doesn't get easier, it breaks.

## The finding: the rulers have to be pool-relative

Warmth ramps on `branchDepth` toward the target's terminal clade, and the paleo clue only
unlocks when the warmest MRCA reaches that clade (`leafHintActive`). Measured over a naive
top-100-by-sitelinks set, against today's engine:

| pool | n | targets whose terminal clade **no legal guess can reach** |
|---|---|---|
| Medium (status quo) | 734 | 2% |
| Hard (no cap) | 1,170 | 1% |
| Easy top-100 | 100 | **39%** |

For 39 of 100 Easy targets the ramp stalls partway up and the clue never becomes available —
phase 2 of the warmth model simply never starts. Not a feel problem; a dead end. Making the
rulers pool-relative drops all three tiers to 0% by construction.

## The lens model — one tree, three rulers

This does **not** need a second tree, and must not get one (CLAUDE.md: one tree, one source of
truth).

Restricting a tree to a subset of its leaves yields clades that are exactly the real clades
intersected with the subset. So every node in the "Easy tree" *is* a real node — specifically,
the real MRCA of its surviving members. Nothing is invented and nothing is falsified; a
collapsed run is just `mrca()`, which the engine already computes. A tier is a **lens on the
one tree**, not a parallel structure.

**Becomes a function of the active pool** (three derived quantities, recomputed per tier):

- `descendantGenusCount` → count of *pool members* below a node.
- `branchDepth` → increments only where the **pool** count narrows.
- `terminalClade` → lowest ancestor holding ≥2 pool members.

Everything downstream then works unchanged, because all of it reads those three: the warmth
ramp and its denominator, `warmestSharedNodeId`, `leafHintActive`, `nextHintRun`, `hintCost`,
the degenerate-target gate.

**Stays global:** node identity, names, parentage, `mrca()`, images, clues, and Explore (the
reference explorer keeps the whole 1,813-genus pool and true counts).

**Where it lives.** Bake a tier ordinal per genus in `tree.json`; derive the three quantities
at store construction. One post-order pass over 2,200 nodes is sub-millisecond, so the active
lens can be rebuilt on a tier switch rather than shipping three copies of every count.
`TreeStore` grows a tier parameter; `treeData.ts` exposes the lens for the active tier.

## Tier definitions

One pool per tier. No guessable/answerable split — what you can guess is what can be the
answer, in every tier.

| tier | pool | rule |
|---|---|---|
| Easy | ~100 | curated list (below) |
| Medium | 734 | status quo: clue + image + non-degenerate + adaptive cap (3–7) + pins |
| Hard | 1,170 | clue + image + non-degenerate. **No notability cap.** |

The cap is what makes Medium feel curated, so dropping it *is* the difficulty step: median
terminal-clade size goes 3 (Easy) → 5 (Medium) → 14 (Hard), and the share of targets whose
endgame has more than 10 candidates goes 37% → 59%. Hard is harder in the endgame, where it
should be, not just longer in the autocomplete.

**Nesting invariant: Easy ⊆ Medium ⊆ Hard.** One ordinal per genus, monotone, so
`inTier(id, tier)` is a comparison.

- Easy ⊆ Medium is *enforced*, not assumed: every Easy member is registered as a pin
  (`ALWAYS_PLAYABLE`'s existing machinery), so a famous genus can't be cap-trimmed out from
  under the Easy set.
- Medium ⊆ Hard needs care: Medium's pins bypass the clue/image gates, so a pinned genus could
  otherwise miss Hard's. Define Hard as `Medium ∪ {every genus with good data}` rather than as
  a fresh predicate. (Both current pins, Tawa and Suskityrannus, clear Hard's gates anyway —
  but define it so a future pin can't break the invariant silently.)

## Curation: the Easy set is about *clusters*, not fame

The audit that matters. Under the lens, an Easy member's endgame is its induced terminal
clade — the other Easy members closest to it. 61 of the naive top-100 land in a clade of 2–3,
which is ideal. A handful are marooned:

```
Coelophysis        terminal = Theropoda      (49 of 100)
Dilophosaurus      terminal = Neotheropoda   (48 of 100)
Cryolophosaurus    terminal = Tetanurae      (43 of 100)
Mononykus          terminal = Coelurosauria  (30 of 100)
Agilisaurus        terminal = Neornithischia (22 of 100)
Eoraptor           terminal = Sauropodomorpha(19 of 100)
```

A marooned member is a target you can only find by brute force — the warm trail tops out at
"somewhere in Theropoda". So the curation rule is not "pick the 100 most famous dinosaurs",
it is **pick famous dinosaurs in company**. Adding a relative fixes the neighbour too, so the
list wants to be assembled in pairs and triples.

Two shapes of fix, and the distinction is diagnostic:

- **Has a close companion** — add it. Coelophysis → Procompsognathus or Segisaurus
  (Coelophysidae); Mononykus → Shuvuuia (Mononykini); Massospondylus → Lufengosaurus;
  Mamenchisaurus → Omeisaurus; Therizinosaurus → Nothronychus; Heterodontosaurus →
  Abrictosaurus; Hypsilophodon → Thescelosaurus; Troodon → Stenonychosaurus; Archaeopteryx →
  Protarchaeopteryx.
- **Has no close companion at any notability** — Dilophosaurus, Cryolophosaurus, Agilisaurus
  and Eoraptor hang directly off huge clades in Wikidata, so nothing shrinks their terminal
  clade. Either drop them from Easy or accept a brute-force target. This isolation is a
  *resolution gap in the source topology*, i.e. epic #13 surfacing again — worth noting there,
  not worth fixing here.

**Build-time gate.** Warn (don't fail) when an Easy member's induced terminal clade exceeds a
threshold — 10 is the natural line given the histogram. Fail-closed name resolution as
`ALWAYS_PLAYABLE` already does: a name that doesn't resolve to a pool-eligible genus is warned
and skipped, never forced.

The drafted 100 is in the appendix, for editing.

## Daily, stats and sharing

Each tier gets its own puzzle, streak and history. An Easy 4/20 and a Hard 4/20 aren't the
same feat, so they can't share a scoreboard.

- **Three answers a day**, derived in tier order (Easy → Medium → Hard) with each excluding the
  ones already drawn. Without that, the same genus can be the answer in two tiers on one date
  and solving one hands you the other.
- **Persistence is per tier** — `mesozooa:daily:2:<tier>:<date>` and
  `mesozooa:practice:2:<tier>`. Switching tiers mid-game must be non-destructive in both lanes,
  or the switch is a trap.
- **Stats v2**: streak + accumulators per tier. v1 migrates wholesale into Medium — today's
  pool *is* Medium, so no history is lost or misattributed.
- **Share** carries the tier in the headline: `Mesozooa 2026-08-29 · Hard`. Grid and score
  format unchanged.
- **`daily-calendar.json`** (special-day overrides) becomes per-tier. A scheduled genus that
  isn't in that tier's pool is warned at build and falls back, same as today.

## IA

Difficulty is a **player setting**, not a lane — it applies to Daily and Practice alike and
persists across sessions. But it changes what your score means, so it has to stay legible
while playing, not hide in a modal.

Proposal: a tier control in the header beside How-to-play and Stats, opening a small popover;
the active tier is echoed in the board's status row so it's in frame during play.

```
┌──────────────────────────────────────────────────────────────────────┐
│ 🐾 Mesozooa  Find today's dinosaur!   [?] [◫] [Medium ▾]             │
│                                        Daily • Practice • Explore     │
└──────────────────────────────────────────────────────────────────────┘

        ┌ Difficulty ──────────────────────────────┐
        │  ● Easy     100 · the famous ones         │
        │  ○ Medium   734 · the standard set        │
        │  ○ Hard   1,170 · Mesozoic Mind           │
        │                                            │
        │  Each tier has its own daily puzzle and    │
        │  streak. Switching keeps both games.       │
        └────────────────────────────────────────────┘
```

Board status row, both lanes:

```
┌ board ───────────────────────────────────────────────────────────────┐
│ ┌ placard ──────┐  ┌ tree ──────────────────────────────────────┐   │
│ │   specimen    │  │                                             │   │
│ └───────────────┘  └─────────────────────────────────────────────┘   │
│ ┌──────────────────────────────────────────────────────────────────┐ │
│ │ [search…]          Medium · 12 of 20 moves left        [💡 2]    │ │
│ └──────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```

Stats, tier-tabbed, defaulting to the active tier:

```
┌ Stats ────────────────────────────────┐
│  [ Easy ][ Medium ][ Hard ]           │
│  Streak      4        Best     11     │
│  This week   5/6      Month  18/22    │
│  Avg moves   7.2                      │
└───────────────────────────────────────┘
```

Phone: the header is already tight with three nav tabs plus two icon buttons, so the tier
control likely collapses to the board status row there rather than earning header space. That
is a layout call for the build, flagged not settled.

Explore is untouched — whole reference pool, true counts — except `gradeByPlayable`, which
grades genus labels by *whether the guess box accepts them*. That must follow the active tier,
or the grading lies to an Easy player.

## Assumption I'm carrying, and its one consequence

You called the counts question moot given a single pool per tier, which I read as: the pool is
the game's universe, so a clade reports its **pool count**. Adopting that.

It has one visible consequence beyond Easy: Medium's counts change today's behavior.
Tyrannosauridae currently reads "13 genera" (all of Wikidata's) and would read "9" (the ones
you can actually guess). I think that's right — it makes every number on screen predict your
odds, and it's what keeps "warmest" meaning the same thing the player sees. But it is a change
to the shipping game, so: say if you'd rather Medium's display stayed at true counts.

The one place the two disagree is the end-state Explore link: the same node reads "9 genera"
in the game and "13 genera" in Explore. Cheapest honest fix is "9 of 13" in-game. Deferring
that to the visual/IA pass.

## Deferred / noted

- **Wastebasket terminal clades in Hard — measured, and it's a recall problem, not an
  information one.** Genera hanging directly off Theropoda get a terminal clade of 513 pool
  members, which looked unwinnable. It isn't: the clue is very nearly a unique key. Counting
  pool members that share a target's *full* clue inside its own terminal clade:

  | | median | mean | target is the only match | >5 left |
  |---|---|---|---|---|
  | Medium, all targets | 1 | 1.2 | 86% | 0% |
  | Hard, all targets | 1 | 1.4 | 79% | 0% |
  | Hard, terminal clade 2–10 | 1 | 1.3 | 82% | 0% |
  | Hard, terminal clade 51+ | 1 | 1.5 | 80% | 2% |

  Terminal-clade size barely moves it — 513 candidates collapse to ~1.5. So **a ceiling on
  terminal-clade size would fix a problem that doesn't exist**; dropped from the plan.

  Two things this does surface:

  - **The detail layer is load-bearing.** The two lead lines alone (epoch + country) leave
    median 2 / mean 4.1 and only 36% unique; adding stage, state and formation takes it to 79%.
    Not an artifact of over-precise dating — dropping the Ma numbers entirely leaves 79%
    unchanged, it's the stratigraphy doing the work. Coverage in Hard is 99% state, 97%
    formation. This retro-justifies the Jul-17 near-miss where a stale raw pull wiped location
    detail: in Hard that regression wouldn't degrade the clue, it would break the endgame.
  - **What Hard actually taxes is inversion, not deduction.** The clue says "Late Cretaceous
    (Campanian), Mongolia (Ömnögovi, Djadochta Formation)" and the information to finish is
    there — but the player must *produce the name* from a 513-member space they can't
    enumerate. At a 5-member terminal clade you brute-force by guessing; at 513 you can't. So
    the open Hard question is whether to help the player invert the clue (name the terminal
    clade and its size at the anchor? let the revealed clue filter autocomplete?) or to decide
    that unaided recall is exactly what "Mesozoic Mind" means. Design call, flagged not settled.
- **The isolated-genus cases** (Dilophosaurus, Cryolophosaurus, Agilisaurus, Eoraptor) are
  #13 symptoms; note them there.

## Appendix — drafted Easy 100

Ranked by Wikipedia sitelinks among the current playable pool. Spread: 49 Theropoda,
30 Ornithischia, 19 Sauropodomorpha (Archaeopteryx, Hesperornis and Confuciusornis sit in
Avialae, outside crown Aves). Marooned members marked ⚠ — add a companion or cut.

```
Tyrannosaurus     Archaeopteryx     Triceratops       Spinosaurus       Stegosaurus
Velociraptor      Diplodocus        Brachiosaurus     Apatosaurus       Allosaurus
Iguanodon         Ankylosaurus      Ceratosaurus      Parasaurolophus   Carnotaurus
Argentinosaurus   Compsognathus     Albertosaurus     Edmontosaurus     Eoraptor ⚠
Dilophosaurus ⚠   Deinonychus       Giganotosaurus    Pachycephalosaurus Carcharodontosaurus
Baryonyx          Acrocanthosaurus  Massospondylus    Coelophysis ⚠     Plateosaurus
Oviraptor         Tarbosaurus       Abelisaurus       Styracosaurus     Megalosaurus
Microraptor       Troodon           Gallimimus        Herrerasaurus     Corythosaurus
Protoceratops     Euoplocephalus    Kentrosaurus      Psittacosaurus    Mamenchisaurus
Barosaurus        Ornithomimus      Brontosaurus      Gorgosaurus       Lambeosaurus
Maiasaura         Camptosaurus      Camarasaurus      Supersaurus       Torosaurus
Avimimus          Daspletosaurus    Amphicoelias      Torvosaurus       Alamosaurus
Therizinosaurus   Pachyrhinosaurus  Sauroposeidon     Amargasaurus      Struthiomimus
Hesperornis       Saurolophus       Hypsilophodon     Ouranosaurus      Deinocheirus
Cryolophosaurus ⚠ Edmontonia        Dromaeosaurus     Tuojiangosaurus   Heterodontosaurus
Suchomimus        Achillobator      Staurikosaurus    Shantungosaurus   Centrosaurus
Utahraptor        Irritator         Gigantoraptor     Giraffatitan      Scelidosaurus
Dilong            Sinornithosaurus  Sinosauropteryx   Barapasaurus      Huayangosaurus
Afrovenator       Confuciusornis    Majungasaurus     Chasmosaurus      Saltasaurus
Alioramus         Mapusaurus        Agilisaurus ⚠     Mononykus ⚠       Yutyrannus
```
