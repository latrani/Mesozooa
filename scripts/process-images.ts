import { readdirSync, existsSync, statSync, mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";

const SRC_DIR = "images-src";
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
  // A failed width read must NOT fall through to srcWidth=0 (which skips the -resize guard and
  // ships the image un-capped). Throw instead — main() counts it as failed and warns, and we
  // never emit a full-resolution WebP by accident.
  if (!m) throw new Error(`sips returned no pixelWidth for ${srcPath} — refusing to encode un-capped`);
  const srcWidth = Number(m[1]);

  // Build cwebp args for a given input, applying the never-upscale guard (cwebp -resize upscales
  // unconditionally, so we only pass it when the source is actually wider than maxWidth).
  const cwebpArgs = (input: string): string[] => {
    const args = ["-q", String(opts.quality)];
    if (srcWidth > opts.maxWidth) args.push("-resize", String(opts.maxWidth), "0");
    args.push(input, "-o", destPath);
    return args;
  };

  try {
    execFileSync("cwebp", cwebpArgs(srcPath), { stdio: "ignore" });
  } catch {
    // cwebp can't decode some inputs (CMYK JPEGs, GIFs). sips can — transcode to a temp PNG, then
    // retry cwebp on that. Temp lives next to dest; loop is sequential so the name can't collide.
    const tmpPng = `${destPath}.tmp.png`;
    try {
      execFileSync("sips", ["-s", "format", "png", srcPath, "--out", tmpPng], { stdio: "ignore" });
      execFileSync("cwebp", cwebpArgs(tmpPng), { stdio: "ignore" });
    } finally {
      rmSync(tmpPng, { force: true });
    }
  }
}

function dirBytes(dir: string): number {
  if (!existsSync(dir)) return 0;
  // Filter dotfiles (e.g. .DS_Store) to match the processing loop's source filter, so the
  // reported originals size / ratio isn't inflated by files we never encode.
  return readdirSync(dir)
    .filter((f) => !f.startsWith("."))
    .reduce((sum, f) => sum + statSync(`${dir}/${f}`).size, 0);
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
