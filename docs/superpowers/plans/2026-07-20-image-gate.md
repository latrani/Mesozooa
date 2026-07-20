# Image Gate (#50) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A genus is playable only if it has an image — EXCEPT a pin (`ALWAYS_PLAYABLE`) forces it in regardless. Prunes ~72 imageless genera (birdgatory + egg oogenera) from the playable pool (799→~727) so every non-pinned playable dino shows a real card.

**Architecture:** Add an image filter to `prunePlayable`'s candidate loop, applied only to NON-pinned nodes, running before the cap (freed slots refill with image-having genera). Simultaneously widen the pin contract from #46's "cap-only" to "overrides ALL gates" — pins bypass image/clue/degenerate/article. The build pin loop stops skipping and instead force-pins + reports the override reason. Rebuild with `ALLOW_DATA_REGRESSION=1` (the pool drop is intentional).

**Tech Stack:** TypeScript, Vitest (pure TDD), tsx build script. `verbatimModuleSyntax` ON.

## Global Constraints

- **`verbatimModuleSyntax` is ON.** Type-only imports use `import type`.
- **Pins override EVERY gate. Pin is last, pin wins.** A pinned genus is playable regardless of image, clue, degenerate-clade, or article. This REPLACES #46's cap-only contract. Only "unknown name (not a genus)" can't be pinned.
- **Image gate runs BEFORE the cap**, as a filter on non-pinned candidates in `prunePlayable`.
- **Pool drop is intentional (~72 genera).** The landing build MUST use `ALLOW_DATA_REGRESSION=1` (GUARD 2 would otherwise correctly block a >10% playable drop). Document it in the commit.
- **Never `build:data` on stale raws** (CLAUDE.md). Raws are current this session; no re-fetch (image gate doesn't change the harvest).
- **Merge workflow:** feature branch → main, no PRs, Indi pushes. Commit with `Closes #50`.

---

### Task 1: Image gate + pins-bypass-all-gates in `prunePlayable` (pure, TDD)

**Files:**
- Modify: `src/lib/tree/playable.ts` (`prunePlayable`, lines 69-111)
- Test: `src/lib/tree/playable.test.ts` (the `describe("prunePlayable")` block — MUST also give `freshTree` genera images, see Step 1)

**Interfaces:**
- Consumes: existing `prunePlayable(tree, attrs, capFn, pinned?)`.
- Produces: same signature. New behavior: (a) a non-pinned genus with no `imageUrl` is excluded; (b) a PINNED genus bypasses ALL gates (clue, degenerate, image) — pinned nodes enter the clade candidate list unconditionally (still need base `n.playable`, which the build guarantees for pins — see Task 2).

- [ ] **Step 1: Fix the fixture so existing tests isolate cap/clue/pin from the new image gate**

In `src/lib/tree/playable.test.ts`, the `freshTree()` helper (lines 63-71) sets sitelinks on TR/TB/TC/LO but only TR has an image (from FIXTURE_RAWS). Under the new gate, TB/TC/LO would be dropped as imageless, breaking every existing cap/clue/pin test. Give them images so those tests keep testing what they mean to. Change `freshTree`:

```typescript
  function freshTree() {
    const t = assembleTree(pruneSubtree(FIXTURE_RAWS, NEORNITHES), DINOSAURIA, "test");
    markPlayable(t); // base playable now: TR, TB, TC, LO (all have wiki)
    t.nodes["TR"].sitelinks = 5;
    t.nodes["TB"].sitelinks = 3;
    t.nodes["TC"].sitelinks = 9;
    t.nodes["LO"].sitelinks = 4;
    // Give every base-playable genus an image so existing tests exercise cap/clue/pin logic in
    // isolation from the image gate (added #50). Image-gate behavior is tested separately below.
    t.nodes["TR"].imageUrl = "tr.jpg";
    t.nodes["TB"].imageUrl = "tb.jpg";
    t.nodes["TC"].imageUrl = "tc.jpg";
    t.nodes["LO"].imageUrl = "lo.jpg";
    return t;
  }
```

- [ ] **Step 2: Write the failing image-gate tests**

Append inside the `describe("prunePlayable", ...)` block (after the existing pin tests):

```typescript
  it("excludes an imageless non-pinned genus", () => {
    const t = freshTree();
    delete t.nodes["TB"].imageUrl; // TB now imageless; TR(5) & TB(3) share clade TF, cap 7
    prunePlayable(t, clue, () => 7);
    // TB dropped for no image; TR kept. (TC & LO excluded by the branchDepth rule as before.)
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR"]);
  });
  it("keeps an imageless genus when it is PINNED (pin overrides the image gate)", () => {
    const t = freshTree();
    delete t.nodes["TB"].imageUrl;
    prunePlayable(t, clue, () => 7, new Set(["TB"]));
    // TB imageless but pinned -> kept; TR kept.
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("pin overrides the clue gate too (no clue, still playable)", () => {
    const t = freshTree();
    const noTB = { TR: clue.TR, TC: clue.TC, LO: clue.LO }; // TB has no clue
    prunePlayable(t, noTB, () => 7, new Set(["TB"]));
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TB", "TR"]);
  });
  it("image-having genera refill cap slots freed by an imageless drop", () => {
    // TF clade: TR(5), TB(3), + inject TX(9) with an image. Make TB imageless, cap 2.
    const t = freshTree();
    t.nodes["TX"] = { ...t.nodes["TR"], id: "TX", name: "TXsaurus", sitelinks: 9, imageUrl: "tx.jpg" };
    t.nodes["TF"].childrenIds = [...t.nodes["TF"].childrenIds, "TX"];
    delete t.nodes["TB"].imageUrl;
    const attrs = { ...clue, TX: { ageLabel: "Campanian", discoveryLocation: "USA" } };
    prunePlayable(t, attrs, () => 2, new Set());
    // Imageless TB dropped pre-cap; the 2 slots go to the image-having TX(9) and TR(5), not TB.
    expect(playableGenera(t).map((n) => n.id).sort()).toEqual(["TR", "TX"]);
  });
```

- [ ] **Step 3: Run tests to verify they fail (and existing pass)**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: the 4 new tests FAIL (image gate not implemented — imageless TB still kept; pinned-imageless behavior absent). Existing tests PASS (fixture now gives images).

- [ ] **Step 4: Implement the gate + pin bypass**

Replace `prunePlayable`'s candidate loop (lines 75-93) so pins bypass all gates and non-pins face the image gate too:

```typescript
  const byClade = new Map<string, TreeNode[]>();
  for (const n of Object.values(tree.nodes)) {
    if (!n.playable) continue; // base: genus + article (or a pin the build marked playable, Task 2)
    const a = terminalClade(tree, n.id);
    // Pins bypass EVERY gate below (clue, degenerate-clade, image) — pin is last, pin wins (#50).
    // A non-pinned genus must clear all three to be a candidate.
    if (!pinned.has(n.id)) {
      if (!hasClue(attrs[n.id])) { n.playable = false; continue; }
      // Degenerate terminal clade (branchDepth <= 1) breaks two-phase warmth (spec 3.3).
      if (tree.nodes[a].branchDepth <= 1) { n.playable = false; continue; }
      // Image gate (#50): a playable dino must have a picture, else the card is a ??? placeholder.
      if (!n.imageUrl) { n.playable = false; continue; }
    }
    const list = byClade.get(a);
    if (list) list.push(n);
    else byClade.set(a, [n]);
  }
```

The sort+trim block (lines 94-110) is UNCHANGED — pins still sort to top and are never trimmed.

Update the function's doc comment (lines 66-68) to note the image gate + that pins bypass all gates.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/tree/playable.test.ts`
Expected: PASS (all existing + 4 new).

- [ ] **Step 6: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/lib/tree/playable.ts src/lib/tree/playable.test.ts
git commit -m "feat(playable): image gate for non-pinned genera; pins bypass all gates (#50)"
```

---

### Task 2: Build pin loop force-pins past all gates + marks pins playable

**Files:**
- Modify: `scripts/build-tree.ts` (pin resolution loop ~lines 189-231)

**Interfaces:**
- Consumes: Task 1's `prunePlayable` (pins bypass gates, but still need `n.playable === true` to enter the loop).
- Produces: `pinned` set + report where a pinned genus is NEVER skipped for a gate (only for unknown-name); pinned nodes are marked `playable = true` before the prune so the article-gate can't drop them.

- [ ] **Step 1: Rewrite the pin resolution loop**

Replace the loop (currently lines 193-206, the `for (const name of ALWAYS_PLAYABLE)` block) so gate failures become override *labels*, not skips, and pins get base playability:

```typescript
  for (const name of ALWAYS_PLAYABLE) {
    const node = byName.get(name);
    if (!node) { pinReport.push(`  ⚠ "${name}": unknown / not a genus — skipped`); continue; }
    // Pins override EVERY gate (#50): image, clue, degenerate-clade, even the missing-article base
    // gate. Record which gate(s) the pin is overriding for the report, then force it playable so
    // prunePlayable's `!n.playable` guard can't drop it (markPlayable leaves article-less nodes false).
    const overrides: string[] = [];
    if (!node.wikipediaUrl) overrides.push("no article");
    if (!hasClue(attrs[node.id])) overrides.push("no paleo-data");
    if (tree.nodes[terminalClade(tree, node.id)].branchDepth <= 1) overrides.push("degenerate clade");
    if (!node.imageUrl) overrides.push("no image");
    node.playable = true; // base playability for the pin (bypasses the article gate)
    pinned.add(node.id);
    pinnedNames.set(node.id, name);
    if (overrides.length) pinReport.push(`  ✓ "${name}" (${node.id}): pinned (overriding: ${overrides.join(", ")})`);
    // (a clean pin with no overrides gets its rescued/redundant label after the counterfactual below)
  }
```

- [ ] **Step 2: Adjust the counterfactual + classification (pins now may lack base playability)**

The counterfactual prune (lines 215-220) runs with NO pins to find naturally-playable genera. Since we now set `node.playable = true` for pins (including article-less ones), the counterfactual must run against a clean `markPlayable` baseline — which it already does IF the pin marking happens after. Reorder so the pin loop's `node.playable = true` does NOT taint the counterfactual: run the counterfactual FIRST (right after `markPlayable`, before marking pins), then mark pins, then the real prune.

Concretely, restructure lines 189-231 to this order:
1. Build `byName`, `pinned` (ids only), `pinnedNames`, and the override-label report lines — but do NOT set `node.playable = true` yet, and do NOT add unknown names.
2. `const capFn = ...` (unchanged).
3. Counterfactual: `markPlayable(tree)` is already done at line 184; run `prunePlayable(tree, attrs, capFn)` (no pins), snapshot `naturallyPlayable`, then `markPlayable(tree)` to reset.
4. NOW mark pins playable: `for (const id of pinned) tree.nodes[id].playable = true;`
5. Real prune: `prunePlayable(tree, attrs, capFn, pinned)`.
6. Classification loop: for each pinned id with NO override label already pushed, add `rescued`/`redundant` (as today). A pin that overrode a gate already has its `(overriding: …)` line — don't double-report; track which ids already got a line.

Implement with a `Set<string> reported` of ids that already got an override line, and only add rescued/redundant for ids not in it. Full replacement block:

```typescript
  const byName = indexByName(Object.values(tree.nodes).filter((n) => n.isGenus), "ALWAYS_PLAYABLE");
  const pinned = new Set<string>();
  const pinReport: string[] = [];
  const pinnedNames = new Map<string, string>();
  const overrodeGate = new Set<string>(); // ids whose report line is already set (gate override)
  for (const name of ALWAYS_PLAYABLE) {
    const node = byName.get(name);
    if (!node) { pinReport.push(`  ⚠ "${name}": unknown / not a genus — skipped`); continue; }
    pinned.add(node.id);
    pinnedNames.set(node.id, name);
    const overrides: string[] = [];
    if (!node.wikipediaUrl) overrides.push("no article");
    if (!hasClue(attrs[node.id])) overrides.push("no paleo-data");
    if (tree.nodes[terminalClade(tree, node.id)].branchDepth <= 1) overrides.push("degenerate clade");
    if (!node.imageUrl) overrides.push("no image");
    if (overrides.length) {
      pinReport.push(`  ✓ "${name}" (${node.id}): pinned (overriding: ${overrides.join(", ")})`);
      overrodeGate.add(node.id);
    }
  }

  const capFn = (members: TreeNode[]) =>
    adaptiveCap(members.map((n) => attrs[n.id]).filter((a): a is GenusAttribute => !!a), DEFAULT_CAP_DIALS);

  // Counterfactual (#47): prune with NO pins (against the clean markPlayable baseline from above) to
  // classify clean pins as rescued vs redundant. Reset afterward.
  let naturallyPlayable = new Set<string>();
  if (pinned.size) {
    prunePlayable(tree, attrs, capFn);
    naturallyPlayable = new Set(playableGenera(tree).map((n) => n.id));
    markPlayable(tree);
  }

  // Force base playability for pins (bypasses the article gate), then the real prune (pins bypass all).
  for (const id of pinned) tree.nodes[id].playable = true;
  prunePlayable(tree, attrs, capFn, pinned);

  // Classify clean pins (those that didn't already get a gate-override line).
  for (const [id, name] of pinnedNames) {
    if (overrodeGate.has(id)) continue;
    pinReport.push(naturallyPlayable.has(id)
      ? `  ✓ "${name}" (${id}): pinned (redundant — already a cap winner)`
      : `  ✓ "${name}" (${id}): pinned (rescued from cap)`);
  }
```

- [ ] **Step 2b: Verify types compile**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-tree.ts
git commit -m "feat(build): pins override every gate + are force-marked playable (#50)"
```

---

### Task 3: Reconcile the #46 spec

**Files:**
- Modify: `docs/superpowers/specs/2026-07-20-always-playable-list-design.md`

**Interfaces:** docs only.

- [ ] **Step 1: Update the #46 spec's pin contract**

The #46 spec says the pin is "cap-only" (overrides only the notability cap, skip+warns on
no-article/no-clue/degenerate). That is now false. Edit the spec's Decisions + Scope sections to state
the new contract: **pins override ALL gates (image, clue, degenerate-clade, article) — pin is last,
pin wins; only an unknown name can't be pinned.** Note the change was made by #50
(`docs/superpowers/specs/2026-07-20-image-gate-design.md`) and that the build reports which gate(s) a
pin overrides. Keep it brief — a corrective note, not a rewrite.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-07-20-always-playable-list-design.md
git commit -m "docs(always-playable): pins now override all gates, not cap-only (superseded by #50)"
```

---

### Task 4: Rebuild with the intentional regression override + verify

**Files:**
- Modify (generated, committed): `src/data/tree.json`, `src/data/genera-index.json`, `src/data/genus-attributes.json`, `src/data/meta.json`, `src/data/daily-calendar.json`

**Interfaces:**
- Consumes: Tasks 1-2; current raws.
- Produces: regenerated committed data with imageless non-pinned genera pruned.

- [ ] **Step 1: Build with the regression override (the pool drop is intentional)**

The playable pool drops ~72 (799→~727 ≈ 9%). GUARD 2 trips on a >10% drop, so 9% is just UNDER the
tripwire and likely won't fire — but run WITH the override defensively (belt-and-suspenders; if the
real drop is smaller than estimated the flag is a harmless no-op, and if it's larger it won't block):

```bash
ALLOW_DATA_REGRESSION=1 npm run build:data 2>&1 | tail -35
```

Expected: build report. `playable (pruned):` ~727. always-playable report shows Tawa + Suskityrannus (both have images → labeled rescued/redundant, NOT overriding). daily calendar 5/5 resolved. If GUARD 2 still hard-errors despite the env var, STOP + report (the override flag isn't being read).

- [ ] **Step 2: Verify the image invariant holds**

Run:
```bash
node -e 'const idx=JSON.parse(require("fs").readFileSync("src/data/genera-index.json","utf8"));const t=JSON.parse(require("fs").readFileSync("src/data/tree.json","utf8"));const pins=new Set(["Tawa","Suskityrannus"]);const imageless=idx.filter(x=>!t.nodes[x.id].imageUrl);console.log("pool:",idx.length);console.log("playable imageless:",imageless.length,"->",imageless.map(x=>x.name));console.log("(expect only pinned names, if any)");const bad=imageless.filter(x=>!pins.has(x.name));console.log("imageless AND not pinned (must be 0):",bad.length,bad.map(x=>x.name));'
```
Expected: `pool: ~727`; the only imageless playable genera (if any) are pinned names; `imageless AND not pinned` = **0**.

- [ ] **Step 3: Verify pins + calendar still intact**

Run:
```bash
node -e 'const idx=JSON.parse(require("fs").readFileSync("src/data/genera-index.json","utf8"));const c=JSON.parse(require("fs").readFileSync("src/data/daily-calendar.json","utf8"));const has=n=>idx.some(x=>x.name===n);console.log("Tawa:",has("Tawa"),"Suskityrannus:",has("Suskityrannus"),"| calendar entries:",Object.keys(c).length);'
```
Expected: Tawa + Suskityrannus true; calendar 5 entries.

- [ ] **Step 4: Full validation**

Run: `npx tsc --noEmit && npx vitest run && npx svelte-check 2>&1 | tail -5`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/data/tree.json src/data/genera-index.json src/data/genus-attributes.json src/data/meta.json src/data/daily-calendar.json
git commit -m "data: prune imageless dinos from the playable pool (Closes #50)

Every non-pinned playable genus now has an image (pool ~799 -> ~727); the
imageless bird-stem tail and egg oogenera drop out. Pins (Tawa, Suskityrannus)
keep their images. Intentional pool shrink (ALLOW_DATA_REGRESSION=1)."
```

---

## Self-review notes

- **Spec coverage:** image gate before cap + pins bypass all gates (Task 1), build force-pin + report (Task 2), #46 reconcile (Task 3), rebuild-with-override + verify image invariant (Task 4). All covered.
- **The fixture-image fix (Task 1 Step 1) is load-bearing** — without it every existing prunePlayable test breaks under the gate. Called out explicitly.
- **The counterfactual reorder (Task 2 Step 2) is the subtle bit:** pins now get `playable = true` (bypassing the article gate), which would taint the no-pin counterfactual if done first. The plan runs the counterfactual against the clean markPlayable baseline BEFORE marking pins. Flagged for the reviewer.
- **GUARD 2:** the drop is ~9% (799→727), possibly under the 10% tripwire — but the plan uses `ALLOW_DATA_REGRESSION=1` defensively since it's an intentional shrink. If it doesn't trip, the flag is a harmless no-op.
- **Type consistency:** `prunePlayable` signature unchanged (pins param already exists). Build reuses `indexByName` (#48), `capFn`, `pinnedNames` from the current code.
