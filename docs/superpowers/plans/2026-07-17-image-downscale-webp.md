# Image Downscale + WebP Recompress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shrink the 370 MB image payload by width-capping to 640px (never upscaling) and re-encoding
to WebP, via a separate processing step over pristine originals.

**Architecture:** Rename the harvest's output dir to `public/images-src/` (pristine originals); a new
`scripts/process-images.ts` reads those and writes width-capped WebP to `public/images/` (app-facing).
All `cwebp` knowledge lives in one sealed `encodeWebp()` function so a future swap to `sharp` is a
one-function change. Re-tuning quality re-runs only processing (seconds over local originals), never
the ~40-min harvest.

**Tech Stack:** TypeScript, `tsx` (script runner), `cwebp` (Homebrew, already installed) via
`node:child_process` `execFileSync`, Node `node:fs`.

## Global Constraints

- **`verbatimModuleSyntax` is ON** — type-only imports MUST use `import type`. Run `npx tsc --noEmit`
  before committing; Vitest does NOT catch violations.
- **Width-constrained, NEVER upscale.** Resize to max 640px wide, preserve aspect. `cwebp -resize`
  upscales unconditionally (verified: 288px → 640px), so the never-upscale guard MUST be in our code:
  read source width, pass `-resize 640 0` only when `srcWidth > 640`, else encode with no `-resize`.
- **WebP, quality 80, for everything.** Uniform `.webp` output (one codec, one quality knob; alpha
  channel preserves PNG transparency).
- **Sealed encoder.** ALL `cwebp` knowledge (flags, invocation, width-read) lives inside
  `encodeWebp()`. No cwebp flags/output parsing anywhere else. This is binding — it's the switching
  cost insurance.
- **Non-destructive.** `process-images` reads `public/images-src/`, writes `public/images/`. It NEVER
  writes to or deletes `public/images-src/`.
- **Safe subprocess invocation.** Run `cwebp` via `execFileSync` with args as an array — never a shell
  string — so filenames with spaces/quotes are safe.
- **Config consts at top of file** — `MAX_WIDTH = 640`, `QUALITY = 80` — so re-tuning is a one-line edit.

## File Structure

- **Modify `scripts/fetch-images.ts:12`** — `IMG_DIR` const `"public/images"` → `"public/images-src"`.
  One line; presence-skip keys off this const so it keeps working against the renamed dir.
- **Modify `.gitignore`** — add `public/images-src/` (line 9 already has `public/images/`).
- **Create `scripts/process-images.ts`** — the processing step: walk `images-src/`, skip-if-webp-exists,
  `encodeWebp()` each, emit a before/after size report. Holds the sealed `encodeWebp()`.
- **Modify `package.json`** — add `process:images` script; splice into `fetch` between `fetch:images`
  and `build:data`.

There is a one-time filesystem rename (`mv public/images public/images-src`) that is a controller
action, not a code change — see Task 1 Step 1.

---

## Task 1: Rename originals dir + point the harvest at it

Preserve the 1,668 already-downloaded originals under the new source-dir name, and update the harvest
script + gitignore so future harvests write there.

**Files:**
- Modify: `scripts/fetch-images.ts:12`
- Modify: `.gitignore`
- (Controller filesystem action: `mv public/images public/images-src`)

**Interfaces:**
- Consumes: nothing.
- Produces: `public/images-src/` now holds the pristine Commons originals (mixed `.jpg`/`.png`/…);
  `public/images/` no longer exists until Task 2 recreates it as the processed dir.

- [ ] **Step 1: Rename the existing originals dir (controller action)**

The 1,668 files currently in `public/images/` are the pristine originals. Move them:

```bash
mv public/images public/images-src
ls public/images-src | wc -l    # expect ~1668
```

(Plain `mv`, not `git mv` — the dir is gitignored.)

- [ ] **Step 2: Point `fetch-images.ts` at the new dir**

In `scripts/fetch-images.ts`, change line 12:

```typescript
const IMG_DIR = "public/images-src";
```

(Was `"public/images"`. Presence-skip, `mkdir`, and download paths all derive from `IMG_DIR`, so this
one line moves the whole harvest to the source dir.)

- [ ] **Step 3: Gitignore the source dir**

In `.gitignore`, add below the existing `public/images/` line:

```
public/images-src/
```

- [ ] **Step 4: Verify the harvest still skips (no re-download)**

Run: `npm run fetch:images`
Expected: finishes in seconds; summary shows `skipped (present): 1668`, `fetched this run: 0`
(presence-skip now finds the files under `images-src/`). If it starts downloading, the rename or the
const change is wrong — stop and fix.

- [ ] **Step 5: Typecheck + commit**

```bash
npx tsc --noEmit
git add scripts/fetch-images.ts .gitignore
git commit -m "refactor(images): harvest writes public/images-src (pristine originals)"
```

---

## Task 2: The processing step — `scripts/process-images.ts`

Walk the originals, width-cap + WebP-encode each into `public/images/`, skip already-encoded files,
report the size delta. All cwebp logic sealed in `encodeWebp()`.

**Files:**
- Create: `scripts/process-images.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `public/images-src/<Qid>.<ext>` (originals from Task 1).
- Produces: `public/images/<Qid>.webp` for every processable source; a console size report. npm script
  `process:images`; spliced into the `fetch` pipeline before `build:data`.

- [ ] **Step 1: Add the npm script**

In `package.json` `scripts`, add `process:images` and splice it into `fetch` between `fetch:images`
and `build:data`:

```json
"fetch": "npm run fetch:wikidata && npm run fetch:pbdb && npm run fetch:images && npm run process:images && npm run build:data",
"fetch:wikidata": "tsx scripts/fetch-wikidata.ts",
"fetch:pbdb": "tsx scripts/fetch-pbdb.ts",
"fetch:images": "tsx scripts/fetch-images.ts",
"process:images": "tsx scripts/process-images.ts",
"build:data": "tsx scripts/build-tree.ts",
```

- [ ] **Step 2: Write the processing script**

```typescript
// scripts/process-images.ts
import { readdirSync, existsSync, statSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC_DIR = "public/images-src";
const OUT_DIR = "public/images";
const MAX_WIDTH = 640;
const QUALITY = 80;
const FORCE = process.argv.includes("--force");

/** The ONLY cwebp-aware code. Read source width; resize only when wider than maxWidth (cwebp
 *  -resize upscales unconditionally, so never-upscale is enforced HERE, not by the flag). */
function encodeWebp(srcPath: string, destPath: string, opts: { maxWidth: number; quality: number }): void {
  // Source width from `cwebp -print_size`? No — read it portably via the file header using cwebp's
  // sibling `webpinfo` isn't guaranteed; use ImageMagick-free `sips` (macOS, already used in-repo).
  const widthOut = execFileSync("sips", ["-g", "pixelWidth", srcPath], { encoding: "utf8" });
  const m = widthOut.match(/pixelWidth:\s*(\d+)/);
  const srcWidth = m ? Number(m[1]) : 0;
  const args = ["-q", String(opts.quality)];
  if (srcWidth > opts.maxWidth) args.push("-resize", String(opts.maxWidth), "0");
  args.push(srcPath, "-o", destPath);
  execFileSync("cwebp", args, { stdio: "ignore" });
}

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).reduce((sum, f) => sum + statSync(`${dir}/${f}`).size, 0);
}

function fmtMB(n: number): string {
  return `${(n / (1 << 20)).toFixed(1)} MB`;
}

function main(): void {
  if (!existsSync(SRC_DIR)) { console.error(`no ${SRC_DIR} — run fetch:images first`); process.exit(1); }
  mkdirSync(OUT_DIR, { recursive: true });
  const srcBefore = dirBytes(SRC_DIR);
  const sources = readdirSync(SRC_DIR).filter((f) => !f.startsWith("."));

  let encoded = 0, skipped = 0, failed = 0;
  for (const file of sources) {
    const id = file.replace(/\.[^.]+$/, ""); // strip extension -> Q-id
    const srcPath = `${SRC_DIR}/${file}`;
    const destPath = `${OUT_DIR}/${id}.webp`;
    if (!FORCE && existsSync(destPath)) { skipped++; continue; }
    try {
      encodeWebp(srcPath, destPath, { maxWidth: MAX_WIDTH, quality: QUALITY });
      encoded++;
      if (encoded % 100 === 0) console.log(`processed ${encoded} (${skipped} skipped)`);
    } catch (e) {
      failed++;
      console.warn(`process ${file} failed:`, (e as Error).message);
    }
  }

  const outAfter = dirBytes(OUT_DIR);
  console.log("=== Mesozooa image processing ===");
  console.log(`sources:        ${sources.length}`);
  console.log(`encoded:        ${encoded}`);
  console.log(`skipped:        ${skipped}`);
  console.log(`failed:         ${failed}`);
  console.log(`originals size: ${fmtMB(srcBefore)}`);
  console.log(`webp size:      ${fmtMB(outAfter)}`);
  console.log(`ratio:          ${srcBefore ? ((100 * outAfter) / srcBefore).toFixed(0) : "—"}% of original`);
}

main();
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/process-images.ts package.json
git commit -m "feat(images): process-images — width-cap + WebP recompress via sealed cwebp encoder"
```

---

## Task 3: Run the processing pass (controller-owned)

Not a code change — the machine-local run that produces the WebP payload. Its own gate because the
payload-size result is a reviewable deliverable (and drives whether q80 needs tuning).

**Files:** none (generates `public/images/*.webp`).

- [ ] **Step 1: Run the processing pass**

Run: `npm run process:images`
Expected: ends with the `=== Mesozooa image processing ===` summary; `encoded` ≈ 1,668,
`failed` small, `ratio` well under 100% (target ~20–30% of original).

- [ ] **Step 2: Verify the payload drop + output**

Run:
```bash
ls public/images | wc -l                 # ~1668 .webp files
ls public/images | grep -vc '\.webp$'    # expect 0 (all webp)
du -sh public/images public/images-src    # processed vs original size
```
Expected: ~1,668 `.webp` files, 0 non-webp; `public/images` dramatically smaller than
`public/images-src` (target 370 MB → ~60–100 MB).

- [ ] **Step 3: Spot-check quality on the former heavy PNGs**

Open a few of the former 4 MB paleoart PNGs' WebP outputs and confirm no obvious artifacts at q80
(e.g. `public/images/Q20072368.webp` Pengornithidae, `Q41535857.webp` Parapengornis,
`Q115547839.webp` Patagopelta). If q80 looks rough or the payload is still too big, adjust `QUALITY`
/ `MAX_WIDTH` in `process-images.ts` and re-run (`--force` to re-encode all) — seconds, since it reads
local originals.

- [ ] **Step 4: Confirm presence-skip**

Run: `npm run process:images`
Expected: near-instant; summary shows `skipped` ≈ total, `encoded: 0`.

- [ ] **Step 5: No commit**

`public/images/` is gitignored — nothing to commit here. This task's output is local WebP files
consumed by the (paused) sub-project A bake. Record the payload numbers in the SDD ledger instead.

---

## Self-Review

**Spec coverage:**
- Separate processing step, not folded into fetch (spec decision) → Task 2. ✅
- Non-destructive: originals in `images-src/`, processed in `images/` (spec §1) → Tasks 1–2; encoder
  never writes SRC_DIR. ✅
- Rename + `fetch-images` IMG_DIR change + gitignore (spec §1) → Task 1. ✅
- Width-cap 640, never upscale, enforced in code not flag (spec constraint) → Task 2 `encodeWebp`
  `srcWidth > opts.maxWidth` guard. ✅
- WebP q80 uniform output (spec decision) → Task 2 (`.webp` dest, QUALITY=80). ✅
- Sealed encoder, only cwebp-aware code (spec constraint) → Task 2 `encodeWebp()`; walk/report/skip
  are codec-agnostic. ✅
- `execFileSync` args-as-array, no shell string (spec constraint) → Task 2 (both cwebp + sips calls). ✅
- Config consts for tuning (spec) → Task 2 `MAX_WIDTH`/`QUALITY` at top. ✅
- Pipeline splice fetch:images → process:images → build:data (spec §2) → Task 2 Step 1. ✅
- Presence-skip + `--force` (spec §2) → Task 2 (`!FORCE && existsSync(destPath)`). ✅
- Payload verification 370→~60-100MB + spot-check (spec testing) → Task 3. ✅
- Downstream Task 5 simplification (uniform `.webp`) → belongs to sub-project A's resume, noted in
  that spec; NOT a task here (correct — out of this plan's scope). ✅

**Placeholder scan:** No TBD/TODO; every code step shows complete code. Task 1 Step 1 is a controller
`mv`, shown as an exact command. Task 3 has no commit by design (gitignored output), stated explicitly.

**Type consistency:** `encodeWebp(srcPath, destPath, { maxWidth, quality })` — signature defined and
called consistently in Task 2. Consts `SRC_DIR`/`OUT_DIR`/`MAX_WIDTH`/`QUALITY`/`FORCE` used
consistently. `IMG_DIR` change in Task 1 matches the existing const name in `fetch-images.ts:12`.

**One implementer note:** `encodeWebp` reads source width via `sips` (macOS, already used in this
repo's measurement scripts). This is a sealed implementation detail — if run on non-macOS, that read
is the single line to swap (e.g. to `cwebp`'s own probe or an image-header read). The sealing is the
point: it's contained to one function, like the cwebp swap itself.
