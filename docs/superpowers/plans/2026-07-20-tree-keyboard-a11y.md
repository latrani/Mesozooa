# Keyboard-Accessible Cladogram + a11y Sweep — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the cladogram a keyboard/AT path via a parallel semantic `role="tree"` mirroring the revealed nodes, and fix two small axe failures (search input name, active-tab state).

**Architecture:** A new pure helper (`a11y-tree.ts`) turns the revealed set into a nested `A11yNode[]` (siblings ordered by visual `y`) plus a pure keyboard-nav resolver. `SpineTree.svelte` renders that structure as a visually-hidden `<ul role="tree">`, marks the SVG `aria-hidden`, and drives a visible focus ring from an internal focus cursor (relayout-free). Spec: `docs/superpowers/specs/2026-07-20-tree-keyboard-a11y-design.md`.

**Tech Stack:** Svelte 5 (runes), TypeScript, Vitest. No new dependencies.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit` AND `npx svelte-check` before every commit; Vitest does not catch these.
- Pure logic is TDD-tested (Vitest). Svelte components are validated by `npx svelte-check` + build + manual check in the gallery harness (`/gallery.html`) — the project does not unit-test components.
- Commit messages end with the two trailer lines used across this repo (`Co-Authored-By:` and `Claude-Session:`). Commit each task; do NOT push (the maintainer pushes). Closing trailer `Closes #21` on the final task's commit.
- No em-dashes in user-facing UI copy (en-dash ranges fine). Chat/docs unaffected.
- Node ids referenced in tests come from `src/lib/tree/fixture.ts` (`FIXTURE_RAWS`): `Q430` Dinosauria → `T` Theropoda → {`TF` Tyrannosauridae → {`TR` Tyrannosaurus, `TB` Tarbosaurus}, `LO` Loosey}; `Q430` → `O` Ornithischia → `CF` Ceratopsidae → `TC` Triceratops. `descendantGenusCount`: Q430=4, T=3, TF=2, O=1, CF=1; genera=1.

---

## File Structure

- **Create** `src/lib/game/a11y-tree.ts` — pure: `A11yNode`, `a11yTree`, `flattenVisible`, `TreeNav`, `buildNav`, `resolveKey`.
- **Create** `src/lib/game/a11y-tree.test.ts` — Vitest for the above.
- **Modify** `src/lib/game/components/SpineTree.svelte` — render the sr-only tree; `aria-hidden` the SVG; internal focus cursor + keyboard nav + focus-follows ring.
- **Modify** `src/lib/game/components/SearchBox.svelte` — `ariaLabel` prop → `aria-label` on the input.
- **Modify** `src/App.svelte` — `aria-current="page"` on the active mode button.

---

## Task 1: Pure `a11yTree` + `flattenVisible`

**Files:**
- Create: `src/lib/game/a11y-tree.ts`
- Test: `src/lib/game/a11y-tree.test.ts`

**Interfaces:**
- Consumes: `TreeStore` from `../treeStore` (methods `getNode`, `children`, `pathToRoot`); `displayName` from `../displayName`.
- Produces:
  ```ts
  export interface A11yNode {
    id: string;
    name: string;               // displayName(node.name)
    isGenus: boolean;
    descendantGenusCount: number;
    children: A11yNode[];        // ordered by visual y asc, name tiebreak
  }
  export function a11yTree(
    store: TreeStore,
    revealed: Set<string>,
    yOf: (id: string) => number,
  ): A11yNode[];
  export function flattenVisible(roots: A11yNode[]): A11yNode[]; // preorder DFS
  ```

- [ ] **Step 1: Write the failing tests**

Create `src/lib/game/a11y-tree.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { a11yTree, flattenVisible } from "./a11y-tree";
import type { A11yNode } from "./a11y-tree";
import { createTreeStore } from "./treeStore";
import { assembleTree, pruneSubtree } from "../tree/assemble";
import { markPlayable } from "../tree/playable";
import { FIXTURE_RAWS } from "../tree/fixture";
import { NEORNITHES, DINOSAURIA } from "../tree/types";

const tree = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
markPlayable(tree);
const store = createTreeStore(tree);

// Deterministic synthetic y so sibling ordering is under test control.
const yMap = (m: Record<string, number>) => (id: string) => m[id] ?? Infinity;
const ids = (ns: A11yNode[]) => ns.map((n) => n.id);

const FULL = new Set(["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"]);

describe("a11yTree", () => {
  it("nests revealed nodes by real parent -> child from the root", () => {
    const [root] = a11yTree(store, FULL, yMap({ T: 0, O: 1 }));
    expect(root.id).toBe("Q430");
    expect(ids(root.children)).toEqual(["T", "O"]); // T y=0 above O y=1
    const t = root.children[0];
    expect(ids(t.children)).toEqual(["TF", "LO"]); // both genera/clades under Theropoda
  });

  it("orders siblings by visual y ascending, name as tiebreak", () => {
    const tf = (yf: (id: string) => number) =>
      a11yTree(store, FULL, yf)[0].children[0].children.find((n) => n.id === "TF")!;
    expect(ids(tf(yMap({ TR: 5, TB: 1 })).children)).toEqual(["TB", "TR"]);
    expect(ids(tf(yMap({ TR: 1, TB: 5 })).children)).toEqual(["TR", "TB"]);
    // equal y -> name tiebreak: Tarbosaurus before Tyrannosaurus
    expect(ids(tf(yMap({ TR: 2, TB: 2 })).children)).toEqual(["TB", "TR"]);
  });

  it("classifies genus vs clade and carries descendant counts", () => {
    const [root] = a11yTree(store, FULL, yMap({}));
    expect(root).toMatchObject({ isGenus: false, descendantGenusCount: 4, name: "Dinosauria" });
    const tr = flattenVisible([root]).find((n) => n.id === "TR")!;
    expect(tr).toMatchObject({ isGenus: true, descendantGenusCount: 1 });
  });

  it("keeps a revealed clade whose children are unrevealed as a childless clade (frontier)", () => {
    const [root] = a11yTree(store, new Set(["Q430", "T"]), yMap({}));
    expect(ids(root.children)).toEqual(["T"]);
    const t = root.children[0];
    expect(t.isGenus).toBe(false);
    expect(t.children).toEqual([]); // frontier -> drives aria-expanded="false"
  });

  it("surfaces a revealed node whose parent is unrevealed as an extra root (orphan safety net)", () => {
    const roots = a11yTree(store, new Set(["Q430", "TF"]), yMap({ Q430: 0, TF: 1 }));
    expect(ids(roots).sort()).toEqual(["Q430", "TF"]);
  });

  it("returns empty when the root is not revealed", () => {
    expect(a11yTree(store, new Set(["TR"]), yMap({}))).toEqual([]);
    expect(a11yTree(store, new Set(), yMap({}))).toEqual([]);
  });
});

describe("flattenVisible", () => {
  it("is preorder DFS honoring the sibling order", () => {
    const roots = a11yTree(store, FULL, yMap({ T: 0, O: 1, TF: 0, LO: 1, TR: 0, TB: 1 }));
    expect(ids(flattenVisible(roots))).toEqual(
      ["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"],
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/a11y-tree.test.ts`
Expected: FAIL — "Failed to resolve import './a11y-tree'".

- [ ] **Step 3: Implement `a11y-tree.ts`**

Create `src/lib/game/a11y-tree.ts`:

```ts
import type { TreeStore } from "./treeStore";
import { displayName } from "./displayName";

export interface A11yNode {
  id: string;
  name: string;
  isGenus: boolean;
  descendantGenusCount: number;
  children: A11yNode[];
}

// The revealed set is normally a connected subtree from the root. `yOf` (the SVG's visual
// y-position per node) orders siblings top-to-bottom so depth-first focus movement tracks the
// on-screen ring as closely as a hierarchy-honest traversal can. Nodes missing from the layout
// sort last (Infinity), name as the deterministic tiebreak.
export function a11yTree(
  store: TreeStore,
  revealed: Set<string>,
  yOf: (id: string) => number,
): A11yNode[] {
  const parentOf = (id: string): string | null => {
    const path = store.pathToRoot(id); // [id, parent, ..., root]
    return path.length > 1 ? path[1] : null;
  };
  const cmp = (a: string, b: string): number =>
    (yOf(a) - yOf(b)) ||
    (store.getNode(a)?.name ?? "").localeCompare(store.getNode(b)?.name ?? "");

  const build = (id: string): A11yNode => {
    const node = store.getNode(id)!;
    const kids = store
      .children(id)
      .filter((c) => revealed.has(c.id))
      .map((c) => c.id)
      .sort(cmp)
      .map(build);
    return {
      id,
      name: displayName(node.name),
      isGenus: node.isGenus,
      descendantGenusCount: node.descendantGenusCount,
      children: kids,
    };
  };

  // A revealed id is a root iff it has no revealed parent (parent null, or not revealed).
  // In the normal connected case only the tree root qualifies; a disconnected revealed node
  // still surfaces here rather than vanishing (the orphan safety net).
  return [...revealed]
    .filter((id) => store.getNode(id) !== undefined)
    .filter((id) => {
      const par = parentOf(id);
      return par === null || !revealed.has(par);
    })
    .sort(cmp)
    .map(build);
}

export function flattenVisible(roots: A11yNode[]): A11yNode[] {
  const out: A11yNode[] = [];
  const walk = (n: A11yNode) => {
    out.push(n);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/a11y-tree.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/game/a11y-tree.ts src/lib/game/a11y-tree.test.ts
git commit -m "$(cat <<'EOF'
feat(a11y): pure a11yTree + flattenVisible (revealed set -> nested tree)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TEFyEuRroyb3qSSxJbPuFb
EOF
)"
```

---

## Task 2: Pure keyboard-nav resolver (`buildNav` + `resolveKey`)

**Files:**
- Modify: `src/lib/game/a11y-tree.ts`
- Test: `src/lib/game/a11y-tree.test.ts`

**Interfaces:**
- Consumes: `A11yNode`, `flattenVisible` from Task 1.
- Produces:
  ```ts
  export interface TreeNav {
    order: string[];                     // flattened focus order (preorder DFS)
    parent: Record<string, string>;      // id -> parent id (absent for roots)
    firstChild: Record<string, string>;  // id -> first child id (absent for leaves)
  }
  export function buildNav(roots: A11yNode[]): TreeNav;
  // key is a KeyboardEvent.key; returns the id to focus next, or null for no move.
  export function resolveKey(nav: TreeNav, currentId: string, key: string): string | null;
  ```

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/game/a11y-tree.test.ts`:

```ts
import { buildNav, resolveKey } from "./a11y-tree";

describe("buildNav + resolveKey", () => {
  // Tree: Q430 -> [T -> [TF -> [TR, TB], LO], O -> [CF -> [TC]]]
  const roots = a11yTree(
    store,
    FULL,
    yMap({ T: 0, O: 1, TF: 0, LO: 1, TR: 0, TB: 1 }),
  );
  const nav = buildNav(roots);
  const key = (cur: string, k: string) => resolveKey(nav, cur, k);

  it("ArrowDown/Up walk the flattened order and stop at the ends", () => {
    expect(nav.order).toEqual(["Q430", "T", "TF", "TR", "TB", "LO", "O", "CF", "TC"]);
    expect(key("TF", "ArrowDown")).toBe("TR");
    expect(key("TF", "ArrowUp")).toBe("T");
    expect(key("Q430", "ArrowUp")).toBeNull(); // first item
    expect(key("TC", "ArrowDown")).toBeNull(); // last item
  });

  it("ArrowRight goes to first child; ArrowLeft goes to parent", () => {
    expect(key("T", "ArrowRight")).toBe("TF");
    expect(key("TR", "ArrowRight")).toBeNull(); // genus leaf, no child
    expect(key("TF", "ArrowLeft")).toBe("T");
    expect(key("Q430", "ArrowLeft")).toBeNull(); // root, no parent
  });

  it("Home/End jump to the first/last visible item; unknown keys do nothing", () => {
    expect(key("TC", "Home")).toBe("Q430");
    expect(key("Q430", "End")).toBe("TC");
    expect(key("T", "a")).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/game/a11y-tree.test.ts -t "buildNav"`
Expected: FAIL — `resolveKey`/`buildNav` not exported.

- [ ] **Step 3: Implement in `a11y-tree.ts`**

Append to `src/lib/game/a11y-tree.ts`:

```ts
export interface TreeNav {
  order: string[];
  parent: Record<string, string>;
  firstChild: Record<string, string>;
}

export function buildNav(roots: A11yNode[]): TreeNav {
  const order = flattenVisible(roots).map((n) => n.id);
  const parent: Record<string, string> = {};
  const firstChild: Record<string, string> = {};
  const walk = (n: A11yNode) => {
    if (n.children.length > 0) firstChild[n.id] = n.children[0].id;
    for (const c of n.children) {
      parent[c.id] = n.id;
      walk(c);
    }
  };
  roots.forEach(walk);
  return { order, parent, firstChild };
}

export function resolveKey(nav: TreeNav, currentId: string, key: string): string | null {
  const i = nav.order.indexOf(currentId);
  if (i === -1) return null;
  switch (key) {
    case "ArrowDown":
      return i + 1 < nav.order.length ? nav.order[i + 1] : null;
    case "ArrowUp":
      return i > 0 ? nav.order[i - 1] : null;
    case "ArrowRight":
      return nav.firstChild[currentId] ?? null;
    case "ArrowLeft":
      return nav.parent[currentId] ?? null;
    case "Home":
      return nav.order[0] ?? null;
    case "End":
      return nav.order[nav.order.length - 1] ?? null;
    default:
      return null;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/game/a11y-tree.test.ts`
Expected: PASS (all `a11yTree`, `flattenVisible`, and `buildNav` cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: no errors.

```bash
git add src/lib/game/a11y-tree.ts src/lib/game/a11y-tree.test.ts
git commit -m "$(cat <<'EOF'
feat(a11y): pure keyboard-nav resolver for the tree (buildNav + resolveKey)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TEFyEuRroyb3qSSxJbPuFb
EOF
)"
```

---

## Task 3: Render the sr-only `role="tree"`; make the SVG `aria-hidden`

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Consumes: `a11yTree` from `../a11y-tree`; existing `revealed`, `highlightId`, `layout`, `posOf` in the component.
- Produces: an `a11yRoots` derived value and a `sr-tree` DOM region consumed by Task 4's keyboard wiring; a `currentId` derived value.

- [ ] **Step 1: Import the helper and derive the tree**

In the `<script>` of `SpineTree.svelte`, add to the imports near `layoutSpine`:

```ts
import { a11yTree } from "../a11y-tree";
```

After `let posOf = $derived(...)` (around line 128), add:

```ts
  // Per-node visual y for sibling ordering in the a11y tree (mirrors the SVG's layout).
  let yOf = $derived((id: string) => posOf.get(id)?.y ?? Infinity);
  let a11yRoots = $derived(a11yTree(treeStore, revealed, yOf));
  // The single roving-tabindex target: keyboard cursor if set, else the committed highlight,
  // else the tip, else the first item. Task 4 turns `focusId` into live keyboard state.
  let focusId = $state<string | null>(null);
  let currentId = $derived(
    focusId ?? highlightId ?? tipId ?? a11yRoots[0]?.id ?? null,
  );
```

- [ ] **Step 2: Mark the SVG decorative**

Change the `<svg class="tree" ...>` opening tag (around line 346-353): remove `role="img"` and `aria-label="Cladogram"`, add `aria-hidden="true"`:

```svelte
    <svg
      class="tree"
      width={contentWidth * zoom}
      height={vbH * zoom}
      viewBox={`0 0 ${contentWidth} ${vbH}`}
      aria-hidden="true"
    >
```

- [ ] **Step 3: Update the click-suppression comment to reflect the new rationale**

Replace the two `svelte-ignore` lines (around 404-405) with a single documented suppression:

```svelte
        <!-- The SVG is aria-hidden (decorative visual layer); the keyboard/AT path lives in
             the sibling <ul role="tree"> below. onclick here is a pure pointer convenience, so
             the missing key handler is intentional, not a gap. -->
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
```

- [ ] **Step 4: Render the sr-only tree**

Immediately after the closing `</svg>` and the runway block, still inside `.tree-scroll` (after line 453's `{#if runway}...{/if}`), add the tree and a recursive snippet. Add the snippet definition just before the closing `</div>` of `.tree-scroll`:

```svelte
    {#if a11yRoots.length}
      <ul class="sr-tree" role="tree" aria-label="Dinosaur cladogram">
        {#each a11yRoots as n (n.id)}{@render treeitem(n)}{/each}
      </ul>
    {/if}
```

Then, after the whole `{#if layout.nodes.length}` block that renders `.tree-scroll` (before the zoom-controls block near line 458), define the snippet:

```svelte
{#snippet treeitem(n: import("../a11y-tree").A11yNode)}
  <li
    role="treeitem"
    aria-selected={n.id === highlightId ? "true" : "false"}
    aria-expanded={n.isGenus ? undefined : n.children.length > 0 ? "true" : "false"}
    tabindex={n.id === currentId ? 0 : -1}
  >
    <span>{n.name}{#if !n.isGenus}, {n.descendantGenusCount} genera{/if}</span>
    {#if n.children.length}
      <ul role="group">
        {#each n.children as c (c.id)}{@render treeitem(c)}{/each}
      </ul>
    {/if}
  </li>
{/snippet}
```

- [ ] **Step 5: Add the sr-only style**

In the `<style>` block, add:

```css
  /* Visually hidden but focusable + AT-reachable: the parallel semantic tree. It stays hidden
     even on focus — the SVG's focus ring (Task 4) is the visible feedback, so this never needs
     to appear. */
  .sr-tree {
    position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0;
    overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0;
  }
```

- [ ] **Step 6: Typecheck, svelte-check, and eyeball**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: 0 errors, 0 warnings (the single documented suppression keeps `a11y_click_events_have_key_events` silent).

Run: `npm run dev`, open `/gallery.html`, and in devtools confirm a `<ul role="tree">` with nested `<li role="treeitem">` (correct names, `, N genera` on clades, `aria-expanded="false"` on a frontier clade) sits beside an `aria-hidden` SVG. Nothing visible should change.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "$(cat <<'EOF'
feat(a11y): render sr-only role=tree cladogram; mark SVG aria-hidden

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TEFyEuRroyb3qSSxJbPuFb
EOF
)"
```

---

## Task 4: Keyboard navigation, focus cursor, and focus-follows ring

**Files:**
- Modify: `src/lib/game/components/SpineTree.svelte`

**Interfaces:**
- Consumes: `buildNav`, `resolveKey` from `../a11y-tree`; `focusId`, `currentId`, `a11yRoots`, `scrollToNode`, `posOf`, `onnodeselect`, `highlightId` in the component.
- Produces: full keyboard operation of the tree (final deliverable for #21).

- [ ] **Step 1: Import the resolver and add focus state**

Extend the a11y-tree import:

```ts
import { a11yTree, buildNav, resolveKey } from "../a11y-tree";
```

Near the `focusId`/`currentId` declarations from Task 3, add:

```ts
  let nav = $derived(buildNav(a11yRoots));
  // Whether keyboard focus is currently inside the tree — gates the focus-follows ring so a
  // mouse user's committed highlight isn't overridden by a stale keyboard cursor.
  let treeFocused = $state(false);
  // The li elements, so we can move DOM focus (roving tabindex) and restore it after an
  // Explore re-center rebuilds the tree.
  let liEls = $state<Record<string, HTMLLIElement>>({});
  // The node the visible ring should mark: keyboard cursor while the tree is focused, else the
  // committed highlight prop.
  let ringId = $derived(treeFocused ? currentId : highlightId);
```

- [ ] **Step 2: Point the visible ring at `ringId`**

Change the highlight test in the node loop (around line 399) from `highlightId` to `ringId`:

```svelte
        {@const isHi = n.id === ringId}
```

(Leave the `.node.highlight` class and the `label-ring` block as-is; they now follow `ringId`.)

- [ ] **Step 3: Wire focus + keydown on each treeitem**

Update the `<li>` in the `treeitem` snippet to bind its element and handle focus/keys:

```svelte
  <li
    role="treeitem"
    aria-selected={n.id === highlightId ? "true" : "false"}
    aria-expanded={n.isGenus ? undefined : n.children.length > 0 ? "true" : "false"}
    tabindex={n.id === currentId ? 0 : -1}
    bind:this={liEls[n.id]}
    onfocusin={() => onItemFocus(n.id)}
    onblur={onItemBlur}
    onkeydown={onTreeKey}
  >
```

- [ ] **Step 4: Add the handlers**

In `<script>`, after `scrollToNode` (around line 205), add:

```ts
  // Focus entered a treeitem: lock the cursor to it and mirror it on the visible tree (ring +
  // scroll into view). Cheap — touches neither tipId nor highlightId, so no relayout in either
  // mode. This is the "focus-follows" behavior.
  function onItemFocus(id: string) {
    treeFocused = true;
    focusId = id;
    if (posOf.has(id)) scrollToNode(id);
  }

  function onItemBlur(e: FocusEvent) {
    // Only drop the ring when focus leaves the tree entirely (not on within-tree hops).
    const next = e.relatedTarget as Node | null;
    if (!next || !(next as Element).closest?.("[role='tree']")) treeFocused = false;
  }

  function focusItem(id: string) {
    focusId = id;
    liEls[id]?.focus();
  }

  function onTreeKey(e: KeyboardEvent) {
    const cur = currentId;
    if (!cur) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onnodeselect?.(cur); // identical to a mouse click (undefined during game play = no-op)
      return;
    }
    const next = resolveKey(nav, cur, e.key);
    if (next) {
      e.preventDefault(); // stop arrow/Home/End from scrolling the page
      focusItem(next);
    }
  }
```

- [ ] **Step 5: Restore focus after an Explore re-center rebuilds the tree**

In `<script>`, add an effect (after the existing tip-centering `$effect`, around line 278):

```ts
  // Activating a node in Explore re-centers (rebuilds revealed -> the tree). Keep DOM focus on
  // the current cursor across that rebuild so keyboard position survives. Guarded by treeFocused
  // so we never steal focus from elsewhere on the page.
  $effect(() => {
    void a11yRoots; // re-run when the tree structure changes
    if (treeFocused && focusId && liEls[focusId] && document.activeElement !== liEls[focusId]) {
      liEls[focusId].focus();
    }
  });
```

- [ ] **Step 6: Typecheck, svelte-check, and manual keyboard test**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: 0 errors, 0 warnings.

Run `npm run dev` and verify in a real game and in Explore:
- Tab reaches the tree (one stop); Tab again leaves it.
- ArrowUp/Down/Left/Right + Home/End move focus; the SVG ring follows and the node scrolls into view.
- In Explore, Enter re-centers on the focused node and focus survives the relayout; in a finished game, Enter on a node opens Explore (the portal); mid-game, Enter does nothing (matches the mouse — nodes aren't clickable in play).
- With System Settings → Reduce Motion ON, the scroll-follow is instant (no smooth animation).
- VoiceOver (Cmd-F5): entering the tree announces "Dinosaur cladogram, tree"; items announce name, level, and "expanded/collapsed" on clades.

- [ ] **Step 7: Commit**

```bash
git add src/lib/game/components/SpineTree.svelte
git commit -m "$(cat <<'EOF'
feat(a11y): keyboard nav + focus-follows ring for the cladogram tree

Arrow/Home/End move a roving-tabindex focus cursor (internal, relayout-free);
the SVG ring + scroll follow it; Enter activates via the existing onnodeselect.
Focus survives Explore re-center rebuilds.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TEFyEuRroyb3qSSxJbPuFb
EOF
)"
```

---

## Task 5: Mechanical fixes — SearchBox name + active-tab state

**Files:**
- Modify: `src/lib/game/components/SearchBox.svelte`
- Modify: `src/App.svelte`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent).
- Produces: an accessible name on the search input; `aria-current` on the active mode tab.

- [ ] **Step 1: Add an `ariaLabel` prop to SearchBox**

In `SearchBox.svelte`, extend the props type and destructure (around lines 6-10):

```svelte
  let {
    entries,
    onpick,
    placeholder = "Search…",
    ariaLabel = "Search dinosaurs",
  }: {
    entries: SearchEntry[];
    onpick: (id: string) => void;
    placeholder?: string;
    ariaLabel?: string;
  } = $props();
```

Set it on the input (line 23):

```svelte
  <input {placeholder} aria-label={ariaLabel} bind:value={query} autocomplete="off" />
```

- [ ] **Step 2: Add `aria-current` to the active mode button**

In `App.svelte`, update the three `.modes` buttons (lines 77-79) so the active one carries `aria-current="page"`:

```svelte
    <button type="button" class:active={nav.tab === "daily"} aria-current={nav.tab === "daily" ? "page" : undefined} onclick={() => nav.set("daily")}>Daily{#if hasProgress(daily.state)}{" — in progress"}{/if}</button>
    <button type="button" class:active={nav.tab === "practice"} aria-current={nav.tab === "practice" ? "page" : undefined} onclick={() => nav.set("practice")}>Practice{#if hasProgress(game.state)}{" — in progress"}{/if}</button>
    <button type="button" class:active={nav.tab === "explore"} aria-current={nav.tab === "explore" ? "page" : undefined} onclick={() => nav.set("explore")}>Explore</button>
```

- [ ] **Step 3: Typecheck + svelte-check**

Run: `npx tsc --noEmit && npx svelte-check`
Expected: 0 errors, 0 warnings.

- [ ] **Step 4: Verify**

Run `npm run dev`: with VoiceOver, the guess/search field announces "Search dinosaurs, edit text"; the active nav tab announces "current page".

- [ ] **Step 5: Commit (closes #21)**

```bash
git add src/lib/game/components/SearchBox.svelte src/App.svelte
git commit -m "$(cat <<'EOF'
fix(a11y): name the search input; mark the active mode tab (Closes #21)

Adds aria-label to the guess/search box and aria-current="page" to the active
Daily/Practice/Explore tab. Completes the a11y sweep alongside the keyboard tree.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01TEFyEuRroyb3qSSxJbPuFb
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- Parallel `role="tree"` mirroring revealed, real nesting → Tasks 1, 3. ✓
- Siblings by visual y; frontier clade as childless; orphan safety; empty → Task 1 tests. ✓
- Depth-first arrows, ←/→ parent/first-child, Home/End, roving tabindex, Enter via `onnodeselect` → Tasks 2, 4. ✓
- Internal `focusId` (not `highlightId`) so no relayout; focus-follows ring + scroll → Task 4. ✓
- `aria-expanded` derived (genus none / clade true / frontier false) → Task 3 snippet. ✓
- `aria-selected` = committed highlight → Task 3 snippet. ✓
- SVG `aria-hidden`; suppression re-documented → Task 3. ✓
- Focus restoration across Explore re-center → Task 4 effect. ✓
- SearchBox `aria-label`; tab `aria-current` → Task 5. ✓
- Reduced-motion respected (reuses existing `reduceMotion` in `scrollToNode`) → Task 4 manual check. ✓
- Out of scope (visible panel, type-ahead, user collapse, SVG spatial nav, animation #52) → not implemented. ✓

**Placeholder scan:** none — every code step carries full code; every command has an expected result.

**Type consistency:** `A11yNode`/`a11yTree`/`flattenVisible` (Task 1) reused verbatim in Tasks 2-4; `TreeNav`/`buildNav`/`resolveKey` (Task 2) reused in Task 4; `focusId`/`currentId`/`ringId`/`treeFocused`/`liEls`/`nav`/`a11yRoots` names consistent across Tasks 3-4.
