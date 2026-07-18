# Shared SpecimenCard — one taxon-info block for Game and Explore

## Problem

The game's solved specimen and Explore's `NodeDetail` present the same underlying
thing (an identified taxon) with divergent, drifting markup. The game's solved
state also still shows an empty skeuomorphic shadow-box (deferred art) even though
~1662 nodes now carry an `imageUrl`. And `NodeDetail` has a pluralization bug:
"1 genera in this clade".

## Decision

Extract a **content-only** `SpecimenCard` that renders taxon info for any node id,
and let the two hosts own their chrome (Option A — the shared part is the content;
the divergent parts — title treatment, framing, actions — stay with the hosts).

### `SpecimenCard(nodeId)` — content by node type

- **Image** (if `node.imageUrl`): rendered at the top. If absent, no image (no
  placeholder — the host frame, if any, provides visual structure).
- **Then, by type:**
  - **Genus:** the paleo clue — `Lived: <ageLabel> (~start–end Ma)` and
    `Found in: <discoveryLocation>`, each shown only if present. If the genus has
    no clue at all (unplayable genera have none), the clue section is simply
    omitted (no "no data" note).
  - **Clade (non-genus):** `<N> genera in this clade`, correctly pluralized
    (`1 genus` / `N genera`). This fixes the current bug.
- **Wikipedia link** (if `node.wikipediaUrl`): last.
- **No lineage breadcrumb** (dropped — redundant with the tree; not in the model).
- The card renders NO name/title and NO action buttons — hosts own those.
- Reads `clueFor(nodeId)` internally (over `genus-attributes.json`); the game's
  existing separate `clue` plumbing to `Specimen` is no longer needed for the
  solved branch (see Game host).

The card is pure display given an id — reusable, gallery-friendly, no game concepts.

### Game host (`Specimen.svelte`) — solved branch only

The unidentified progressive states (`empty` / `broad` / `terminal`) are unchanged:
they HIDE identity (warmth chip, `? ? ?` shadowbox, count/clue teasers) and are
game-specific. Only the **solved** branch changes:

- Keep the skeuomorphic shadow-box frame. The specimen **image fills it** (the
  long-deferred art mount). If the target has no `imageUrl`, fall back to the
  existing `? ? ?` / empty-mount look.
- Below the frame: the answer name (unchanged — `--font-head`, display size),
  the "Solved / Out of guesses in N guesses" line, then `<SpecimenCard nodeId={targetId}/>`
  for the clues + wiki, then the existing CTAs (Explore around / New round).
- Because the card now renders the clue, the terminal-state `clue` prop stays
  (terminal still teases it pre-solve), but the solved branch reads the card
  instead of the inline clue markup.

Note: the card inside the dark specimen placard must read on terracotta — reuse the
existing `--specimen-text` overrides already applied to `NodeDetail`'s card slot.

### Explore host (`NodeDetail.svelte`)

Replace its bespoke `TaxonCard` + group-size + unresolved-note body with:
- The node name as a plain heading (host-owned, `--type-h`, not display font).
- `<SpecimenCard nodeId={taxonId}/>`.
- Keep the placard styling and the `--specimen-text` / `--sand-200` link overrides.
- The "Not in the playable pool (unresolved placement)" note is dropped (not in the
  content model; it was an unplayable-genus caveat). If we want it back later it's a
  host concern, not the card's.

`TaxonCard.svelte` becomes unused → deleted (its image+wiki logic moves into
SpecimenCard; its name+lineage were host/removed concerns).

## Pluralization

A tiny shared helper so both the clade count and any future counts are correct:
`pluralGenera(n)` → `"1 genus"` | `"N genera"`. Lives beside the card (or in an
existing util). TDD'd.

## Files

- Create: `src/lib/game/components/SpecimenCard.svelte` — the shared content block.
- Create/modify: pluralization helper (`src/lib/game/plural.ts` or inline in the
  card) + test.
- Modify: `src/lib/game/components/Specimen.svelte` — solved branch (image in
  shadow-box, embed card).
- Modify: `src/lib/explorer/components/NodeDetail.svelte` — embed card, host heading.
- Delete: `src/lib/game/components/TaxonCard.svelte` (after moving logic).

## Testing

- `pluralGenera` — pure, TDD (1→"1 genus", 0/2/674→"N genera").
- `SpecimenCard`, `Specimen`, `NodeDetail` — svelte-check + build + live run
  (no component unit tests, per project convention).
- Live verify: game solved card (image in frame + clues + wiki), Explore genus
  (image + clues + wiki), Explore clade (image + "N genera" + wiki), Explore
  clade with count 1 (correct singular), a genus with no image / no clue
  (graceful omission).

## Non-goals

- Changing the game's unidentified (empty/broad/terminal) states.
- Restyling the shadow-box frame itself (only its contents change).
- Re-adding the lineage breadcrumb or the unplayable-placement note.
- Image lazy-loading / lightbox / captions (YAGNI).
