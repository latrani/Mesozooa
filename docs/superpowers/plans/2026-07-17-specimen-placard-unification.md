# Specimen Placard Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the three specimen renderers (`Specimen`, `NodeDetail`, `SpecimenCard`) into one presentational `SpecimenPlacard` driven by a `SpecimenView` view-model from two pure selectors — one title, one card, semantic HTML — with no visual change.

**Architecture:** Two pure selectors (`nodeView`, `specimenView` in `src/lib/game/specimen-view.ts`) map a taxon node / game state into a `SpecimenView` (title, mount, fields, note, link). `SpecimenPlacard.svelte` renders that view-model as semantic HTML (`<h2>`, `<figure>`/`<figcaption>`, `<dl>`) inside the shared placard chrome, with a `Snippet` slot for the game's New-round button. Callers (GameBoard, Explorer, Gallery) build a view and pass it in.

**Tech Stack:** Svelte 5 (runes + snippets), TypeScript, Vitest.

## Global Constraints

- `verbatimModuleSyntax` is ON — every type-only import MUST use `import type`. Vitest does NOT catch violations.
- Before every commit run `npx tsc --noEmit` AND `npx svelte-check --threshold error` — both must be clean (0 errors, 0 warnings).
- Copy rules: no em-dashes in UI copy (commas / restructure; en-dash ranges are fine). Slip text is exactly `Coming soon...` and `Specimen missing`; Wikipedia link label is exactly `Wikipedia ↗`.
- No visual/aesthetic change — palette, type, spacing unchanged. The output must look identical to today (one accepted delta: the `terminal` state gains a `? ? ?` title and loses its clue-section top divider, matching the other states — see Task 4).
- Pure logic is TDD-tested; Svelte components are validated by `svelte-check` + build.

---

## File Structure

- **Create** `src/lib/game/specimen-view.ts` — `SpecimenView` type + `clueFieldsFrom`, `nodeView`, `specimenView` selectors. Pure.
- **Create** `src/lib/game/specimen-view.test.ts` — unit tests for the selectors.
- **Create** `src/lib/game/components/SpecimenPlacard.svelte` — the one presentational placard.
- **Modify** `src/lib/game/components/GameBoard.svelte` — render `SpecimenPlacard` with `specimenView`.
- **Modify** `src/lib/explorer/components/Explorer.svelte` — render `SpecimenPlacard` with `nodeView`.
- **Modify** `src/gallery/Gallery.svelte` — render `SpecimenPlacard` with `specimenView`.
- **Delete** `src/lib/game/components/Specimen.svelte`, `src/lib/explorer/components/NodeDetail.svelte`, `src/lib/game/components/SpecimenCard.svelte`.

`specimenState` (engine-core) and its tests are **kept** — `specimenView` builds on it.

---

## Task 1: `SpecimenView` type + `clueFieldsFrom` + `nodeView`

**Files:**
- Create: `src/lib/game/specimen-view.ts`
- Test: `src/lib/game/specimen-view.test.ts`

**Interfaces:**
- Consumes: `formatCredit` + `CreditDisplay` (`src/lib/image-credits.ts`); `clueFor`, `formatClueAge`, `formatClueLocation` (`src/lib/game/clue.ts`); `displayName` (`src/lib/game/displayName.ts`); `pluralGenera` (`src/lib/game/plural.ts`); `TreeNode` (`src/lib/tree/types.ts`); `GenusAttribute` (`src/lib/attributes.ts`).
- Produces:
  - `type SpecimenMount = { kind: "photo"; url: string; alt: string; credit: CreditDisplay | null } | { kind: "slip"; text: string; tilt: number }`
  - `interface SpecimenField { label: string; value: string | null; detail?: string }`
  - `interface SpecimenView { title: string | null; mount: SpecimenMount; fields: SpecimenField[]; note: string | null; link: { href: string; label: string } | null }`
  - `function clueFieldsFrom(clue: GenusAttribute | null): SpecimenField[]`
  - `function nodeView(node: TreeNode): SpecimenView`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/game/specimen-view.test.ts
import { describe, it, expect } from "vitest";
import { clueFieldsFrom, nodeView } from "./specimen-view";
import type { TreeNode } from "../tree/types";
import type { GenusAttribute } from "../attributes";

function node(over: Partial<TreeNode>): TreeNode {
  return {
    id: "Q1", name: "Testosaurus", rankId: null, parentId: null, childrenIds: [],
    depth: 5, descendantGenusCount: 1, isGenus: true, playable: true, sitelinks: 3,
    ...over,
  };
}

describe("clueFieldsFrom", () => {
  it("returns [] when there is no clue", () => {
    expect(clueFieldsFrom(null)).toEqual([]);
  });
  it("emits a Lived + Found in row with layered detail", () => {
    const clue: GenusAttribute = {
      ageEpoch: "Late Jurassic", ageLabel: "Tithonian", ageStartMa: 152, ageEndMa: 145,
      discoveryLocation: "United States", discoveryState: "Colorado", discoveryFormation: "Morrison",
    };
    expect(clueFieldsFrom(clue)).toEqual([
      { label: "Lived", value: "Late Jurassic", detail: "(Tithonian, 152–145 mya)" },
      { label: "Found in", value: "United States", detail: "(Colorado, Morrison Formation)" },
    ]);
  });
  it("omits a layer that is absent (age only)", () => {
    expect(clueFieldsFrom({ ageEpoch: "Cretaceous" })).toEqual([
      { label: "Lived", value: "Cretaceous", detail: undefined },
    ]);
  });
});

describe("nodeView", () => {
  it("genus with image -> photo mount, title, wiki link", () => {
    const v = nodeView(node({
      id: "Q100196", name: "Archaeopteryx", imageUrl: "/images/Q100196.webp",
      imageAuthor: "Emily Willoughby", imageLicense: "CC BY-SA 4.0",
      imageLicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
      wikipediaUrl: "https://en.wikipedia.org/wiki/Archaeopteryx",
    }));
    expect(v.title).toBe("Archaeopteryx");
    expect(v.mount).toEqual({
      kind: "photo", url: "/images/Q100196.webp", alt: "Archaeopteryx",
      credit: { author: "Emily Willoughby", licenseShort: "CC BY-SA 4.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0" },
    });
    expect(v.note).toBeNull();
    expect(v.link).toEqual({ href: "https://en.wikipedia.org/wiki/Archaeopteryx", label: "Wikipedia ↗" });
  });
  it("genus without image -> 'Specimen missing' slip, no link when no wiki", () => {
    const v = nodeView(node({ id: "Qx", name: "Nopix" }));
    expect(v.mount).toEqual({ kind: "slip", text: "Specimen missing", tilt: 3.5 });
    expect(v.link).toBeNull();
  });
  it("clade -> genus-count note, no fields", () => {
    const v = nodeView(node({ id: "Qc", name: "Theropoda", isGenus: false, descendantGenusCount: 12 }));
    expect(v.fields).toEqual([]);
    expect(v.note).toBe("12 genera in this clade");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/specimen-view.test.ts`
Expected: FAIL — cannot find module `./specimen-view` / `clueFieldsFrom is not a function`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/game/specimen-view.ts
import type { TreeNode } from "../tree/types";
import type { GenusAttribute } from "../attributes";
import type { CreditDisplay } from "../image-credits";
import { formatCredit } from "../image-credits";
import { clueFor, formatClueAge, formatClueLocation } from "./clue";
import { displayName } from "./displayName";
import { pluralGenera } from "./plural";

export type SpecimenMount =
  | { kind: "photo"; url: string; alt: string; credit: CreditDisplay | null }
  | { kind: "slip"; text: string; tilt: number };

export interface SpecimenField {
  label: string;
  value: string | null; // null renders as "? ? ?"
  detail?: string;
}

export interface SpecimenView {
  title: string | null; // null renders as the "? ? ?" heading
  mount: SpecimenMount;
  fields: SpecimenField[];
  note: string | null;
  link: { href: string; label: string } | null;
}

const MISSING_SLIP: SpecimenMount = { kind: "slip", text: "Specimen missing", tilt: 3.5 };

// Map a genus clue to Lived / Found in rows, omitting a layer that is absent. A present
// row's `value` is the coarse lead; `detail` is the parenthesised finer layer (or undefined).
export function clueFieldsFrom(clue: GenusAttribute | null): SpecimenField[] {
  if (!clue) return [];
  const fields: SpecimenField[] = [];
  const age = formatClueAge(clue);
  if (age) fields.push({ label: "Lived", value: age.lead, detail: age.detail || undefined });
  const place = formatClueLocation(clue);
  if (place) fields.push({ label: "Found in", value: place.lead, detail: place.detail || undefined });
  return fields;
}

// A fully identified taxon (genus or clade). Used by Explore and game-solved.
export function nodeView(node: TreeNode): SpecimenView {
  const mount: SpecimenMount = node.imageUrl
    ? {
        kind: "photo",
        url: node.imageUrl,
        alt: displayName(node.name),
        credit: formatCredit({
          author: node.imageAuthor,
          licenseShort: node.imageLicense,
          licenseUrl: node.imageLicenseUrl,
        }),
      }
    : MISSING_SLIP;
  return {
    title: displayName(node.name),
    mount,
    fields: node.isGenus ? clueFieldsFrom(clueFor(node.id)) : [],
    note: node.isGenus ? null : `${pluralGenera(node.descendantGenusCount)} in this clade`,
    link: node.wikipediaUrl ? { href: node.wikipediaUrl, label: "Wikipedia ↗" } : null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/specimen-view.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/specimen-view.ts src/lib/game/specimen-view.test.ts
git commit -m "feat(specimen): SpecimenView + nodeView/clueFieldsFrom selectors"
```

---

## Task 2: `specimenView` (game states)

**Files:**
- Modify: `src/lib/game/specimen-view.ts`
- Test: `src/lib/game/specimen-view.test.ts`

**Interfaces:**
- Consumes: `specimenState` + `SpecimenState` (`src/lib/game/engine-core.ts`); `GameState` (`src/lib/game/types.ts`); `TreeStore` (`src/lib/game/treeStore.ts`); plus `nodeView`, `clueFieldsFrom` from Task 1.
- Produces: `function specimenView(state: GameState, store: TreeStore): SpecimenView`

**Behavior:** `empty`/`broad` → unidentified placeholder (`title:null`, `Coming soon...` slip, two `? ? ?` fields, no note/link). `terminal` → same placeholder, EXCEPT the fields carry the real clue once the player has taken the leaf hint (a `leafHint` row exists), matching today's reveal gating. `solved` → `nodeView(target node)`.

- [ ] **Step 1: Write the failing test** (append to `src/lib/game/specimen-view.test.ts`)

```ts
import { specimenView } from "./specimen-view";
import { applyGuess, applyHint } from "./engine-core";
import { createTreeStore } from "./treeStore";
import { createCountWarmth } from "./warmth";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";
import type { GameState } from "./types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);
const warmth = createCountWarmth(store.rootCount);
const practice = (target: string): GameState => ({
  target, guesses: [], status: "playing", mode: "practice", maxGuesses: null, hintsUsed: 0,
});

describe("specimenView", () => {
  it("empty -> unidentified placeholder", () => {
    const v = specimenView(practice("TC"), store);
    expect(v.title).toBeNull();
    expect(v.mount).toEqual({ kind: "slip", text: "Coming soon...", tilt: -4 });
    expect(v.fields).toEqual([
      { label: "Lived", value: null },
      { label: "Found in", value: null },
    ]);
    expect(v.link).toBeNull();
  });
  it("solved -> delegates to nodeView (title = the taxon name)", () => {
    const won = applyGuess(practice("TC"), "TC", store, warmth); // guess == target -> won
    expect(won.status).toBe("won");
    const v = specimenView(won, store);
    expect(v.title).toBe(store.getNode("TC")!.name);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/game/specimen-view.test.ts`
Expected: FAIL — `specimenView is not a function`.

- [ ] **Step 3: Write minimal implementation** (add imports + function to `src/lib/game/specimen-view.ts`)

Add exactly these to the import block (`clueFor` is already imported from Task 1 — do NOT re-import it):

```ts
import type { GameState } from "./types";
import type { TreeStore } from "./treeStore";
import { specimenState } from "./engine-core";
```

Add the function and a shared constant:

```ts
const COMING_SLIP: SpecimenMount = { kind: "slip", text: "Coming soon...", tilt: -4 };

// The two "? ? ?" clue rows shown before the specimen is identified.
function placeholderFields(): SpecimenField[] {
  return [
    { label: "Lived", value: null },
    { label: "Found in", value: null },
  ];
}

// The game's specimen across its states. Unidentified states share one placeholder view; the
// terminal state reveals the real clue once the leaf hint has been taken (same gating as before).
export function specimenView(state: GameState, store: TreeStore): SpecimenView {
  const s = specimenState(state, store);
  if (s.kind === "solved") return nodeView(store.getNode(s.targetId)!);
  const clueRevealed = state.guesses.some((g) => g.kind === "leafHint");
  const fields =
    s.kind === "terminal" && clueRevealed ? clueFieldsFrom(clueFor(state.target)) : placeholderFields();
  return { title: null, mount: COMING_SLIP, fields, note: null, link: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/game/specimen-view.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/specimen-view.ts src/lib/game/specimen-view.test.ts
git commit -m "feat(specimen): specimenView selector for game states"
```

---

## Task 3: `SpecimenPlacard.svelte`

**Files:**
- Create: `src/lib/game/components/SpecimenPlacard.svelte`

**Interfaces:**
- Consumes: `SpecimenView` (Task 1); `PaperSlip.svelte`; `Snippet` (from `svelte`).
- Produces: a component with props `{ view: SpecimenView; action?: Snippet }`.

This is presentational only — no tests; validated by typecheck + build. The CSS is the union of the old `.specimen` (chrome + responsive grid, from `Specimen.svelte`) and `SpecimenCard` (figure/photo/credit) styling, with the `:global` color overrides from `NodeDetail` folded in as direct rules. Field rows use a `<dl>` with per-row `<div>` groups (valid HTML5) styled inline (`Label: value`) to match today's look.

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/game/components/SpecimenPlacard.svelte -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { SpecimenView } from "../specimen-view";
  import PaperSlip from "./PaperSlip.svelte";

  let { view, action }: { view: SpecimenView; action?: Snippet } = $props();
</script>

<aside class="specimen-placard" aria-label="Specimen">
  <h2 class="title">{view.title ?? "? ? ?"}</h2>

  <figure class="figure">
    <div class="shadowbox" class:empty={view.mount.kind !== "photo"}>
      {#if view.mount.kind === "photo"}
        <img class="photo" src={view.mount.url} alt={view.mount.alt} />
      {:else}
        <PaperSlip text={view.mount.text} tilt={view.mount.tilt} />
      {/if}
    </div>
    {#if view.mount.kind === "photo" && view.mount.credit}
      {@const credit = view.mount.credit}
      <figcaption class="credit">
        <span class="credit-author" title={credit.author ?? "Wikimedia Commons"}>{credit.author ?? "Wikimedia Commons"}</span>{#if credit.licenseShort}<span class="credit-license"> · {#if credit.licenseUrl}<a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.licenseShort}</a>{:else}{credit.licenseShort}{/if}</span>{/if}
      </figcaption>
    {/if}
  </figure>

  {#if view.fields.length}
    <dl class="fields">
      {#each view.fields as f (f.label)}
        <div class="field">
          <dt>{f.label}</dt>
          <dd>{f.value ?? "? ? ?"}{#if f.detail}<span class="detail">{f.detail}</span>{/if}</dd>
        </div>
      {/each}
    </dl>
  {/if}

  {#if view.note}<p class="note">{view.note}</p>{/if}

  {#if view.link}
    <a class="wiki" href={view.link.href} target="_blank" rel="noopener noreferrer">{view.link.label}</a>
  {/if}

  {@render action?.()}
</aside>

<style>
  .specimen-placard {
    display: flex; flex-direction: column; gap: var(--space-3);
    flex: 0 0 20rem; width: 20rem;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border: 1px solid var(--specimen-edge); border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    padding: var(--space-5); color: var(--specimen-text);
    --btn-secondary-ink: var(--cream);
  }
  .title { font-size: var(--type-h); font-weight: var(--fw-bold); }
  .figure { margin: 0; display: flex; flex-direction: column; gap: 2px; }
  .shadowbox {
    border-radius: 5px; position: relative; overflow: hidden;
    background: radial-gradient(120% 120% at 50% 30%, #f3e6cf 0%, #e3cba6 100%);
    box-shadow: inset 0 3px 8px rgba(95,44,30,.45), inset 0 -2px 4px rgba(255,255,255,.4);
    border: 3px solid var(--specimen-edge);
  }
  .shadowbox.empty { height: 8.5rem; }
  .photo { display: block; width: 100%; height: auto; }
  .fields { margin: 0; display: flex; flex-direction: column; gap: var(--space-1); }
  .field { font-size: var(--type-body); color: var(--specimen-text); }
  .field dt { display: inline; font-weight: var(--fw-bold); }
  .field dt::after { content: ": "; }
  .field dd { display: inline; margin: 0; }
  .field .detail { display: block; opacity: .72; font-size: var(--type-label); }
  .note { color: var(--specimen-text-dim); font-size: var(--type-body); }
  .wiki { font-weight: var(--fw-semibold); font-size: var(--type-label); align-self: flex-start; color: var(--sand-200); }
  /* image credit — small, understated provenance; hugs the photo via the figure's 2px gap. */
  .credit { margin: 0; font-size: var(--type-meta); opacity: .55; display: flex; max-width: 100%; }
  .credit-author { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
  .credit-license { white-space: nowrap; flex: none; }
  .credit a { color: inherit; text-decoration: underline; }
  .actions, :global(.specimen-placard .actions) { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-1); }

  @media (max-width: 640px) {
    /* compact horizontal placard: fixed shadow-box left, everything else stacked right. */
    .specimen-placard {
      width: 100%; display: grid; grid-template-columns: auto 1fr;
      gap: 0 var(--space-3); align-items: center; padding: .6rem .7rem;
    }
    .figure { grid-column: 1; grid-row: 1 / span 4; align-self: center; margin: 0; }
    .shadowbox { width: 84px; height: 64px; }
    .specimen-placard > :not(.figure) { grid-column: 2; align-self: center; }
  }
</style>
```

- [ ] **Step 2: Typecheck + component check**

Run: `npx svelte-check --threshold error && npx tsc --noEmit`
Expected: clean (0 errors, 0 warnings). The component is not wired yet, so nothing renders it — that is fine.

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/SpecimenPlacard.svelte
git commit -m "feat(specimen): SpecimenPlacard presentational component"
```

---

## Task 4: Wire callers + delete the three old components

**Files:**
- Modify: `src/lib/game/components/GameBoard.svelte`
- Modify: `src/lib/explorer/components/Explorer.svelte`
- Modify: `src/gallery/Gallery.svelte`
- Delete: `src/lib/game/components/Specimen.svelte`, `src/lib/explorer/components/NodeDetail.svelte`, `src/lib/game/components/SpecimenCard.svelte`

**Interfaces:**
- Consumes: `specimenView`, `nodeView` (Tasks 1–2); `SpecimenPlacard.svelte` (Task 3).

- [ ] **Step 1: GameBoard — swap `Specimen` for `SpecimenPlacard`**

In `src/lib/game/components/GameBoard.svelte`:

Replace the import line `import Specimen from "./Specimen.svelte";` with:

```svelte
import SpecimenPlacard from "./SpecimenPlacard.svelte";
import { specimenView } from "../specimen-view";
```

Replace the block:

```svelte
    <div class="specimen-float" bind:clientWidth={specimenW}>
      <Specimen {specimen} clue={store.clue} {onnew} />
    </div>
```

with (New-round button moves into the `action` snippet, shown only on the end state):

```svelte
    <div class="specimen-float" bind:clientWidth={specimenW}>
      <SpecimenPlacard view={specimenView(store.state, treeStore)}>
        {#snippet action()}
          {#if ended && onnew}
            <div class="actions">
              <button type="button" class="btn-secondary" onclick={() => onnew?.()}>New round</button>
            </div>
          {/if}
        {/snippet}
      </SpecimenPlacard>
    </div>
```

The `specimen` derived (`let specimen = $derived(specimenState(...))`) and the now-unused `specimenState` import can be removed IF nothing else in the file uses them — grep first: `grep -n "specimen\b\|specimenState" src/lib/game/components/GameBoard.svelte`. Remove only the unused `specimen` derived + its import; keep anything still referenced.

- [ ] **Step 2: Explorer — swap `NodeDetail` for `SpecimenPlacard`**

In `src/lib/explorer/components/Explorer.svelte`:

Replace `import NodeDetail from "./NodeDetail.svelte";` with:

```svelte
import SpecimenPlacard from "../../game/components/SpecimenPlacard.svelte";
import { nodeView } from "../../game/specimen-view";
```

Replace `<NodeDetail taxonId={explorer.highlightId} />` with:

```svelte
{#if treeStore.getNode(explorer.highlightId)}
  <SpecimenPlacard view={nodeView(treeStore.getNode(explorer.highlightId)!)} />
{/if}
```

(`treeStore` is already imported in Explorer — confirm with `grep -n "treeStore" src/lib/explorer/components/Explorer.svelte`; if not, add `import { treeStore } from "../../game/treeData";`.)

- [ ] **Step 3: Gallery — swap `Specimen` for `SpecimenPlacard`**

In `src/gallery/Gallery.svelte`:

Replace `import Specimen from "../lib/game/components/Specimen.svelte";` with:

```svelte
import SpecimenPlacard from "../lib/game/components/SpecimenPlacard.svelte";
import { specimenView } from "../lib/game/specimen-view";
import { treeStore } from "../lib/game/treeData";
```

(If `treeStore` is already imported in Gallery, don't duplicate it — grep first.)

Replace the block:

```svelte
            <Specimen
              specimen={specimenOf(s.state)}
              clue={s.state.status === "playing" ? clueFor(s.state.target) : null}
              onnew={() => {}}
            />
```

with:

```svelte
            <SpecimenPlacard view={specimenView(s.state, treeStore)}>
              {#snippet action()}
                {#if s.state.status !== "playing"}
                  <div class="actions">
                    <button type="button" class="btn-secondary" onclick={() => {}}>New round</button>
                  </div>
                {/if}
              {/snippet}
            </SpecimenPlacard>
```

After this, `specimenOf` / `clueFor` imports in Gallery may be unused — grep (`grep -n "specimenOf\|clueFor" src/gallery/Gallery.svelte`) and remove any import that is now unreferenced.

- [ ] **Step 4: Delete the three replaced components**

```bash
git rm src/lib/game/components/Specimen.svelte \
       src/lib/explorer/components/NodeDetail.svelte \
       src/lib/game/components/SpecimenCard.svelte
```

- [ ] **Step 5: Typecheck, component check, build**

Run: `npx svelte-check --threshold error && npx tsc --noEmit && npm run build`
Expected: clean (0 errors, 0 warnings); build succeeds. If svelte-check reports an unused import or a dangling reference to a deleted component, fix it (remove the import / reference) and re-run.

- [ ] **Step 6: Full test suite**

Run: `npx vitest run`
Expected: all pass (engine + specimen-view).

- [ ] **Step 7: Eyeball on the gallery** (controller/human)

Start `npm run dev` and open `/gallery.html` → "Specimen — all states". Confirm each state matches today: empty/broad show `? ? ?` title + "Coming soon..." slip + two `? ? ?` field rows; solved shows the name + photo (or "Specimen missing" slip) + real clue + Wikipedia; and the Explore tab's placard is unchanged. (Accepted deltas: `terminal` now shows a `? ? ?` title and no clue-section divider.)

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(specimen): unify Specimen/NodeDetail/SpecimenCard into SpecimenPlacard"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** view-model (Task 1), selectors (Tasks 1–2), placard + semantic HTML (Task 3), title owned by card + one component + collapse (Tasks 3–4), state→view table (Tasks 1–2 tests), TDD on selectors (Tasks 1–2), no-visual-change (Task 4 eyeball). All covered.
- **`specimenState` disposition:** kept (reused by `specimenView`); its engine-core tests are untouched.
- **Type consistency:** `SpecimenView`/`SpecimenMount`/`SpecimenField` names used identically across the component and both selectors; `nodeView(node)` takes no store; `specimenView(state, store)` takes the store.
