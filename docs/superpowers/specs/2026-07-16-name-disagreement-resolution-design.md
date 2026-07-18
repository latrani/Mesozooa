# Mesozooa — Name Disagreement Resolution Design

**Date:** 2026-07-16
**Status:** Approved (brainstorm), pending implementation plan

## Problem

Node display names come from the Wikidata `en` label, seeded with the Q-id as a placeholder and
overwritten only if an `en` label exists (`fetch-wikidata.ts`). Two failure modes ship bad names:

1. **No `en` label → bare Q-id.** 14–17 nodes render as `Q131043` etc. Notably **Troodon**
   (`Q131043`) — a marquee genus — is a bare Q-id because its Wikidata item lacks an `en` label,
   even though its taxon-name property (`P225`) says "Troodon".
2. **`en` disagrees with other sources.** An audit of all ~2200 nodes (en vs P225 vs enwiki title)
   found 17 mismatches. Some are `en` typos (Carnottaurus; P225+enwiki agree on Carnotaurus),
   some are `P225` typos (Iguaonodontia; en+enwiki agree on Iguanodontia), some are vernacular
   vs scientific (`bird` vs `Aves`), some are binomial-vs-genus formatting (`Drinker nisti` vs
   `Drinker`), and some are live **taxonomic disputes** (`Stygimoloch` vs `Pachycephalosaurus`).

Today this is patched by one hardcoded entry: `LABEL_OVERRIDES = { Q18510948: "Carnotaurus" }`
in `dedupe.ts`. That doesn't scale, and no signal surfaces new disagreements as data drifts.

**Goal:** generalize to a system that (a) recovers names from `P225` when `en` is absent, (b)
detects name disagreements at build time and **fails the build** on any undecided one, (c) records
all disagreements to a committed report, and (d) resolves them via a human-curated decisions map.

## Key facts (verified)

- No single source is authoritative: `en`, `P225`, and the enwiki title each carry typos in
  different rows. Fix must be curation, not "switch to P225".
- **28% of named nodes' enwiki articles redirect** — almost all benign clade-granularity
  (`Neotheropoda → Theropoda`: Wikipedia lacks a separate article per cladogram rung). Only
  genus→different-genus redirects (`Stygimoloch → Pachycephalosaurus`) signal a taxonomy issue.
  Therefore **redirects are advisory only, never blocking** (a blocking rule would leave the
  build permanently red on ~500 benign redirects).
- `fetch-wikidata.ts` enrich SPARQL currently pulls only the `en` label, image, article URL,
  sitelinks — NOT `P225` or the enwiki *title*.
- `LABEL_OVERRIDES` (`src/lib/tree/dedupe.ts`) is applied BEFORE dedupe (the Carnotaurus rename
  must precede case-dedupe so the lowercase ghost merges). This ordering must be preserved.

## Design

Two concerns, split by network access.

### A. Detection — fetch-time (`scripts/fetch-wikidata.ts`)

Only the fetch has network access, so it's the only place that can gather the name signals.
Extend the enrich SPARQL to also select:
- `?taxonName` via `OPTIONAL { ?taxon wdt:P225 ?taxonName }` (taxon name / scientific name).
- the enwiki **title** — derive from the existing `?article` URL (decode the last path segment)
  or add an explicit title binding.

Persist per node in `raw-taxa.json` (new optional `RawTaxon` fields):
- `name` — the `en` label (unchanged; still the Q-id placeholder when absent).
- `taxonName?` — P225.
- `enwikiTitle?` — the enwiki article title.

**Redirects (advisory):** after enrichment, batch-resolve the enwiki titles through the
Wikipedia API (`action=query&redirects=1`) and store `redirectTarget?` when the article
redirects. Used only as report context; never affects the build's pass/fail.

### B. Adjudication — build-time, pure (`src/lib/tree/names.ts`, new)

A pure module consumed by `build:data`. For each node, gather the **distinct present name
candidates** among `{ name (en), taxonName (P225), enwikiTitle }` (absent/empty ones dropped;
compared as trimmed strings, NO case- or space-folding — those differences are what we want to
surface).

- **0–1 distinct candidate** → resolve silently to the single candidate (or keep the Q-id
  placeholder if truly none). Recovers Troodon (only P225 present).
- **≥2 distinct candidates** → a **conflict**. If the Q-id is in `NAME_DECISIONS`, use the
  decided name. Otherwise collect it as an **undecided conflict**.

After all nodes: if any undecided conflicts remain, **write the report and fail the build**
(non-zero exit) with the count + report path. A Q-id present in `NAME_DECISIONS` short-circuits
detection entirely (the decision IS the resolution) and never blocks.

### C. Decisions map (`src/lib/tree/name-decisions.ts`, replaces `LABEL_OVERRIDES`)

```ts
export const NAME_DECISIONS: Record<string, { name: string; note: string }> = {
  Q18510948: { name: "Carnotaurus", note: "en typo 'Carnottaurus'; P225+enwiki agree" },
  Q5113:     { name: "Aves",        note: "en/enwiki vernacular 'bird'; scientific clade name" },
  // …one entry per resolved disagreement
};
```

Resolved name = `NAME_DECISIONS[id]?.name ?? <single agreed candidate>`. `note` is provenance,
never rendered. Applied as the rename step feeding dedupe (preserving the current
apply-before-dedupe ordering `LABEL_OVERRIDES` had), so `dedupe.ts` imports `NAME_DECISIONS`
in place of `LABEL_OVERRIDES`.

### D. Report (`data/name-disagreements.md`, COMMITTED)

Regenerated deterministically on each `build:data` (stable sort by Q-id, no timestamps, so the
diff changes only when the disagreement set changes). One row per **undecided** conflict:

```
Q131161  en="Pachycephalosaurus spinifer"  P225="Stygimoloch"  enwiki="Stygimoloch"  ↳redirects→Pachycephalosaurus
```

Redirect target inline as advisory context. Decided conflicts are NOT listed (they're resolved);
optionally a short "resolved (N)" footer for provenance.

## Seed decisions (from the audit — apply so the first post-change build is green)

Evidence-backed by ≥2-source agreement + enwiki tie-breaker + etymology:

- **P225+enwiki win (en typo):** `Q18510948` Carnotaurus, `Q132857` Mussaurus.
- **en+enwiki win (P225 typo):** these still need an explicit decision — en vs P225 differ, which
  IS a conflict, so we must record the pick (`en`) rather than assume it: `Q134190` Iguanodontia,
  `Q77853179` Colossosauria, `Q3349337` Odontornithes, `Q3079242` Rhadinosaurus.
- **vernacular→scientific:** `Q5113` Aves.
- **binomial/string→genus (no-space preference):** `Q131236` Prosauropoda, `Q134751` Drinker,
  `Q593763` Zanabazar, `Q6126872` Shanshanosaurus, `Q5028563` Camptodontus.
- **P225 double-name, keep en:** `Q62397920` Eutyrannosauria.
- **taxonomy disputes — resolve toward the currently-accepted taxon (the Wikipedia redirect
  target is a good proxy for "where a curious player lands"):** `Q131161`
  Pachycephalosaurus spinifer→ decide (redirect target Pachycephalosaurus; per user, Stygimoloch
  "not a thing"), `Q16975532` Camarasaurus lewisi (redirect target), `Q134591` (redirect target
  Altispinax), `Q988566` (redirect target Dornraptor — its own article).

Exact chosen strings finalized during implementation against a fresh fetch (the audit was a
point-in-time snapshot; the build's own report is the source of truth for what must be decided).

## Out of scope

- Auto-merging synonym nodes flagged by genus→genus redirects (a tree-STRUCTURE change / dedupe
  concern, not a label decision). Redirects stay advisory here.
- Changing the ranked pool, playable logic, or any game behavior.
- Retroactive historical-daily stability (names changing can't shift past daily targets — those
  key on id, not name).

## Files touched

- `scripts/fetch-wikidata.ts` — enrich SPARQL adds P225 + enwiki title; redirect resolution pass.
- `src/lib/tree/types.ts` — `RawTaxon` gains optional `taxonName`, `enwikiTitle`, `redirectTarget`.
- `src/lib/tree/names.ts` (new) — pure candidate-gathering + conflict detection + resolution.
- `src/lib/tree/name-decisions.ts` (new) — `NAME_DECISIONS` map (replaces `LABEL_OVERRIDES`).
- `src/lib/tree/dedupe.ts` — import `NAME_DECISIONS`; apply-before-dedupe unchanged.
- `scripts/build-tree.ts` — invoke adjudication; write report; fail on undecided conflicts.
- `data/name-disagreements.md` (new, committed) — the report.
- Tests: `names.test.ts` (candidate/conflict/resolution logic), `dedupe.test.ts` (update for the
  new decisions shape).
- Requires a `fetch:wikidata` → `build:data` re-run to land the new raw fields + regenerate.
