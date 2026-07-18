# Shared SpecimenCard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract one content-only `SpecimenCard` (image → genus clues | clade count → wiki) shared by the game's solved specimen and Explore's detail card, and fill the game's solved shadow-box with the specimen image.

**Architecture:** `SpecimenCard(nodeId)` renders taxon content for any node; the two hosts own their own chrome (game: shadow-box frame + answer name + CTAs; Explore: placard + heading). A tiny TDD'd `pluralGenera` helper fixes the "1 genera" bug. `TaxonCard` is deleted.

**Tech Stack:** Svelte 5 (runes) + TypeScript + Vite. Tests: Vitest. Checks: `npx tsc --noEmit`, `npx svelte-check`.

## Global Constraints

- `verbatimModuleSyntax` is ON — type-only imports MUST use `import type`. Vitest does NOT catch this; run `npx svelte-check --threshold error` before every commit.
- Pure logic is TDD-tested; Svelte components are validated by `svelte-check` + `npm run build` + live run. No component unit tests.
- Content model is fixed: genus → image, clues (`Lived:` / `Found in:`, each only if present), wikipedia; clade → image, `N genera in this clade` (pluralized), wikipedia. No lineage breadcrumb. No "no data" note for clue-less genera (omit silently). No unplayable-placement note.
- Do not change the game's unidentified states (`empty` / `broad` / `terminal`) — only the `solved` branch.
- Match surrounding code style; no unrelated refactors.

---

### Task 1: `pluralGenera` helper

**Files:**
- Create: `src/lib/game/plural.ts`
- Test: `src/lib/game/plural.test.ts`

**Interfaces:**
- Produces: `pluralGenera(n: number): string` — `"1 genus"` for n===1, otherwise `"<n> genera"`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/game/plural.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { pluralGenera } from "./plural";

describe("pluralGenera", () => {
  it("uses the singular for exactly one", () => {
    expect(pluralGenera(1)).toBe("1 genus");
  });
  it("uses the plural for zero and many", () => {
    expect(pluralGenera(0)).toBe("0 genera");
    expect(pluralGenera(2)).toBe("2 genera");
    expect(pluralGenera(674)).toBe("674 genera");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/game/plural.test.ts`
Expected: FAIL — `pluralGenera is not a function` / cannot find module `./plural`.

- [ ] **Step 3: Implement**

Create `src/lib/game/plural.ts`:

```ts
// "1 genus" / "N genera" — the count label used by clade cards and specimen readouts.
export function pluralGenera(n: number): string {
  return `${n} ${n === 1 ? "genus" : "genera"}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/game/plural.test.ts`
Expected: PASS (3 assertions green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/plural.ts src/lib/game/plural.test.ts
git commit -m "feat: pluralGenera helper (1 genus / N genera)"
```

---

### Task 2: `SpecimenCard` component

**Files:**
- Create: `src/lib/game/components/SpecimenCard.svelte`

**Interfaces:**
- Consumes: `treeStore` (`getNode(id): TreeNode | undefined` with `.imageUrl?`, `.wikipediaUrl?`, `.isGenus`, `.descendantGenusCount`, `.name`), `clueFor(id): GenusAttribute | null` from `../clue`, `pluralGenera` from `../plural`, `displayName` from `../displayName`.
- Produces: `SpecimenCard` component, prop `nodeId: string`. Renders content only — image (if any), then genus clues OR clade count, then wikipedia link (if any). No title, no lineage, no actions.

- [ ] **Step 1: Create the component**

Create `src/lib/game/components/SpecimenCard.svelte`:

```svelte
<script lang="ts">
  import { treeStore } from "../treeData";
  import { clueFor } from "../clue";
  import { pluralGenera } from "../plural";
  import { displayName } from "../displayName";

  let { nodeId }: { nodeId: string } = $props();

  let node = $derived(treeStore.getNode(nodeId));
  let clue = $derived(node?.isGenus ? clueFor(nodeId) : null);
</script>

<div class="specimen-card">
  {#if node?.imageUrl}
    <img class="photo" src={node.imageUrl} alt={displayName(node.name)} />
  {/if}

  {#if node?.isGenus}
    {#if clue}
      <div class="clue" aria-label="Field data">
        {#if clue.ageLabel}
          <span class="field"><b>Lived:</b> {clue.ageLabel}{#if clue.ageStartMa != null && clue.ageEndMa != null} (~{clue.ageStartMa}–{clue.ageEndMa} Ma){/if}</span>
        {/if}
        {#if clue.discoveryLocation}
          <span class="field"><b>Found in:</b> {clue.discoveryLocation}</span>
        {/if}
      </div>
    {/if}
  {:else if node}
    <p class="count">{pluralGenera(node.descendantGenusCount)} in this clade</p>
  {/if}

  {#if node?.wikipediaUrl}
    <a class="wiki" href={node.wikipediaUrl} target="_blank" rel="noopener noreferrer">Wikipedia ↗</a>
  {/if}
</div>

<style>
  /* Content-only block; hosts provide chrome + color context. Text/link colors are inherited
     so this reads correctly on both the light Explore placard and the dark specimen placard
     (hosts set color / link overrides in their own scope). */
  .specimen-card { display: flex; flex-direction: column; gap: var(--space-2); }
  .photo { max-width: 100%; border-radius: var(--radius-card); border: 1px solid var(--hairline); display: block; }
  .clue { display: flex; flex-direction: column; gap: var(--space-1); }
  .field { font-size: var(--type-body); }
  .field b { font-weight: var(--fw-bold); }
  .count { font-size: var(--type-body); }
  .wiki { font-weight: var(--fw-semibold); font-size: var(--type-label); align-self: flex-start; }
</style>
```

- [ ] **Step 2: Verify types + build**

Run: `npx svelte-check --threshold error`
Expected: `0 ERRORS`.
Run: `npm run build > /tmp/mzbuild.log 2>&1 && echo OK || tail -20 /tmp/mzbuild.log`
Expected: `OK`. (Component isn't mounted yet; this just confirms it compiles.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/game/components/SpecimenCard.svelte
git commit -m "feat: shared SpecimenCard content block (image / clue|count / wiki)"
```

---

### Task 3: Explore host — embed SpecimenCard, delete TaxonCard

**Files:**
- Modify: `src/lib/explorer/components/NodeDetail.svelte`
- Delete: `src/lib/game/components/TaxonCard.svelte`

**Interfaces:**
- Consumes: `SpecimenCard` (Task 2), `pluralGenera` no longer needed here (card owns the count), `treeStore` for the heading name.

- [ ] **Step 1: Rewrite NodeDetail to use SpecimenCard + a host heading**

Replace the entire contents of `src/lib/explorer/components/NodeDetail.svelte` with:

```svelte
<script lang="ts">
  import { treeStore } from "../../game/treeData";
  import { displayName } from "../../game/displayName";
  import SpecimenCard from "../../game/components/SpecimenCard.svelte";

  let { taxonId }: { taxonId: string } = $props();

  let node = $derived(treeStore.getNode(taxonId));
</script>

<aside class="node-detail">
  <h2>{displayName(node?.name)}</h2>
  <SpecimenCard nodeId={taxonId} />
</aside>

<style>
  .node-detail {   /* same 'specimen' role — reads the specimen semantic tokens */
    flex: 0 0 20rem; width: 20rem;
    background: linear-gradient(var(--specimen-surface), var(--specimen-dp));
    border: 1px solid var(--specimen-edge); border-radius: var(--radius-card);
    box-shadow: var(--shadow-placard), var(--inset-hi);
    padding: var(--space-5); color: var(--specimen-text);
    display: flex; flex-direction: column; gap: var(--space-3);
  }
  .node-detail h2 { font-size: var(--type-h); font-weight: var(--fw-bold); color: var(--specimen-text); }
  /* card text/links read on the dark placard */
  .node-detail :global(.specimen-card) { color: var(--specimen-text); }
  .node-detail :global(.specimen-card .wiki) { color: var(--sand-200); }
  .node-detail :global(.specimen-card .count) { color: var(--specimen-text-dim); }
</style>
```

- [ ] **Step 2: Delete TaxonCard**

```bash
git rm src/lib/game/components/TaxonCard.svelte
```

- [ ] **Step 3: Verify nothing else referenced TaxonCard, types + build**

Run: `grep -rn "TaxonCard" src`
Expected: no output (NodeDetail was the only consumer).
Run: `npx svelte-check --threshold error`  → `0 ERRORS`.
Run: `npm run build > /tmp/mzbuild.log 2>&1 && echo OK || tail -20 /tmp/mzbuild.log`  → `OK`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/explorer/components/NodeDetail.svelte
git commit -m "feat(explorer): NodeDetail uses shared SpecimenCard; delete TaxonCard"
```

---

### Task 4: Game host — fill solved shadow-box with image, embed SpecimenCard

**Files:**
- Modify: `src/lib/game/components/Specimen.svelte`

**Interfaces:**
- Consumes: `SpecimenCard` (Task 2), `treeStore` (already imported).
- The `empty` / `broad` / `terminal` branches and all their styles are UNCHANGED. Only the `solved` (`:else`) branch and the `.shadowbox.solved` visual change.

- [ ] **Step 1: Add the import**

In `src/lib/game/components/Specimen.svelte`, add to the `<script>` imports (below the existing imports):

```ts
  import SpecimenCard from "./SpecimenCard.svelte";
```

- [ ] **Step 2: Compute the solved target's node (for its image)**

In the `<script>`, alongside the existing `answerName` derived, add:

```ts
  let solvedNode = $derived(
    specimen.kind === "solved" ? treeStore.getNode(specimen.targetId) : undefined,
  );
```

- [ ] **Step 3: Replace the solved branch markup**

Replace the current solved branch (the `{:else}` block that renders eyebrow / `.shadowbox.solved` / `.answer` / `.count` / `.actions`) with:

```svelte
  {:else}
    <span class="eyebrow">Specimen · identified</span>
    <div class="shadowbox solved">
      {#if solvedNode?.imageUrl}
        <img class="specimen-photo" src={solvedNode.imageUrl} alt={answerName} />
      {:else}
        <span class="qmarks">? ? ?</span>
      {/if}
    </div>
    <p class="answer">{answerName}</p>
    <p class="count">{specimen.outcome === "won" ? "Solved" : "Out of guesses"} in {specimen.guessCount} {specimen.guessCount === 1 ? "guess" : "guesses"}</p>
    <SpecimenCard nodeId={specimen.targetId} />
    <div class="actions">
      {#if onexplore}<button type="button" class="btn-primary" onclick={() => onexplore?.(specimen.targetId)}>Explore around {answerName} ▸</button>{/if}
      {#if onnew}<button type="button" class="btn-secondary" onclick={() => onnew?.()}>New round</button>{/if}
    </div>
  {/if}
```

- [ ] **Step 4: Add solved-image + card color styles**

In the `<style>` block, after the `.shadowbox` rule, add:

```css
  .shadowbox.solved { padding: 0; }
  .specimen-photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
```

And after the `.clue-field` rules (which the unidentified/terminal branch still uses), add card-on-dark-placard overrides:

```css
  /* solved: the shared card reads on the dark specimen placard */
  .specimen :global(.specimen-card) { color: var(--specimen-text); }
  .specimen :global(.specimen-card .wiki) { color: var(--sand-200); }
  .specimen :global(.specimen-card .count) { color: var(--specimen-text-dim); }
```

- [ ] **Step 5: Verify types + build**

Run: `npx svelte-check --threshold error`  → `0 ERRORS`.
Run: `npm run build > /tmp/mzbuild.log 2>&1 && echo OK || tail -20 /tmp/mzbuild.log`  → `OK`.
Run: `npx vitest run`  → all pass (no engine change; existing suite stays green).

- [ ] **Step 6: Commit**

```bash
git add src/lib/game/components/Specimen.svelte
git commit -m "feat(game): solved specimen fills shadow-box with image + shared SpecimenCard"
```

---

## Self-Review

**Spec coverage:**
- Content-only `SpecimenCard(nodeId)`, image → genus clue | clade count → wiki, no title/lineage/actions → Task 2. ✓
- Genus clue: `Lived:`/`Found in:` each only if present; omit whole section if no clue → Task 2 markup. ✓
- Clade: pluralized `N genera in this clade` (fixes "1 genera") → Task 1 helper + Task 2 usage. ✓
- Game solved: image fills shadow-box, `? ? ?` fallback when no image → Task 4 Steps 3–4. ✓
- Game unidentified states unchanged → Task 4 touches only the `:else` branch + `.shadowbox.solved`. ✓
- Explore host: plain heading + card, placard kept, `--specimen-text`/`--sand-200` overrides → Task 3. ✓
- Lineage breadcrumb dropped; unplayable-note dropped → Task 3 (NodeDetail rewrite omits both). ✓
- `TaxonCard` deleted → Task 3 Step 2. ✓
- Card reads on both light (Explore uses specimen placard = dark; note both hosts here are dark placards, so a single `--specimen-text` override in each host covers it) and dark → Task 3/4 host overrides. ✓

**Placeholder scan:** none — every code step shows full content.

**Type consistency:** `pluralGenera(n: number): string` defined Task 1, used Task 2. `SpecimenCard` prop `nodeId: string` defined Task 2, passed as `nodeId={taxonId}` (Task 3) and `nodeId={specimen.targetId}` (Task 4). `solvedNode`/`answerName` derived in Task 4 from `specimen.kind === "solved"` shape (`{ targetId, guessCount, outcome }`) which matches `SpecimenState` in engine-core.ts:98.

**Note on a spec detail:** the terminal (pre-solve) branch keeps its existing inline clue tease — the card is only embedded in the solved branch, exactly as the spec states. The `clue` prop to Specimen therefore stays in use for the terminal branch; Task 4 does not remove it.

## Non-goals

- Changing empty/broad/terminal states.
- Restyling the shadow-box frame (only its contents).
- Re-adding lineage or the unplayable-placement note.
- Image lazy-load / lightbox / captions.
