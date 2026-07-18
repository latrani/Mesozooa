# Local Images + Attribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace runtime Commons image hotlinks with locally-served thumbnails plus per-image
author/license attribution, harvested at build time.

**Architecture:** A new `scripts/fetch-images.ts` calls the Commons API once per `P18` image to get
`extmetadata` credit fields + a ~640px thumbnail URL, downloads the thumbnail to gitignored
`public/images/<Qid>.<ext>`, and records credits in committed `data/image-credits.json`. `build:data`
folds credits into `tree.json` and rewrites each `imageUrl` to a local `/images/<Qid>.<ext>` path.
`SpecimenCard.svelte` renders the credit line from the baked node fields. Pure helpers
(`sanitizeArtist`, `formatCredit`) live in a shared module, TDD-tested.

**Tech Stack:** TypeScript, `tsx` (script runner), Node `fetch` + `node:fs/promises`, Svelte 5 runes,
Vitest.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Vitest does NOT catch
  violations; run `npx tsc --noEmit` (and `npx svelte-check` for `.svelte`) before every commit.
- **No post-build runtime network** — after this work, `grep wikimedia src/data/tree.json` must return
  zero `imageUrl` hits.
- **Two-tier storage** — heavy binaries gitignored + regenerated (`public/images/`); tiny credit
  strings committed (`data/image-credits.json`), same dir/role as `data/raw-*.json`.
- **Commons politeness** — descriptive `User-Agent` on every request; ~1 req/sec rate limit; retry on
  429/5xx with backoff (mirror `scripts/pbdb.ts` `getJSON`).
- **Use the returned `thumburl` verbatim** — never construct it. `iiurlwidth=640` reports
  `thumbwidth:640` but the URL may point at a larger standard bucket (e.g. 960px). Download whatever
  `thumburl` says.
- **Ship-all this pass** — harvest every image with whatever metadata Commons gives; the
  strictness-line decision (drop bare/non-free?) is a deliberate later follow-up, NOT in scope.

## File Structure

- **Create `src/lib/image-credits.ts`** — pure helpers shared by the harvest script AND the Svelte
  card: `sanitizeArtist(html)`, `formatCredit(credit)`, plus the `ImageCredit`/`ImageCredits`/
  `CreditDisplay` types. Lives in `src/lib/` (NOT `scripts/`) because both consumers can import it
  cleanly there — `.svelte` files import from `src/lib/`, and scripts already import `../src/lib/...`
  (e.g. `fetch-pbdb.ts` → `../src/lib/pbdb-parse`). This is the established direction; a `.svelte` →
  `scripts/` import would cross Vite's module boundary. TDD-tested.
- **Create `src/lib/image-credits.test.ts`** — Vitest tests for the two pure helpers.
- **Create `scripts/fetch-images.ts`** — I/O harvest: Commons API, thumbnail download, writes
  `data/image-credits.json` + `docs/superpowers/image-credits-report.md`. Not unit-tested.
- **Modify `src/lib/tree/types.ts`** — add three optional credit fields to `TreeNode` (and `RawTaxon`
  is untouched; credits never enter the raw pull).
- **Modify `src/lib/tree/assemble.ts:50-63`** — pass the credit fields through (they arrive on the raw
  via a merge step in build-tree, see Task 5).
- **Modify `scripts/build-tree.ts`** — read `data/image-credits.json`, rewrite `imageUrl` to local
  path + attach credit fields onto nodes.
- **Modify `src/lib/game/components/SpecimenCard.svelte:25-28`** — render the real credit line via
  `formatCredit`.
- **Modify `package.json`** — add `fetch:images` script; insert it into the `fetch` pipeline.
- **Modify `.gitignore`** — add `public/images/`.

**Interfaces defined once, consumed everywhere:**

```typescript
// src/lib/image-credits.ts
export interface ImageCredit {
  author?: string;       // sanitized plain text (Commons Artist HTML stripped)
  licenseShort?: string; // e.g. "CC BY-SA 4.0"
  licenseUrl?: string;   // e.g. "https://creativecommons.org/licenses/by-sa/4.0"
  licenseCategory?: string; // machine key, e.g. "cc-by-sa-4.0" (from extmetadata License)
  sourceFileUrl?: string;   // original Commons file URL, for provenance
}
export type ImageCredits = Record<string, ImageCredit>; // keyed by Q-id

// formatCredit output — the card renders these three parts. (defined in Task 2)
export interface CreditDisplay {
  author: string | null;       // null when unknown
  licenseShort: string | null; // null when unknown
  licenseUrl: string | null;   // null when no link
}
```

---

## Task 1: Pure helper — `sanitizeArtist`

Strips Commons `Artist` HTML (anchors, spans, entities) to a trimmed plain-text name.

**Files:**
- Create: `src/lib/image-credits.ts`
- Test: `src/lib/image-credits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `sanitizeArtist(html: string | undefined): string | undefined` — returns undefined for
  empty/whitespace-only input; otherwise plain text with tags removed, entities decoded, whitespace
  collapsed.

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/image-credits.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeArtist } from "./image-credits";

describe("sanitizeArtist", () => {
  it("strips an anchor tag to its text", () => {
    const html = '<a href="//commons.wikimedia.org/wiki/User:Ferahgo" title="User:Ferahgo">Emily Willoughby</a>';
    expect(sanitizeArtist(html)).toBe("Emily Willoughby");
  });
  it("strips nested spans and collapses whitespace", () => {
    expect(sanitizeArtist('<span class="x">  Jane   Paleo </span>')).toBe("Jane Paleo");
  });
  it("decodes common HTML entities", () => {
    expect(sanitizeArtist("Muse&#039;um &amp; Co")).toBe("Muse'um & Co");
  });
  it("returns undefined for empty or tag-only input", () => {
    expect(sanitizeArtist("")).toBeUndefined();
    expect(sanitizeArtist("<span></span>")).toBeUndefined();
    expect(sanitizeArtist(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-credits.test.ts`
Expected: FAIL — `sanitizeArtist` is not exported / module not found.

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/lib/image-credits.ts
export interface ImageCredit {
  author?: string;
  licenseShort?: string;
  licenseUrl?: string;
  licenseCategory?: string;
  sourceFileUrl?: string;
}
export type ImageCredits = Record<string, ImageCredit>;

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'", "&#39;": "'", "&nbsp;": " ",
};

export function sanitizeArtist(html: string | undefined): string | undefined {
  if (!html) return undefined;
  const text = html
    .replace(/<[^>]*>/g, "")                                  // strip tags
    .replace(/&#?\w+;/g, (m) => ENTITIES[m] ?? m)             // decode known entities
    .replace(/\s+/g, " ")                                     // collapse whitespace
    .trim();
  return text.length ? text : undefined;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-credits.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/image-credits.ts src/lib/image-credits.test.ts
git commit -m "feat(images): sanitizeArtist — strip Commons Artist HTML to plain text"
```

---

## Task 2: Pure helper — `formatCredit`

Turns a stored `ImageCredit` into the three display parts the card renders, with the full / partial /
bare fallback logic.

**Files:**
- Modify: `src/lib/image-credits.ts`
- Test: `src/lib/image-credits.test.ts`

**Interfaces:**
- Consumes: `ImageCredit` (Task 1).
- Produces: `formatCredit(credit: ImageCredit | undefined): CreditDisplay` where `CreditDisplay` is
  `{ author: string | null; licenseShort: string | null; licenseUrl: string | null }`. Rules:
  author present → author; else null. licenseShort present → it; else null. licenseUrl present AND
  licenseShort present → url; else null (never link bare text). The card supplies the "Wikimedia
  Commons" fallback when author is null (kept in the component so this stays a pure data transform).

- [ ] **Step 1: Write the failing test**

```typescript
// append to src/lib/image-credits.test.ts
import { formatCredit } from "./image-credits";

describe("formatCredit", () => {
  it("returns author + linked license when both present", () => {
    expect(formatCredit({ author: "Emily Willoughby", licenseShort: "CC BY-SA 4.0", licenseUrl: "https://cc/by-sa/4.0" }))
      .toEqual({ author: "Emily Willoughby", licenseShort: "CC BY-SA 4.0", licenseUrl: "https://cc/by-sa/4.0" });
  });
  it("keeps license unlinked when url is missing", () => {
    expect(formatCredit({ author: "Jane Paleo", licenseShort: "PD" }))
      .toEqual({ author: "Jane Paleo", licenseShort: "PD", licenseUrl: null });
  });
  it("nulls author when absent (license only)", () => {
    expect(formatCredit({ licenseShort: "CC BY 4.0", licenseUrl: "https://cc/by/4.0" }))
      .toEqual({ author: null, licenseShort: "CC BY 4.0", licenseUrl: "https://cc/by/4.0" });
  });
  it("nulls everything for bare or undefined input", () => {
    expect(formatCredit({})).toEqual({ author: null, licenseShort: null, licenseUrl: null });
    expect(formatCredit(undefined)).toEqual({ author: null, licenseShort: null, licenseUrl: null });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/image-credits.test.ts`
Expected: FAIL — `formatCredit` is not exported.

- [ ] **Step 3: Write minimal implementation**

```typescript
// append to src/lib/image-credits.ts
export interface CreditDisplay {
  author: string | null;
  licenseShort: string | null;
  licenseUrl: string | null;
}

export function formatCredit(credit: ImageCredit | undefined): CreditDisplay {
  const author = credit?.author?.trim() || null;
  const licenseShort = credit?.licenseShort?.trim() || null;
  const licenseUrl = licenseShort && credit?.licenseUrl?.trim() ? credit.licenseUrl.trim() : null;
  return { author, licenseShort, licenseUrl };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/image-credits.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/image-credits.ts src/lib/image-credits.test.ts
git commit -m "feat(images): formatCredit — full/partial/bare credit display parts"
```

---

## Task 3: Harvest script — `scripts/fetch-images.ts`

The I/O pass: read the raw taxa, call Commons per image (presence-skip), download thumbnails, write
`data/image-credits.json` + a coverage report. Not unit-tested (pure I/O); verified by running it.

**Files:**
- Create: `scripts/fetch-images.ts`
- Modify: `package.json` (add `fetch:images`; splice into `fetch`)
- Modify: `.gitignore` (add `public/images/`)

**Interfaces:**
- Consumes: `data/raw-taxa.json` (array of `RawTaxon`; `imageUrl` is the Commons
  `Special:FilePath/<name>` hotlink), `sanitizeArtist` + `ImageCredit`/`ImageCredits` (Task 1).
- Produces: `public/images/<Qid>.<ext>` files; `data/image-credits.json` (`ImageCredits`);
  `docs/superpowers/image-credits-report.md`. The report includes **total payload size, size
  distribution, and the heaviest outlier images** (measured from files on disk, not just this run's
  downloads) so a follow-up local-image-processing step can be scoped if the bundle balloons.

- [ ] **Step 1: Add the npm scripts and gitignore entry**

In `package.json` `scripts`, add `fetch:images` and splice it into `fetch` before `build:data`:

```json
"fetch": "npm run fetch:wikidata && npm run fetch:pbdb && npm run fetch:images && npm run build:data",
"fetch:wikidata": "tsx scripts/fetch-wikidata.ts",
"fetch:pbdb": "tsx scripts/fetch-pbdb.ts",
"fetch:images": "tsx scripts/fetch-images.ts",
"build:data": "tsx scripts/build-tree.ts",
```

Append to `.gitignore`:

```
public/images/
```

- [ ] **Step 2: Write the harvest script**

```typescript
// scripts/fetch-images.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import type { RawTaxon } from "../src/lib/tree/types";
import { sanitizeArtist, type ImageCredit, type ImageCredits } from "../src/lib/image-credits";

const EXTS = ["jpg", "jpeg", "png", "gif", "svg", "webp", "tif", "tiff"];

const API = "https://commons.wikimedia.org/w/api.php";
const UA = "Mesozooa/0.1 (https://github.com/; dinosaur cladistics game)";
const THUMB_WIDTH = 640;
const IMG_DIR = "public/images";
const CREDITS_PATH = "data/image-credits.json";
const REPORT_PATH = "docs/superpowers/image-credits-report.md";
const FORCE = process.argv.includes("--force");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The raw imageUrl is http://commons.wikimedia.org/wiki/Special:FilePath/<urlencoded file name>.
// Recover the bare "File:<name>" title the API wants.
function fileTitleFromUrl(imageUrl: string): string | null {
  const m = imageUrl.match(/Special:FilePath\/(.+)$/);
  if (!m) return null;
  return "File:" + decodeURIComponent(m[1]);
}

function extFromUrl(url: string): string {
  const m = url.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  return (m ? m[1] : "jpg").toLowerCase();
}

async function fetchJSON(url: string): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (res.status === 429 || res.status >= 500) { await sleep(2000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`Commons ${res.status}: ${url}`);
    return res.json();
  }
  throw new Error(`Commons retries exhausted: ${url}`);
}

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`download ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
}

/** Path of this Q-id's image on disk, or null. */
function imagePath(id: string): string | null {
  for (const ext of EXTS) {
    const p = `${IMG_DIR}/${id}.${ext}`;
    if (existsSync(p)) return p;
  }
  return null;
}

/** Presence-skip: image file for this Q-id already on disk AND a credit entry exists. */
function alreadyHave(id: string, credits: ImageCredits): boolean {
  if (FORCE) return false;
  if (!credits[id]) return false;
  return imagePath(id) !== null;
}

function fmtBytes(n: number): string {
  if (n >= 1 << 20) return `${(n / (1 << 20)).toFixed(1)} MB`;
  if (n >= 1 << 10) return `${(n / (1 << 10)).toFixed(0)} KB`;
  return `${n} B`;
}

function renderReport(credits: ImageCredits, nameById: Map<string, string>): string {
  const ids = Object.keys(credits);
  const isFree = (c: ImageCredit) => {
    const k = (c.licenseCategory ?? c.licenseShort ?? "").toLowerCase();
    return /^cc|^pd|public domain|^cc0/.test(k);
  };
  let full = 0, partial = 0, bare = 0;
  const byLicense: Record<string, number> = {};
  const flagged: string[] = [];
  // Size, measured from files on disk (covers presence-skipped files from prior runs too).
  const sizes: { id: string; bytes: number }[] = [];
  let totalBytes = 0, onDisk = 0;
  const buckets = { "<50 KB": 0, "50–150 KB": 0, "150–300 KB": 0, "300 KB–1 MB": 0, ">1 MB": 0 };

  for (const id of ids) {
    const c = credits[id];
    const hasAuthor = !!c.author, hasLicense = !!c.licenseShort;
    if (hasAuthor && hasLicense) full++;
    else if (hasAuthor || hasLicense) partial++;
    else bare++;
    const lic = c.licenseShort ?? "(none)";
    byLicense[lic] = (byLicense[lic] ?? 0) + 1;
    if (!isFree(c)) flagged.push(`- \`${id}\` — license=\`${c.licenseShort ?? "?"}\` category=\`${c.licenseCategory ?? "?"}\` author=${c.author ? `\`${c.author}\`` : "—"}`);

    const p = imagePath(id);
    if (p) {
      const bytes = statSync(p).size;
      sizes.push({ id, bytes });
      totalBytes += bytes;
      onDisk++;
      if (bytes < 50 * 1024) buckets["<50 KB"]++;
      else if (bytes < 150 * 1024) buckets["50–150 KB"]++;
      else if (bytes < 300 * 1024) buckets["150–300 KB"]++;
      else if (bytes < 1 << 20) buckets["300 KB–1 MB"]++;
      else buckets[">1 MB"]++;
    }
  }
  sizes.sort((a, b) => b.bytes - a.bytes);
  const mean = onDisk ? totalBytes / onDisk : 0;
  const outliers = sizes.slice(0, 20).map((s) =>
    `- \`${s.id}\` — ${fmtBytes(s.bytes)}${nameById.get(s.id) ? ` (${nameById.get(s.id)})` : ""}`);

  const lines = [
    "# Image attribution coverage",
    "",
    "Auto-generated by `fetch:images`. Reports over the full `data/image-credits.json`.",
    "",
    `**Total images (credited):** ${ids.length}  |  **on disk:** ${onDisk}`,
    "",
    "## Payload size",
    `- **Total on disk:** ${fmtBytes(totalBytes)} across ${onDisk} files`,
    `- **Mean:** ${fmtBytes(mean)}  |  **Largest:** ${sizes.length ? fmtBytes(sizes[0].bytes) : "—"}`,
    "",
    "Distribution:",
    ...Object.entries(buckets).map(([k, v]) => `- ${k}: ${v}`),
    "",
    "### Heaviest 20 (candidates for a local downscale/recompress pass)",
    outliers.length ? "" : "_No files on disk._",
    ...outliers,
    "",
    "## Completeness",
    `- Full (author + license): ${full}`,
    `- Partial (one missing): ${partial}`,
    `- Bare (neither): ${bare}`,
    "",
    "## By license",
    ...Object.entries(byLicense).sort((a, b) => b[1] - a[1]).map(([k, v]) => `- ${k}: ${v}`),
    "",
    `## Flagged — not recognized as free (${flagged.length})`,
    flagged.length ? "" : "_None — every image parses as a CC/PD license._",
    ...flagged,
    "",
  ];
  return lines.join("\n");
}

async function main() {
  const raws: RawTaxon[] = JSON.parse(await readFile("data/raw-taxa.json", "utf8"));
  const withImage = raws.filter((r) => r.imageUrl);
  const nameById = new Map(raws.map((r) => [r.id, r.name]));
  await mkdir(IMG_DIR, { recursive: true });

  let credits: ImageCredits = {};
  try { credits = JSON.parse(await readFile(CREDITS_PATH, "utf8")); } catch { /* first run */ }

  let fetched = 0, skipped = 0, failed = 0;
  for (const r of withImage) {
    if (alreadyHave(r.id, credits)) { skipped++; continue; }
    const title = fileTitleFromUrl(r.imageUrl!);
    if (!title) { failed++; console.warn(`no File: title for ${r.id} (${r.imageUrl})`); continue; }
    const url = `${API}?action=query&format=json&prop=imageinfo&iiprop=extmetadata%7Curl&iiurlwidth=${THUMB_WIDTH}&titles=${encodeURIComponent(title)}`;
    try {
      const j = await fetchJSON(url);
      const page: any = Object.values(j.query?.pages ?? {})[0];
      const ii = page?.imageinfo?.[0];
      if (!ii?.thumburl) { failed++; console.warn(`no thumburl for ${r.id} (${title})`); continue; }
      const em = ii.extmetadata ?? {};
      const val = (k: string) => (em[k]?.value as string | undefined);
      const credit: ImageCredit = {
        author: sanitizeArtist(val("Artist")),
        licenseShort: val("LicenseShortName"),
        licenseUrl: val("LicenseUrl"),
        licenseCategory: val("License"),
        sourceFileUrl: ii.url,
      };
      const ext = extFromUrl(ii.thumburl);
      await download(ii.thumburl, `${IMG_DIR}/${r.id}.${ext}`);
      credits[r.id] = credit;
      fetched++;
      if (fetched % 25 === 0) {
        await writeFile(CREDITS_PATH, JSON.stringify(credits, null, 0)); // periodic flush
        console.log(`images: ${fetched} fetched, ${skipped} skipped`);
      }
      await sleep(1000); // ~1 req/sec, be polite
    } catch (e) {
      failed++;
      console.warn(`image ${r.id} failed:`, (e as Error).message);
    }
  }

  await writeFile(CREDITS_PATH, JSON.stringify(credits, null, 0));
  await mkdir("docs/superpowers", { recursive: true });
  await writeFile(REPORT_PATH, renderReport(credits, nameById));

  console.log("=== Mesozooa image harvest ===");
  console.log(`images referenced: ${withImage.length}`);
  console.log(`fetched this run:  ${fetched}`);
  console.log(`skipped (present): ${skipped}`);
  console.log(`failed:            ${failed}`);
  console.log(`credits total:     ${Object.keys(credits).length}`);
  console.log(`report:            ${REPORT_PATH} (payload size + outliers inside)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Smoke-test on a tiny slice**

Temporarily verify plumbing without the full ~28-min run: run the script and interrupt after it logs
the first "images: 25 fetched" line (Ctrl-C), OR confirm on a machine with `data/raw-taxa.json`
present that it begins downloading. Then check:

Run: `ls public/images | head; python3 -c "import json;print(len(json.load(open('data/image-credits.json'))))"`
Expected: several `Q*.jpg`/`.png` files; a positive credit count. (Full harvest happens in Task 4.)

- [ ] **Step 5: Commit**

```bash
git add scripts/fetch-images.ts package.json .gitignore
git commit -m "feat(images): fetch-images harvest — Commons thumbnails + credits + coverage report"
```

---

## Task 4: Run the full harvest

Not a code change — the data-generation run that populates the local images and credits. Fold into
Task 3's review if executing inline, but it gets its own gate because the coverage report is a
reviewable deliverable.

**Files:** none (generates `public/images/*`, `data/image-credits.json`, the report).

- [ ] **Step 1: Run the full harvest**

Run: `npm run fetch:images`
Expected: ~28 min on first run; ends with the `=== Mesozooa image harvest ===` summary. `fetched`
≈ 1,663 minus any failures; `failed` small.

- [ ] **Step 2: Verify outputs**

Run:
```bash
ls public/images | wc -l
du -sh public/images
python3 -c "import json; c=json.load(open('data/image-credits.json')); print('credits:', len(c))"
sed -n '1,40p' docs/superpowers/image-credits-report.md
```
Expected: image count ≈ credit count ≈ 1,663; report shows Payload-size (total + distribution +
heaviest 20), Completeness, By-license, and Flagged sections with real numbers. **Check the payload
total + outliers against `du -sh`** — if the total balloons or a handful of files are grody-large,
that scopes a follow-up local downscale/recompress step (out of scope for this plan; flag it to the
user).

- [ ] **Step 3: Confirm presence-skip**

Run: `npm run fetch:images`
Expected: finishes in seconds; summary shows `skipped (present)` ≈ total, `fetched this run: 0`.

- [ ] **Step 4: Commit the credits + report (NOT the images — they're gitignored)**

```bash
git add data/image-credits.json docs/superpowers/image-credits-report.md
git commit -m "data(images): harvest Commons credits + thumbnails; add coverage report"
```

---

## Task 5: Bake credits into the tree — `build-tree.ts` + types

`build:data` reads `data/image-credits.json`, rewrites each node's `imageUrl` to the local path, and
attaches the credit fields. Requires the type + passthrough changes so the fields survive assembly.

**Files:**
- Modify: `src/lib/tree/types.ts` (add fields to `TreeNode`)
- Modify: `src/lib/tree/assemble.ts:50-63` (passthrough)
- Modify: `scripts/build-tree.ts` (read credits, rewrite `imageUrl`, attach fields)

**Interfaces:**
- Consumes: `data/image-credits.json` (`ImageCredits`, keyed by Q-id = node id).
- Produces: `TreeNode` gains `imageAuthor?`, `imageLicense?`, `imageLicenseUrl?`; `imageUrl` now holds
  a local `/images/<Qid>.<ext>` path. The extension is recovered from the on-disk file.

- [ ] **Step 1: Extend the `TreeNode` type**

In `src/lib/tree/types.ts`, add to the `TreeNode` interface (after `imageUrl?: string;`):

```typescript
  imageUrl?: string;         // local path "/images/<Qid>.<ext>" after build:data
  imageAuthor?: string;      // sanitized author (from Commons Artist)
  imageLicense?: string;     // license short name, e.g. "CC BY-SA 4.0"
  imageLicenseUrl?: string;  // license deed URL
```

- [ ] **Step 2: Pass the credit fields through `assemble.ts`**

In `src/lib/tree/assemble.ts`, in the node-construction object (currently ends
`imageUrl: r.imageUrl, wikipediaUrl: r.wikipediaUrl,`), the credit fields are NOT on `RawTaxon` — they
are attached in build-tree AFTER assembly (Step 3 mutates `tree.nodes` directly). So `assemble.ts`
needs **no change** for the credit fields. Leave it as-is. (This step is a no-op checkpoint — confirm
the credit attach in Step 3 mutates the assembled tree, not the raws.)

- [ ] **Step 3: Read credits and mutate the assembled tree in `build-tree.ts`**

Add the import near the other `../src/lib/...` imports:

```typescript
import type { ImageCredits } from "../src/lib/image-credits";
```

Read the credits alongside the other reads (after the `pbdbByName` read, ~line 52):

```typescript
  let imageCredits: ImageCredits = {};
  try { imageCredits = JSON.parse(await readFile("data/image-credits.json", "utf8")); }
  catch { console.warn("no data/image-credits.json — images will keep Commons hotlinks"); }
```

Then, AFTER the final `tree` is assembled (after line 115, before `markPlayable(tree)`), add a pass
that rewrites `imageUrl` to a local path and attaches credits. It must find the on-disk extension:

```typescript
  // Rewrite Commons hotlinks to local /images paths + attach per-image credit. Only touch nodes
  // that have a downloaded thumbnail (credit entry present); leave the rest untouched so a node
  // whose harvest failed keeps whatever it had rather than pointing at a missing file.
  const { existsSync } = await import("node:fs");
  for (const node of Object.values(tree.nodes)) {
    if (!node.imageUrl) continue;
    const credit = imageCredits[node.id];
    if (!credit) { delete node.imageUrl; continue; } // no local file -> no image (falls back to ???)
    const ext = ["jpg", "jpeg", "png", "gif", "svg", "webp", "tif", "tiff"]
      .find((e) => existsSync(`public/images/${node.id}.${e}`));
    if (!ext) { delete node.imageUrl; continue; }
    node.imageUrl = `/images/${node.id}.${ext}`;
    if (credit.author) node.imageAuthor = credit.author;
    if (credit.licenseShort) node.imageLicense = credit.licenseShort;
    if (credit.licenseUrl) node.imageLicenseUrl = credit.licenseUrl;
  }
```

- [ ] **Step 4: Rebuild the data and verify no Commons URLs remain**

Run:
```bash
npm run build:data
grep -c wikimedia src/data/tree.json || echo "0 wikimedia hits"
python3 -c "import json; t=json.load(open('src/data/tree.json'))['nodes']; n=[v for v in t.values() if v.get('imageUrl')]; print('with local image:', len(n)); print('sample:', n[0]['imageUrl'], '| author:', n[0].get('imageAuthor'), '| lic:', n[0].get('imageLicense'))"
```
Expected: `0 wikimedia hits` (grep exits non-zero → prints the fallback); "with local image" is
positive; sample `imageUrl` is `/images/Q*.jpg` and carries author + license.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add src/lib/tree/types.ts scripts/build-tree.ts src/data/tree.json
git commit -m "feat(images): bake local image paths + credits into tree.json"
```

---

## Task 6: Render the credit line — `SpecimenCard.svelte`

Replace the hardcoded `Image: Wikimedia Commons` placeholder with the real author + linked license,
with a fallback to `Wikimedia Commons` when the author is unknown.

**Files:**
- Modify: `src/lib/game/components/SpecimenCard.svelte`

**Interfaces:**
- Consumes: `node.imageAuthor`, `node.imageLicense`, `node.imageLicenseUrl` (Task 5); `formatCredit`
  (Task 2).

- [ ] **Step 1: Import `formatCredit` and derive the display**

In the `<script lang="ts">` block, add the import. The component is at
`src/lib/game/components/SpecimenCard.svelte`; the helper is at `src/lib/image-credits.ts` — both
under `src/`, a clean in-tree import:

```typescript
  import { formatCredit } from "../../image-credits";
```

Then derive:

```typescript
  let credit = $derived(node?.imageUrl
    ? formatCredit({ author: node.imageAuthor, licenseShort: node.imageLicense, licenseUrl: node.imageLicenseUrl })
    : null);
```

- [ ] **Step 2: Replace the credit markup**

Replace the current credit block:

```svelte
  {#if node?.imageUrl}
    <!-- per-image credit slot. Placeholder until the Commons author/license harvest lands
         (see deferred-findings §D). Each Commons file needs its own author + license. -->
    <p class="credit">Image: Wikimedia Commons</p>
  {/if}
```

with:

```svelte
  {#if node?.imageUrl && credit}
    <p class="credit">
      {credit.author ?? "Wikimedia Commons"}{#if credit.licenseShort}
        · {#if credit.licenseUrl}<a href={credit.licenseUrl} target="_blank" rel="noopener noreferrer">{credit.licenseShort}</a>{:else}{credit.licenseShort}{/if}
      {/if}
    </p>
  {/if}
```

- [ ] **Step 3: Style the credit link (reuse the muted credit tone)**

In the `<style>` block, add a rule so the license link inherits the muted credit color rather than the
default link color:

```css
  .credit a { color: inherit; text-decoration: underline; }
```

- [ ] **Step 4: Verify with svelte-check + a running app**

Run:
```bash
npx svelte-check --threshold error
npm run dev
```
Then open the app, solve a Practice round (or use `/gallery.html`), and confirm the specimen photo
shows a credit line like `Emily Willoughby · CC BY-SA 4.0` with the license linked, and that a
credit-less image shows `Wikimedia Commons`.

Expected: `svelte-check` reports 0 errors; the credit line renders in both game and Explore.

- [ ] **Step 5: Commit**

```bash
git add src/lib/game/components/SpecimenCard.svelte
git commit -m "feat(images): render per-image author + linked license in specimen card"
```

---

## Task 7: Docs — update CLAUDE.md + deferred-findings

Record the pass so the backlog stays honest (per the working agreement) and mark the release item
resolved.

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/superpowers/deferred-findings.md`

- [ ] **Step 1: Mark the deferred item resolved**

In `docs/superpowers/deferred-findings.md`, move the "Per-image attribution (REQUIRED before public
release)" bullet from §D to the "Resolved" section with the fixing commits, and note the new
`fetch:images` pipeline stage + `public/images/` gitignore.

- [ ] **Step 2: Update CLAUDE.md**

Add a status bullet under "Status (what's built)" describing the images pass (local thumbnails, credit
harvest, `fetch:images`), and update the **Build** entry under "Key parameters" to include
`fetch:images` in the pipeline order. Note the strictness-line follow-up under "What's next".

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/deferred-findings.md
git commit -m "docs: record local-images/attribution pass; mark release item resolved"
```

---

## Self-Review

**Spec coverage:**
- Harvest step (spec §1) → Task 3. ✅
- Thumbnails ~640px, use `thumburl` → Task 3 (`THUMB_WIDTH`, `ii.thumburl`). ✅
- Presence-skip + `--force` (spec decision) → Task 3 `alreadyHave` + `FORCE`. ✅
- Two-tier storage (spec §2) → Task 3 gitignore + `data/image-credits.json`. ✅
- Bake: rewrite `imageUrl`, add credit fields (spec §3) → Task 5. ✅
- Observable proof `grep wikimedia` = 0 → Task 5 Step 4. ✅
- Coverage report over full credits (spec §4) → Task 3 `renderReport`, Task 4 review gate. ✅
- Payload size + outliers in report (user add-on) → Task 3 `renderReport` size section, Task 4
  Step 2 `du -sh` cross-check. ✅
- UI credit line full/partial/bare (spec §5) → Tasks 2 + 6. ✅
- Pure helpers TDD-tested, shared module → Tasks 1–2 (`src/lib/image-credits.ts`). ✅
- Ship-all this pass; strictness deferred → not implemented (correct; documented Task 7). ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 2's "no-op checkpoint" in
Task 5 Step 2 is deliberate (documents *why* assemble needs no change) not a placeholder.

**Type consistency:** `ImageCredit`/`ImageCredits`/`CreditDisplay` defined in Task 1–2, consumed with
matching field names in Tasks 3, 5, 6. `formatCredit` signature identical across definition (Task 2)
and use (Task 6). Node fields `imageAuthor`/`imageLicense`/`imageLicenseUrl` defined (Task 5 Step 1)
and consumed (Task 6 Step 1) identically.

**Module placement resolved:** `image-credits.ts` lives in `src/lib/` so both consumers import it
cleanly — the `.svelte` card via `../../image-credits` (in-tree) and the scripts via
`../src/lib/image-credits` (the established `scripts/` → `src/lib/` direction, cf. `fetch-pbdb.ts` →
`../src/lib/pbdb-parse`). No cross-boundary import remains.

**Follow-up this plan may surface (out of scope):** if Task 4's payload report shows the bundle
ballooning or grody outlier files, scope a local image-processing step (downscale/recompress with
e.g. `sharp`). The report is built to make that call; the step itself is a separate plan.
