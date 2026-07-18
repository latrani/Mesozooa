# Image downscale + WebP recompress (release sub-project A.5)

**Date:** 2026-07-17
**Status:** Design approved; ready for implementation plan.
**Context:** Inserted between sub-project A (local images + attribution) Task 4 and Task 5. The A
harvest downloaded 1,668 Commons thumbnails totalling **370 MB** — too heavy for the offline iPad
bundle. Measurement (A's coverage report) showed PNGs are 536 files / 55% of bytes, and Commons
rounded our 640px request up to 960px buckets, so the payload is both wrong-format and
over-resolution. This sub-project adds a processing pass; sub-project A stays paused at Task 4 so
`tree.json` bakes once against the final processed paths (no re-bake).

## Problem

`public/images/` holds 370 MB of Commons originals. Two causes:
1. **Format:** PNG stores continuous-tone paleoart/photos badly (536 PNGs = 205 MB vs 1,119 JPGs =
   166 MB). The heaviest 20 are almost all PNG paleoart (up to 4 MB each).
2. **Resolution:** Commons returned 960px-wide renditions (rounded up from our 640 request).

## Decisions (settled in brainstorm)

- **Separate `process-images.ts` step, NOT folded into `fetch-images.ts`.** The 1,668 downloads are
  a slow (~40 min), network-bound, expensive artifact; processing is cheap and re-derivable.
  Decoupling means re-tuning quality re-runs *only* processing (seconds over local originals) instead
  of re-triggering the harvest. Keeps `fetch-images` single-responsibility.
- **Non-destructive: pristine originals kept in a separate dir.** Originals are the source of truth
  for reprocessing; overwriting them would force lossy-on-lossy re-encode or a re-download to recover
  clean sources. Same two-tier logic as raw-pulls-vs-baked-products, one level down.
- **Width-constrained resize to 640px, never upscale.** The app lays out images by width
  (`width:100%; height:auto`), so width is the only dimension that matters. Measured worst case
  (all 1,668): the tallest images we'd actually downscale reach aspect ~2.4 (`960x2288` →
  `640x1525` ≈ 1.0M px, ~3.5× a typical landscape thumbnail's pixels) — chunky but a handful, not
  grody. The scarier ratios (3.47, 3.04) belong to images *already narrower than 640*, which
  never-upscale leaves untouched. So NO longest-side logic, NO special portrait handling.
- **WebP, quality 80, for everything.** Single codec, single quality knob, handles the heterogeneous
  photo + paleoart pile, and has an alpha channel so PNG transparency survives (sidesteps the
  JPG-on-transparent-background failure). iOS Safari 14+ decodes WebP natively (the target iPad is
  well past that). Uniform `.webp` output also simplifies the downstream bake (no per-file extension
  lookup).
- **`cwebp` (already installed via Homebrew), behind a sealed encoder.** Zero new npm deps; the whole
  pipeline is already build-time + machine-local (needs network + `raw-taxa.json`, all outputs
  gitignored), so "already installed" beats "captured in package.json" here. `cwebp -resize W 0`
  gives width-constrain-preserve-aspect, BUT **`cwebp -resize` upscales unconditionally** (verified
  live: a 288px source → 640px) — unlike ImageMagick's `>` qualifier, it has no "only if larger"
  form. So never-upscale MUST be enforced in our code: read the source width first, pass `-resize`
  only when it exceeds 640, else encode at native size (no `-resize`).
  **Switching-cost insurance:** all `cwebp` knowledge lives in ONE function `encodeWebp()`. Swapping
  to `sharp` later rewrites only that function's body (same signature, same call sites, same output
  paths → no re-bake). Nothing outside it parses cwebp flags or output. This is a binding design
  constraint, not a nicety — leaking cwebp assumptions into the walk/report logic is what would make
  a switch expensive.

## Architecture

### 1. Directory split + rename (plan step 1)

Two gitignored tiers:

| Dir | Contents | Written by | Git |
|---|---|---|---|
| `public/images-src/` | pristine Commons originals (mixed .jpg/.png/…) | `fetch-images.ts` | gitignored |
| `public/images/` | processed WebP, app-facing | `process-images.ts` | gitignored |

- **Rename:** `mv public/images public/images-src` (plain move — gitignored, no `git mv`). Preserves
  the 1,668 already-downloaded originals; no re-fetch.
- **`fetch-images.ts` change:** its `IMG_DIR` const `public/images` → `public/images-src`.
  Presence-skip logic is unchanged (it keys off that const), so re-runs still skip correctly.
- **`.gitignore`:** add `public/images-src/` (`public/images/` already ignored).

### 2. `scripts/process-images.ts`

New script; npm script `process:images`; spliced into `fetch` between `fetch:images` and
`build:data`, so the full pipeline is: `fetch:wikidata → fetch:pbdb → fetch:images → process:images
→ build:data`.

Behaviour:
1. Walk `public/images-src/`.
2. Per source file, output path = `public/images/<Qid>.webp` (Q-id = source basename sans extension).
3. **Presence-skip:** if the `.webp` exists, skip unless `--force` (idempotent; re-runs near-instant).
4. Call `encodeWebp()`.
5. Emit a size report: before/after totals, compression ratio, per-run counts, failures.

**Config consts (top of file, for re-tuning):** `WIDTH = 640`, `QUALITY = 80`.

**Sealed encoder (the only cwebp-aware code):**

```
encodeWebp(srcPath, destPath, opts: { maxWidth: number; quality: number }): void
  1. read source width (via cwebp/an image-header read)
  2. if srcWidth > maxWidth:  cwebp -q {quality} -resize {maxWidth} 0 {srcPath} -o {destPath}
     else (never upscale):    cwebp -q {quality}                     {srcPath} -o {destPath}
```

`-resize {maxWidth} 0` = width set, height 0 = preserve aspect. **cwebp `-resize` upscales
unconditionally, so the `srcWidth > maxWidth` guard — in our code — is what enforces never-upscale;
the flag alone does not.** Reading the source width can reuse the same `sips -g pixelWidth`
(macOS, already used in this repo's measurement) or cwebp's own read — an implementation detail
sealed inside this function. Run cwebp via `execFileSync` (args as array — no shell string
interpolation, so filenames with spaces/quotes are safe).

**Error handling:** per-file try/catch → `failed++; continue`. One bad source never aborts the batch.
A failed encode simply produces no `.webp`; the bake step (sub-project A Task 5) treats a missing
processed file as "no image" → `? ? ?` placeholder.

### 3. Downstream ripple into sub-project A (applied when A resumes at Task 5)

Two simplifications to the paused plan, both because output is now uniform `.webp`:

- **Task 5 bake:** `imageUrl` becomes `/images/${node.id}.webp` directly — DROP the multi-extension
  `existsSync` probe the original Task 5 used to recover each file's extension. Still gate on "does
  `public/images/<Qid>.webp` exist?" so a node with no processed file falls back to placeholder.
- **Task 5 reads `public/images/`** = the processed dir (correct — that's what ships). Harvest
  failures and encode failures both degrade gracefully to placeholder.
- **Task 6 (UI credit line): no change** — reads baked node fields, format-agnostic.

## Components & boundaries

- `scripts/process-images.ts` — I/O + orchestration (walk, skip, report). Codec-agnostic except for
  its call to `encodeWebp()`. Not unit-tested (pure I/O).
- `encodeWebp()` — the sealed cwebp seam. The single point of change for a future `sharp` swap.
- `fetch-images.ts` — one-const change (`IMG_DIR` → `images-src`).

## Testing & verification

- **No unit tests** — pure I/O + shell-out (same rationale as `fetch-images.ts`).
- **Controller-owned run** — per this project's SDD mode, subagents don't shell out to system tools /
  do machine-local asset generation; the controller runs `process:images`.
- **Acceptance checks:**
  1. `public/images/` holds ~1,668 `.webp` files after a run.
  2. `du -sh public/images` shows the payload drop (target: 370 MB → ~60–100 MB); the report prints
     before/after + compression ratio.
  3. Spot-check heavy former-PNGs (Pengornithidae etc.) render clean at q80 — no obvious artifacts.
  4. Re-run without `--force` → near-instant (presence-skip).
- **Tuning loop is the real deliverable:** if q80 looks rough or payload's still chunky, adjust
  `WIDTH`/`QUALITY` and re-run (seconds, reads local originals).

## Explicitly out of scope (deferred, not gaps)

- **Sub-project A Tasks 5–6** (bake + UI) — resume after this completes, per the pause decision.
- **Per-content codec selection** (JPG for photos, PNG for line art) — rejected; WebP-for-all is
  simpler and its alpha channel covers the transparency case.
- **`sharp` dependency** — `cwebp` chosen; the sealed encoder makes a later switch a one-function
  change if ever needed.
- **Offline/portable build, nginx** — sub-project B (unchanged by this).
