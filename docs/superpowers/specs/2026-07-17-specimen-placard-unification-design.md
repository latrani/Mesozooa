# Specimen placard unification — design

**Status:** approved (brainstormed 2026-07-17). Structural/semantic refactor; **no visual
change**. This exists to make a later visuals pass easier.

## Problem

"The specimen card" isn't one thing — it's assembled three different ways depending on context,
which is why it reads as un-semantic:

1. **The title lives outside the card.** The taxon name is rendered by the *parent*, two different
   ways: `<p class="answer">` in `Specimen.svelte` (game) and `<h2>` in `NodeDetail.svelte`
   (explore). No single source of truth for the title.
2. **Three implementations of the same card.** `SpecimenCard.svelte` only handles the *identified*
   case (game-solved + explore). The game's *unidentified* states (empty / broad / terminal)
   re-implement the mount + clue rows inline in `Specimen.svelte`, with hardcoded `? ? ?`.
3. **Weak HTML semantics.** `<p class="answer">` as a title instead of a heading; the paleo field
   data (`Lived:` / `Found in:`) as loose `<span><b>…</b></span>` rows instead of a description
   list. The DOM doesn't describe the content structure.

Also: the dark 20rem slab is a **placard**, not a "card" — and the placard *chrome*
(gradient / border / shadow / padding / the `<640px` responsive grid) is itself duplicated across
`.specimen` (game) and `.node-detail` (explore).

Not in scope: where the literal `? ? ?` placeholder strings come from — that's fine as-is.

## Design

One presentational component, driven by an explicit view-model produced by pure selectors.

### The view-model — the single interface the placard renders

```ts
type Mount =
  | { kind: "photo"; url: string; alt: string; credit: Credit | null }
  | { kind: "slip"; text: string; tilt: number }; // "Coming soon..." / "Specimen missing"

interface Field { label: string; value: string | null; detail?: string } // value null → ? ? ?

interface SpecimenView {
  title: string | null; // null → unidentified (renders the ? ? ? heading treatment)
  mount: Mount;
  fields: Field[]; // Lived / Found rows; [] if none
  note: string | null; // clade summary, e.g. "12 genera in this clade"
  link: { href: string; label: string } | null; // Wikipedia
}
```

### Two pure selectors — `src/lib/game/specimen-view.ts` (TDD-tested)

- `nodeView(node, store): SpecimenView` — a fully **identified** taxon. Genus → clue fields
  (`Lived` / `Found in`, layered lead + detail via the existing `formatClueAge` / `formatClueLocation`);
  clade → `note` = genus count. Mount = photo (with credit) or the `"Specimen missing"` slip when
  no processed image. Link = Wikipedia. Used by **Explore and game-solved** — they are the same thing.
- `specimenView(state, store): SpecimenView` — game states. Unidentified (`empty` / `broad` /
  `terminal`) → placeholder view: `title: null`, `mount` = `"Coming soon..."` slip, `fields` with
  `value: null` (`? ? ?`). `terminal` differs only in that the fields carry the **real** clue (the
  clue unlocks there). `solved` → delegates to `nodeView(target)`.

This is the one place that decides "what shows for this state," replacing the inline `? ? ?` logic
in `Specimen.svelte`. `specimenView` supersedes `specimenState` **for the specimen UI**; the plan
checks whether `specimenState`'s kind is still referenced elsewhere (e.g. warmth/clue triggers)
before removing it — if so it stays, and `specimenView` is built alongside.

### The placard — `SpecimenPlacard.svelte` (renamed from `SpecimenCard`)

Pure presentation. Props: `view: SpecimenView`, plus an optional `action` snippet (game passes its
New-round button; explore passes nothing). Owns the placard **chrome** (the shared 20rem slab +
responsive grid) so the last duplication dies too. Semantic structure:

```
<aside class="specimen-placard">      (the placard chrome + specimen semantic tokens)
  <h2>{title ?? "? ? ?"}</h2>          one title, one style, owned here
  <figure>
    photo: <img> + <figcaption> credit
    slip:  <div class="shadowbox"><PaperSlip text tilt /></div>
  </figure>
  <dl>                                 the HTML-semantics win
    <dt>Lived</dt><dd>{value ?? "? ? ?"} <span class="detail">…</span></dd>
    <dt>Found in</dt><dd>…</dd>
  </dl>
  <p class="note">{note}</p>           clade summary (explore)
  <a class="wiki">{link.label}</a>
  {@render action?.()}                 game-only New-round button
</aside>
```

### State → view-model

| Context / state        | title     | mount                | fields                     | note        | link |
|------------------------|-----------|----------------------|----------------------------|-------------|------|
| game empty / broad     | `null`    | slip "Coming soon…"  | Lived/Found = `null` (???) | —           | —    |
| game terminal          | `null`    | slip "Coming soon…"  | Lived/Found = **real clue**| —           | —    |
| game solved (genus)    | name      | photo or "missing"   | real clue                  | —           | wiki |
| explore genus          | name      | photo or "missing"   | real clue                  | —           | wiki |
| explore clade          | name      | photo or "missing"   | —                          | genus count | wiki |

Consequence to note: **terminal gains a `? ? ?` title** (it currently shows none), making all three
unidentified states consistent. Accepted.

### Component collapse

`Specimen.svelte` + `NodeDetail.svelte` + `SpecimenCard.svelte` → **one** `SpecimenPlacard.svelte`
+ the two selectors. Callers:

- `GameBoard.svelte`: `<SpecimenPlacard view={specimenView(state, store)}>{#snippet action()}…New round…{/snippet}</SpecimenPlacard>`.
- `Explorer.svelte` / explore: `<SpecimenPlacard view={nodeView(node, store)} />`.

## Testing

- `nodeView` / `specimenView` are pure → **TDD** across: empty, broad, terminal-with-clue, solved
  genus, explore genus, explore clade (note), and no-image (missing slip).
- `SpecimenPlacard` validated by `svelte-check` + build + eyeball. Visual output identical to today.

## Non-goals

- No visual/aesthetic changes — palette, type, spacing all unchanged. (A visuals pass is downstream;
  this refactor is what makes it tractable.)
- No change to the game engine, warmth, or clue data.
