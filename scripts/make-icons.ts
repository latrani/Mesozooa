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

// Flat single-color SVG favicon (transparent background), the primary <link rel="icon"> for modern
// browsers; the favicon PNGs below are the Safari / legacy fallback. Turquoise reads on both a light
// and a dark tab bar, so no dark-mode variant is needed. Flipped 180° to match the "M" branding.
function faviconSvg(): string {
  const w = Number(CLAW_W), h = Number(CLAW_H);
  const pad = Math.round(h * 0.08); // a little breathing room so the toes don't touch the edge
  const spin = `rotate(180 ${w / 2} ${h / 2})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w + pad * 2} ${h + pad * 2}">` +
    `<g transform="${spin}">${footprintGroup()}</g></svg>`
  );
}

// Master SVG at `canvas`px: paper square + footprint (native claw viewBox) centered at `frac` height.
function masterSvg(canvas: number, frac: number): string {
  const g = footprintGroup();
  const fh = Math.round(canvas * frac);
  const fw = Math.round((fh * Number(CLAW_W)) / Number(CLAW_H));
  const x = Math.round((canvas - fw) / 2);
  const y = Math.round((canvas - fh) / 2);
  // Flip the footprint 180° so it reads as an "M" for Mesozooa — the app-icon / favicon / header
  // orientation. (The upright footprint lives only inside the tree's circle, via genus.svg.)
  const spin = `rotate(180 ${Number(CLAW_W) / 2} ${Number(CLAW_H) / 2})`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas}" height="${canvas}" viewBox="0 0 ${canvas} ${canvas}">` +
    `<rect width="${canvas}" height="${canvas}" fill="${PAPER}"/>` +
    `<svg x="${x}" y="${y}" width="${fw}" height="${fh}" viewBox="0 0 ${CLAW_W} ${CLAW_H}"><g transform="${spin}">${g}</g></svg>` +
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
// Favicon: a flat transparent SVG (primary) + PNGs (fallback) at a tighter crop so the footprint
// stays legible down at 16px in a browser tab.
writeFileSync(`${OUT_DIR}/favicon.svg`, faviconSvg());
const favicon = masterSvg(1024, 0.74);
render(favicon, 32, "favicon-32.png");
render(favicon, 16, "favicon-16.png");
console.log("icons written to", OUT_DIR);
