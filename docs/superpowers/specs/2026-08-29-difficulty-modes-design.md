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

- pool count → count of *pool members* below a node.
- `branchDepth` → increments only where the **pool** count narrows.
- `terminalClade` → lowest ancestor holding ≥2 pool members.

The whole engine then works unchanged, because all of it reads those three: the warmth ramp and
its denominator, `warmestSharedNodeId`, `leafHintActive`, `nextHintRun`, `hintCost`, the
degenerate-target gate.

**Beside, never on top.** The lens publishes its values *alongside* the node's own —
`node.descendantGenusCount` keeps meaning the true clade size, and pool counts arrive through a
separate store accessor. Overwriting the field would quietly convert every reference surface
(`nodeView`, and through it the #69 panel and Explore, plus `a11y-tree`) to tier-relative
counts by accident. See **Counts: two surfaces, two questions**.

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
or the grading lies to an Easy player. See **The anchor note** for the exact rule.

## The anchor note

The fix for the flat endgame described under *Deferred / noted*. One line, appearing at one
moment.

**When.** Only once warmth pins at the anchor (`leafHintActive`). Before that, play stays
countless — #41's call to keep `showCounts={false}` during play stands. This is not a general
un-hiding of counts; it is a single line that arrives exactly when the warm trail stops being
informative and the clue takes over.

**What.** The specimen placard's `note` — `null` throughout play today — renders the warmest
shared clade and its size in the active tier:

```
┌ placard ───────────────────┐
│ ? ? ?                      │
│ ┌────────────────────────┐ │
│ │  New exhibit           │ │
│ │  coming soon!          │ │
│ └────────────────────────┘ │
│ Lived:    Middle Jurassic  │
│           (Bajocian, …)    │
│ Found in: China            │
│           (Sichuan, …)     │
│                            │
│ Theropoda ·                │
│ 513 candidate specimens    │  ← new. the count is the affordance
└────────────────────────────┘
```

**Copy.** "**513 candidate specimens**" — deliberately not "genera" and not "dinosaurs". The
card is describing the state of your hunt, so it counts candidates; a taxonomic word here would
read as a claim about Theropoda's size and collide with the reference cards that legitimately
say "751 genera in this clade". See **Counts: two surfaces, two questions**. "Specimen" is
already this card's vocabulary ("Specimen missing", `specimenState`).

**The affordance.** The count is a button. Clicking it hands off to Explore focused on that
clade — the existing `nav.exploreAround(id)` path already used at end state. No new Explore
functionality: no filtering, no scoping, Explore remains the full reference explorer. Hover
title and accessible name say where it goes: *"See Theropoda in Explore."*

**The one requirement it puts on Explore.** `gradeByPlayable` reads the global `node.playable`
today. Under tiers it must read the pool of **the current game's tier**, or a player arriving
from an Easy game sees Medium's guessable set graded as accepted — the grading would lie at
precisely the moment it's being relied on. Since choosing a tier is what makes that tier's game
current, active tier and most-recently-touched game coincide; if the two lanes are ever allowed
to sit at different tiers independently, this needs an explicit last-touched pointer rather
than reading the setting.

**Consequence worth knowing.** At the anchor, one click now shows the neighbourhood you're
stuck in, with guessable genera graded. In Hard that's a 513-member clade — orientation, not an
answer. In Easy and Medium the terminal clade is 3–5, so the same click lands close to a
candidate list. It adds no capability (Explore is already a tab away and already grades by
playability) — it removes friction, which is the point, but the friction was doing some work.
Reads as an escape hatch rather than a cheat. If it ever needs pricing, the share line has the
precedent in its 🔦 hint tally.

## Counts: two surfaces, two questions

There is no conflict to resolve here, and treating it as one was an error. The game screen
carries two count-bearing cards and they are **different objects asking different questions**:

- **The selected-node panel** (#69) is a *reference* card. Its own spec fixes it as "Explore's
  `nodeView()` unchanged — no game-specific gating", and that holds under tiers: it always
  reports the true clade size, "751 genera in this clade", identical to what Explore shows for
  the same node. Nothing about difficulty touches it.
- **The answer card** — the specimen placard you are playing against — is a *game* card. It
  describes your search, not a taxon, so it speaks in candidates: **"513 candidate specimens"**.

The wording is what keeps them from reading as a discrepancy. "Candidate specimens" is a claim
about the state of your hunt; "genera in this clade" is a claim about the clade. Both true, both
on screen, neither contradicting the other. And "specimen" is already the vocabulary the card
speaks.

So Medium's displayed counts do **not** change: reference surfaces keep true counts in every
tier, and no existing number moves.

### What this forces on the lens

The lens must not overwrite `descendantGenusCount` on the node objects. If it did, every
reference surface reading that field — `nodeView`, and through it both the #69 panel and
Explore, plus `a11y-tree` — would silently become tier-relative, breaking the "same as Explore"
rule by accident rather than by decision.

So the rule is: **pool counts are engine-facing; the node's own count stays reference-facing.**
The lens exposes its values beside the true ones (a `poolCount(id)` accessor on the store, not
a mutated field). Engine reads — `warmestSharedNodeId`, `leafHintActive`, `nextHintRun`,
`hintCost`, the warmth denominator, the degenerate gate — take the pool count. Display reads
that describe a taxon take `node.descendantGenusCount`, untouched.

### One sub-decision

Does "513 candidate specimens" tick down as you guess? Recommend yes, subtracting only pool
members you have already guessed. It is monotone, obviously correct, and never overstates your
progress. It *understates* it — a guess inside a sub-branch eliminates that whole branch, not
just the one genus — but a number that claims less narrowing than really happened is the safe
direction, and computing true elimination would mean running a deduction engine against the
player's guess history.

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
    enumerate. At a 5-member terminal clade you brute-force by guessing; at 513 you can't.
    Addressed by **The anchor note** below.
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
