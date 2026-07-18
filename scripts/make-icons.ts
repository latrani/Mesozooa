// scripts/make-icons.ts — one-time icon generator (output committed; build does NOT run this)
import { readFileSync, writeFileSync, mkdirSync, unlinkSync } from "node:fs";
import { execFileSync } from "node:child_process";

const OUT_DIR = "public/icons";
const PAPER = "#f8f4ea";   // --bg-page
const TURQ = "#0d9aa8";    // --turq

// The source claw glyph — the clean standalone footprint (genus.svg is now a busier
// footprint-in-a-disc, too detailed to read at icon sizes).
const CLAW = "src/assets/claw.svg";
const CLAW_RAW = readFileSync(CLAW, "utf8");
const [, CLAW_W, CLAW_H] = (CLAW_RAW.match(/viewBox="0 0 (\d+) (\d+)"/) ?? ["", "255", "305"]);

// Extract the <g>…</g> drawing from claw.svg (skips the xml/doctype prolog) and color it turquoise.
function footprintGroup(): string {
  const m = CLAW_RAW.match(/<g\b[\s\S]*?<\/g>/);
  if (!m) throw new Error(`no <g> group found in ${CLAW}`);
  return m[0].replace(/<path /g, `<path fill="${TURQ}" `);
}

// Master SVG at `canvas`px: paper square + footprint (native claw viewBox) centered at `frac` height.
function masterSvg(canvas: number, frac: number): string {
  const g = footprintGroup();
  const fh = Math.round(canvas * frac);
  const fw = Math.round((fh * Number(CLAW_W)) / Number(CLAW_H));
  const x = Math.round((canvas - fw) / 2);
  const y = Math.round((canvas - fh) / 2);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
    `<rect width="${canvas}" height="${canvas}" fill="${PAPER}"/>` +
    `<svg x="${x}" y="${y}" width="${fw}" height="${fh}" viewBox="0 0 ${CLAW_W} ${CLAW_H}">${g}</svg>` +
    `</svg>`
  );
}

function render(svg: string, size: number, outfile: string): void {
  const tmp = `${OUT_DIR}/.master-${size}.svg`;
  writeFileSync(tmp, svg);
  execFileSync("rsvg-convert", ["-w", String(size), "-h", String(size), tmp, "-o", `${OUT_DIR}/${outfile}`]);
  unlinkSync(tmp); // don't leave the intermediate master SVG behind
}

mkdirSync(OUT_DIR, { recursive: true });
const standard = masterSvg(1024, 0.62);
const maskable = masterSvg(1024, 0.48); // extra padding for the maskable safe zone
render(standard, 180, "pwa-180.png");
render(standard, 192, "pwa-192.png");
render(standard, 512, "pwa-512.png");
render(maskable, 512, "pwa-512-maskable.png");
console.log("icons written to", OUT_DIR);
