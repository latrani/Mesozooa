# Mesozooa — Visual Design (Look-and-Feel, Part 2)

*The look-and-feel pass, part 2: the visual treatment over the settled IA.*
Date: 2026-07-13

This spec covers the **visual layer** — palette, type, material, space, and motion — applied
to the information architecture settled and built in the IA pass (Plans 1 + 2, merged). It does
**not** re-open structure: the four regions, the spine tree, the specimen right-rail, the trail
scrubber, and the region composition are fixed. Their *geometry* stays; this pass gives them a
skin, a type system, and a compositional attitude.

Prior context: the components shipped structural-CSS-only on purpose (semantic class hooks, no
palette/type/motion). See the `aesthetics-defer-until-functional` and `mesozooa-visual-palette`
memories, and `docs/superpowers/deferred-findings.md` bucket A (the cosmetic backlog this pass
clears).

## 1. The design thesis

**One idea, two references.** *Eyewitness* books (DK) and *Utopian Scholastic* (the optimistic
late-80s–2000s educational-encyclopedia look) share a single compositional logic that drives this
pass:

> **The annotated specimen is the fundamental object, and curatorial juxtaposition is the layout
> logic.** Information is rendered as a beautiful, labeled *thing* placed in considered space —
> photographic cutouts floating on a page, captions by proximity or a hairline leader, free
> mixing of scale, no visible grid, dense in aggregate yet airy because each object gets room.

Why this fits Mesozooa rather than fighting it — **the IA already has these bones:**
- The **specimen right-rail** literally *is* an Eyewitness cutout-with-caption; its
  `?????? → 7 taxa + clue → solved` progression is a specimen accruing annotation.
- The **spine tree** is already ungridded — `layoutSpine` places nodes by data, not a grid.
  Nodes floating with leader-line labels and off-spine branches splayed into open canvas is
  Eyewitness composition *structurally present already*; this pass makes that geometry *read* as
  intentional editorial arrangement instead of a mechanical diagram.
- The **negative space** the spine leaves (off-spine only populates where guesses landed) becomes
  *compositional* blank — the eye travels to the specimen — not dead space.

**The palette caveat (explicit):** we take the Eyewitness *compositional* airiness, NOT its stark
white page. The ground is **warm plaster/sand** (§2). Floating-cutout logic on an earthtone
ground.

**The honest tension:** web layout wants alignment; "ungridded + responsive" pull against each
other, and generous blank is the first casualty on small screens. Resolution = a **collage-where-
it's-an-object, flow-where-it's-a-control** split (§3). We do not pretend the collage survives
unchanged to mobile; it degrades to an honest stack (§8).

## 2. Design tokens

All values are exact and become CSS custom properties on `:root` (a new `src/lib/styles/`
tokens layer; §9 in the plan will place it). Colors sampled from the moodboard (New Mexico high
desert: ABQ NM Museum + Ghost Ranch) via `moodboard/extract.py` (k-means + point-sampling).
**These tokens are LOCKED** — validated in a rendered mock (`screenshots/visual-mock.html`, v2)
and approved. Contrast targets **WCAG AA by default** (4.5 body / 3.0 large & UI).

### 2.0 Two directional decisions baked into these tokens

- **Ground is light adobe, placards are dark terracotta.** Think *adobe, not butter*: a near-white
  warm page where high-detail objects float (Eyewitness figure/ground), and the load-bearing
  "placards" (specimen card, trail scrubber) are dark terracotta clay with cream text. This
  inversion — dark object on light page — is what makes the specimen read as a real mounted thing.
- **Warmth ramp = "gem from ore".** Turquoise is the hero/answer color, so warmth must move
  *toward* turquoise, not away from it. Cold/far = dull earthy **ore**; hot/near = a glowing
  **turquoise gem**. This resolves the v1 semiotic clash (turquoise can't mean both "happy spine"
  and "cold"). The hottest guess literally glows the same turquoise as the spine it's approaching.

### 2.1 Color

**Ground (adobe near-white, light):**
```
--bg-page      #f8f4ea   the "page" — where specimens float (ink 13.3:1)
--bg-surface   #f2ebdb   raised surface / input face
--bg-sunk      #eaddc7   recessed wells, bar tracks
--hairline     #d8ccb6   leader lines, dividers, cutout edges
```
**Ink (warm dark brown, never pure black):**
```
--ink          #33261a   body/heading text        (13.3:1 on bg-page)
--ink-soft     #5f5040   secondary text, captions ( 7.1:1)
--ink-mute     #8a7963   de-emphasized/meta        (large/UI only — NOT body)
```
**Terracotta placards (dark chrome, cream text) — the specimen card & trail:**
```
--placard      #9a4a33   placard face (cream text 4.9:1 ✓ AA body)
--placard-dp   #7c3b28   gradient bottom / deeper face (cream 7.3:1)
--placard-edge #5f2c1e   1px placard border, bevel
--cream        #f7efe0   text on placards
--cream-dim    #f0d8b8   meta/counts on placards (large only)
```
**Blue — HERO identity (spine, brand, gem end of ramp):**
```
--turq         #0d9aa8   the spine, brand marks, hottest warmth stop
--turq-dp      #0a7a86   frontier node, hover/active of identity
```
Turquoise is decorative/identity weight; it is **not** used as body text or a white-on-blue button
(it fails AA there — that was the whole v1 problem). Functional emphasis is carried by the
placards and mahogany, not by blue chrome.

**Mahogany — primary action (replaces the blue button; user explicitly rejected blue CTAs):**
```
--mahogany     #7a3a26   primary-button ground (cream text 7.5:1 ✓)
--mahogany-hi  #8f4630   gradient top / hover
```
**Sand accents:** `--sand-200 #e6be93` · `--sand-400 #c8a578`.

**Spine color (locked):** solid `--turq`, one color end to end — the hero brand mark. It does
**not** carry the warmth ramp.

**Warmth channel placement (IA spec §4, now colored):** warmth is read in the **specimen** chip
(primary) and **guess-history bars** (per-guess record) — NOT the spine, NOT the trail (the trail's
counts are structural clade sizes in `--cream-dim`).

**Warmth ramp — ore → turquoise gem** (far/cold → near/hot; increases chroma and shifts hue toward
turquoise as it warms):
```
--warm-0  #7a6a4c   coldest / far — dull umber ore
--warm-1  #8f7f4a
--warm-2  #7f9257
--warm-3  #4f9f8a
--warm-4  #1aa39f
--warm-5  #0d9aa8   hottest / near — turquoise gem (== --turq)
```
Rendered as discrete banded fills (not a continuous gradient) so each reads as a "temperature
reading" in the Utopian-Scholastic diagram voice. The hottest stops get a subtle turquoise **glow**
(box-shadow bloom) to sell "gem". These are large fills (AA large/UI class); never place text on
them.

**Contrast note (verified):** ink 13.3:1, ink-soft 7.1:1, cream-on-placard 4.9:1, cream-on-
mahogany 7.5:1 all pass AA body. `--ink-mute` and `--cream-dim` are large/meta only. Clade-count
meta on the light ground must use `--ink-soft` (not `--ink-mute`) when at body size.

### 2.5 Semantic token layer (for editability)

The tokens above are **primitives** (raw sampled colors). Over them sits a **semantic layer** that
maps *roles* to primitives, and components read the semantic tokens — so recoloring a region later
is a one-line edit. Per-placard surface tokens carry derived tone/edge via `color-mix` (verified to
reproduce the sampled terracotta within rounding, and to re-cascade only when edited at `:root`):
```
--trail-surface: var(--placard);   --trail-dp: color-mix(in srgb, var(--trail-surface), #000 20%);
                                    --trail-edge: color-mix(in srgb, var(--trail-surface), #000 40%);
--specimen-surface: var(--placard); (+ -dp/-edge derived the same; NodeDetail shares this role)
--action-primary: var(--mahogany); --action-primary-hi: var(--mahogany-hi);
--spine: var(--turq);  --node-frontier: var(--turq-dp);  --node-context: var(--ink-mute);
--leader: var(--hairline);  --accent: var(--turq);   /* active tab, focus ring */
```
E.g. "make the trail dusty-teal" = change `--trail-surface` at `:root`; the gradient bottom and edge
re-derive automatically. Full token list + rules live in the implementation plan's Task 1.

### 2.2 Type — warm humanist sans

**Family: Hanken Grotesk** (self-hosted, free; woff2 subset). Warm humanist grotesk — friendly
and grown-up, not cute, not a serif label voice. **Tabular figures on** (`font-variant-numeric:
tabular-nums`) everywhere counts appear (clade counts, budget, guess counts) so numbers don't
jitter.

**Base size is 24px, and the whole scale is +50% over a conventional web app** (locked, per
explicit direction — the app has ample width and was reading too small/timid). Default to bold,
legible, confident sizing; resist the instinct to shrink. Scale (exact rem):
```
--type-display  2rem/800    wordmark, solved answer name
--type-h        1.25rem/700 region/specimen headline
--type-body     1.05rem/400 default (on 24px root)
--type-label    0.92rem/600 crumb names, node labels, captions
--type-meta     0.78rem/700 tabular counts, budget, "Ma"
--type-eyebrow  0.72rem/700 uppercase tracked overline
```
Voice touches that evoke the interpretive-panel feel without serifs or kitsch: an **overline
eyebrow** (uppercase, tracked; `--ink-mute` on light, `--cream-dim` on placards) above
specimen/section headings (e.g. `SPECIMEN · UNIDENTIFIED`, `FIELD CLUE`).

### 2.3 Space, edges, material
```
--space  0.25 / 0.5 / 0.75 / 1 / 1.5 / 2.5 / 4 rem  (loose, non-uniform — collage wants irregular breathing room, not an 8px lockstep)
--radius-card  8px      --radius-pill  999px
--placard-border  1px solid var(--placard-edge)   dark bevel edge on terracotta objects
--shadow-lift     0 2px 4px rgba(51,38,26,.12), 0 8px 22px rgba(51,38,26,.10)     warm-tinted lift
--shadow-placard  0 2px 3px rgba(51,38,26,.18), 0 10px 26px rgba(95,44,30,.20)    heavier, terracotta-tinted — placards sit ON the page as objects
```
No pure-black shadows (warm-brown/terracotta tint). Placards use a top inset highlight
(`inset 0 1px 0 rgba(255,255,255,.12)`) + the dark edge to read as beveled clay.

**Skeuomorphism is wanted, not avoided** (a core way we meet the Eyewitness brief: high-detail
real objects on a minimal ground). The specimen well is a **mounted shadow-box** — an inset
"glass over a sand mat" (radial sand fill + `inset` shadow + thick `--placard-edge` frame).
Placards, the input well, and bar tracks all use inset/lift shadows to read as physical. Caveat
(learned in the mock): crude vector art *undercuts* skeuomorphism — detail must be high or absent
(see §5.1).

### 2.4 Motion (restrained)
```
--ease     cubic-bezier(.2,.6,.2,1)    --dur-fast 120ms   --dur 220ms   --dur-slow 420ms
```
Motion is used only where it carries meaning (§7). `prefers-reduced-motion: reduce` → all
transitions collapse to ≤1ms; nothing essential depends on motion.

## 3. The collage principle & the flow/collage split

The layout divides into two structural attitudes:

- **Collage (composed placement):** the **tree canvas** and the **specimen**. Objects float on
  the plaster page; placement is intentional and asymmetric; leader lines connect labels to
  objects; scale mixes freely; blank is compositional. The tree is *already* data-placed by
  `layoutSpine`, so this is dressing existing geometry, not fighting the engine.
- **Flow (predictable controls):** the **header**, the **trail scrubber**, the **input row**.
  These are load-bearing chrome — they stay in normal document flow, align, and never break. They
  are the "furniture" the collage sits within.

This split is the answer to the ungridded-vs-responsive tension: we only ask the engine to do
composed placement where an object model justifies it (and where geometry is already computed),
and we keep controls boring on purpose.

```
┌─ MESOZOOA ────────────────── Daily · Practice · Explore ─┐  flow: furniture
│  4/20   dinosaur › Theropoda › … › Tyrannosauridae        │  flow: trail scrubber
│ ┌───────────── tree canvas (collage) ──────┐ ┌ specimen ┐ │
│ │            ○ Ornithomimosauria            │ │ ┌──────┐ │ │  collage:
│ │           ╱                                │ │ │??????│ │ │   tree = floated
│ │ ○━━━━━━●━━━━━━━━━━━━━━━━━━━━━━━━━●  spine → │ │ └──────┘ │ │   nodes + leaders
│ │           ╲                                │ │ 7 taxa   │ │   specimen = the
│ │            ○ Dromaeosauridae     · · ·      │ │ ── clue ─│ │   Eyewitness plate
│ │                        (compositional blank)│ │ Campanian│ │
│ └────────────────────────────────────────────┘ └──────────┘ │
│  Gallimimus  881 ▓▓░░   Velociraptor  312 ▓▓▓░               │  flow-ish: guess history
│ ┌ guess a dinosaur… ──────────────────┐  [ Hint ]           │  flow: input row
└──────────────────────────────────────────────────────────────┘
```

## 4. The tree as editorial plate

Dress the existing `SpineTree` geometry so it reads as an Eyewitness spread, not a graph.

- **Spine:** a solid `--turq` stroke (width ~5px, with a subtle turquoise drop-shadow bloom), the
  heaviest line on the page — the hero mark. Its nodes are the largest cutout objects. Root at
  left, frontier at right (unchanged).
- **Nodes as cutout specimens:** each node is a small floated object with a **leader-line label**
  (`--hairline`) — the label sits *beside* the node with a short connector, Eyewitness-style, not
  crammed on top. Genus/frontier nodes read larger/heavier (a `--turq-dp` dot ringed white) than
  internal clades (they already carry `class:genus`). Node dot fill: spine nodes `--turq`;
  off-spine nodes `--ink-mute` (context, wandered-off).
- **Off-spine splay as arrangement:** the above/below branches (already placed by `layoutSpine`)
  get leader-line edges (`--hairline`, thinner than the spine) and read as specimens arranged
  around the main plate — the verticality is "how far off you wandered," now *composed* rather than
  mechanical.
- **Compositional blank:** the unpopulated canvas is intentional negative space; do not fill it,
  do not center-justify the spine into it. The frontier floats toward the specimen (right), which
  is where the eye should travel.
- **Node label counts** stay `--type-meta` tabular; they're clade sizes (structural), not warmth —
  no ramp color on the tree.

## 5. The specimen as the Eyewitness plate

The right-rail specimen is the clearest mapping in the app — treat it as the hero annotated plate.
Its three states (unchanged from IA §5) get this treatment:

All three are one terracotta placard; only the contents change (`░` = shadow-box mount):
```
   broad                  terminal clade                 solved
 ┏━ SPECIMEN ━┓        ┏━ SPECIMEN ━━━┓              ┏━ SPECIMEN·ID ┓
 ┃ ┌────────┐ ┃        ┃ ┌────────┐   ┃              ┃ ┌────────┐   ┃
 ┃ │░░??????░│ ┃mount  ┃ │░░??????░│   ┃              ┃ │░(empty░ │  ┃ ← frame only;
 ┃ └────────┘ ┃       ┃ └────────┘   ┃              ┃ └─mount)──┘   ┃   art deferred
 ┃ ▓ 881      ┃warm   ┃ ▓ 7 sibling  ┃              ┃ TYRANNOSAURUS ┃   (§5.1)
 ┃   genera   ┃chip   ┃   taxa (glow)┃              ┃ solved · 6    ┃
 ┃            ┃       ┃ FIELD CLUE   ┃eyebrow        ┃ ┏ explore ▸ ┓ ┃ mahogany
 ┃            ┃       ┃ Campanian    ┃              ┃ ┗━━━━━━━━━━━┛ ┃
 ┃            ┃       ┃ · USA        ┃              ┃ [ new round ] ┃
 ┗━━━━━━━━━━━━┛        ┗━━━━━━━━━━━━━━┛              ┗━━━━━━━━━━━━━━━┛
```
The whole card is a **terracotta placard** (`--placard` gradient, `--placard-border`,
`--shadow-placard`, cream text) — a dark clay object on the light page.
- **Mounted shadow-box well:** the specimen art area is an inset "glass over a sand mat" —
  radial sand fill (`#f3e6cf`→`#e3cba6`), `inset` shadow, thick `--placard-edge` frame. The
  `??????` placeholder sits in it as an unidentified mount.
- **Warmth here is primary:** the count/state chip carries the **warmth ramp band** (broad → a
  cool ore stop; terminal → a hot near-turquoise stop with the gem glow) — the app's primary
  warmth reading.
- **Clue** under a `FIELD CLUE` eyebrow, cream text; age + location as caption lines (from the
  folded-in CluePanel content, now in Specimen).
- **Solved:** answer in `--type-display`; `explore around [answer] ▸` is a **`--mahogany`** primary
  action (NOT blue); "New round" secondary. The loss reveal uses the same placard (answer shown),
  no separate result UI.

### 5.1 Specimen art — DEFERRED (ship the frame, not the art)

The mock proved the point that crude vector art *undercuts* skeuomorphism (a hand-drawn "T. rex
skull" read as a slug). **Decision (locked): this pass builds the shadow-box FRAME + all three
states with the `??????`/placeholder mount only.** Actual per-specimen imagery is its OWN later
task — NOT in this visual pass. Do not commission or hand-draw specimen illustrations here; a bad
illustration is worse than an honest empty mount. The frame, the mat, the eyebrow, the states, the
warmth chip, and the clue are all in scope; the picture inside the glass is not. (When art does
land later, `TreeNode.imageUrl` is the likely source, but even that is out of scope now.)

## 6. Trail, guess history, input, header

- **Trail scrubber (flow) — a terracotta placard pill.** The whole trail is one long
  `--placard`-gradient pill (border `--placard-edge`, `--shadow-placard`, cream text) — a second
  clay object, sibling to the specimen. Crumbs are cream `--type-label`; the active/hovered crumb
  gets a translucent cream wash (`rgba(cream,.18)` + inset ring). The budget chip (`4 / 20`,
  tabular) is a cream pill with `--placard-dp` text, at the head. Trail is **not** a warmth channel
  — counts are `--cream-dim`, structural.
- **Guess history (flow-ish):** each row = name + **per-guess warmth**, the after-the-fact record.
  Warmth renders as a short **banded bar** in a `--bg-sunk` inset track, filled with the ramp stop
  nearest that guess's clade size; the near-turquoise stops get the gem glow (this and the specimen
  are the only warmth surfaces). Hint rows are distinguished by a `HINT` tag (sand pill,
  `--placard-dp` text) after the name — clears a bucket-A item.
- **Input row (flow):** the search input is the one always-present control — a generous
  `--bg-surface` pill with an inset well shadow. `[ Hint · N left ]` beside it (Daily) is a
  `--mahogany`-outline button (not blue).
- **Header (flow):** wordmark `--type-display` in `--ink`; the three modes as quiet text tabs, the
  active one marked with a `--turq` underline. Minimal furniture on the bare page.

## 7. Motion

Meaning-carrying only:
- **Frontier advance:** when the spine deepens, the viewport pan (already implemented) eases with
  `--ease`/`--dur-slow`; the new frontier node fades+rises in (`--dur`).
- **Specimen state change:** broad→terminal→solved cross-fades the plate contents (`--dur`); the
  warmth band transitions its color along the ramp (`--dur-slow`) so temperature *changes* visibly.
- **Guess commit:** a new guess row enters with a short fade/slide (`--dur-fast`).
- **Trail crumb → pan:** clicking a crumb eases the pan (reuses the frontier pan).
- Everything collapses under `prefers-reduced-motion`.

## 8. Responsive — how the collage degrades

The collage is a desktop luxury; on narrow screens it becomes an honest stack (do not fake
composed placement where there's no room).
- Below the existing 640px breakpoint (Plan 2, Task 8): the tree fills the flexible middle and
  keeps **horizontal scroll and orientation** (root left, deeper right — never rotates); the
  specimen collapses to the full-width bottom bar (already built) and is **re-skinned** as a
  compact plate strip (`?????? · 7 taxa · warmth · clue`), pegged above the input.
- Compositional blank is sacrificed first: the tree canvas tightens, leader-line labels may
  shorten/stack. The specimen stays legible as the priority object.
- The two open bucket-items (`align-items: baseline` jitter; empty-state tree flex-fill) are fixed
  here as part of re-skinning those regions.

## 9. Deferred-findings bucket A — coverage

This pass clears bucket A of `docs/superpowers/deferred-findings.md`:
- Warmth/emphasis **color scale** → §2.1 ramp, applied per §4/§5/§6.
- **Tab / budget / hint-button styling** → §6.
- **Hint rows visually indistinct** → §6 (distinguished).
- **Game hover tooltip lost `"guesses:"` prefix** → restore in the tree tooltip treatment (§4).
- **Root label lowercase "dinosaur"** → title-case/prettify at the label layer (tree, trail,
  specimen).
- **Non-playable badge / active-tab styling** → §6 header; NodeDetail styling in Explore.
- **Specimen bottom-bar baseline jitter** & **empty-state tree flex-fill** → §8.

## 10. Out of scope / deferred

- **Dark theme** — still later. Tokens are authored so a dark variant is a later re-map, but not
  built now.
- **Photographic specimen imagery** — the Eyewitness cutout is evoked via framing/silhouette and
  the existing node/`TaxonCard` imagery, not a new art-commission of per-genus cutouts. If
  `TreeNode.imageUrl` exists it may be used in the specimen plate; sourcing new art is out of scope.
- **Share visual** — share stays unsurfaced (IA §8); no share styling.
- **Explore deep visual polish / pan-zoom** — Explore gets the token skin (ground, type, blue
  chrome, back button) but its cladogram (`TreeView`) is not re-composed as collage this pass; its
  pan/zoom remains deferred.
- **Sound, illustration, custom iconography** — later.
