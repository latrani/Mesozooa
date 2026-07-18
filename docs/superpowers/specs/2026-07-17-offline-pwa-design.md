# Offline/portable PWA build (release sub-project B)

**Date:** 2026-07-17
**Status:** Design approved; ready for implementation plan.
**Context:** The images work (sub-projects A + A.5) made the app fully self-contained — zero runtime
network calls, all data + images baked/local. That is the hard prerequisite for a PWA. This
sub-project adds the "trench coat": an installable, fully-offline home-screen app so Mesozooa runs on
an iPad at "dino camp" with no signal. nginx/HTTPS deploy is a SEPARATE follow-up spec (this one is
verified locally via `npm run preview`).

## Goal

Install Mesozooa to the iPad home screen and have it run fully offline. Concretely: tap the icon →
fullscreen game (no Safari chrome) → every daily/practice answer's photo works with no connection.

## Why this is now cheap

The app is already 100% static with no runtime network (verified: 0 `wikimedia` in any `imageUrl`,
data imported not fetched). A PWA's hard prerequisite is exactly that. So this is "add the costume,"
not "rebuild for offline."

## Key facts (verified, not assumed)

- **iOS Safari storage cap ≈ 1GB baseline** (web.dev, 2024-09), not the old 50MB myth. Our shippable
  bundle is **~67MB** (65MB webp + ~2MB code/assets) — comfortable headroom for precache-everything.
- **Installed PWAs (Add-to-Home-Screen) get an isolated storage container AND are EXEMPT from the
  7-day eviction** that wipes a regular Safari site's cache after a week of no visits. This is the
  clincher for the use case: cache is primed at home, then unused for days before camp — a plain
  offline-Safari bookmark would be evicted and arrive empty; an installed PWA survives.
- **`http://localhost` is a secure context for service workers** (MDN), so `npm run preview`
  (`localhost:4173`) fully verifies SW install + offline with no TLS. (Testing offline ON the iPad
  over LAN needs real HTTPS — a LAN IP is not a secure origin — but that's the nginx follow-up.)
- **Once an installed PWA hits quota, it cannot request more.** We're at 67MB/~1GB, fine — but be
  deliberate: do NOT precache junk (the 441MB `images-src` originals, `gallery.html`).

## Decisions (settled in brainstorm)

- **Full PWA** (manifest + service worker), not offline-Safari-only. The home-screen install is what
  makes it feel like "having Mesozooa," AND it's the only variant that survives the prime-at-home →
  use-at-camp gap (eviction exemption above).
- **`vite-plugin-pwa`** (one dev dependency, wraps Workbox), not a hand-rolled SW. The one genuinely
  hard PWA part is cache invalidation (a redeploy must not serve stale code forever); Workbox solves
  it via the content-hashed filenames Vite already emits. Hand-rolling reimplements that footgun.
- **Precache everything** (app shell + all 67MB webp + fonts), not cache-on-demand. The game's answer
  can be ANY of ~776 playable genera; cache-on-demand would leave un-viewed genera as `? ? ?`
  offline. 67MB one-time on home wifi is a fine cost for guaranteed-complete offline.
- **`registerType: 'autoUpdate'`** — a redeploy is fetched quietly and swapped on next launch; no
  update prompt to babysit.
- **Icon:** the repo's `genus.svg` (theropod footprint) in `--turq` (#0d9aa8) centered with ~⅓
  padding on a `--bg-page` (#f8f4ea) paper tile. (`clade.svg` stays an in-app asset — abstract as a
  launcher.) Prototyped and approved.

## Architecture

### 1. Fix the `images-src` leak (prerequisite — must land first)

**Bug:** `public/images-src/` (441MB pristine originals) ships into `dist/` because Vite copies all
of `public/` verbatim. `dist/` is currently 508MB; it should be ~67MB. This bloats every deploy AND
would pollute the precache budget.

**Fix:** move the harvest originals OUT of `public/` to a top-level `images-src/` (repo root,
gitignored). The processed webp stays at `public/images/` (it SHOULD ship). Update:
- `scripts/fetch-images.ts` — `IMG_DIR` `public/images-src` → `images-src`.
- `scripts/process-images.ts` — `SRC_DIR` `public/images-src` → `images-src` (its `OUT_DIR`
  `public/images` is unchanged).
- `.gitignore` — replace `public/images-src/` with `images-src/`.
- One-time filesystem move of the existing originals (controller): `mv public/images-src images-src`.

Result: `dist/` drops to ~67MB; originals still on disk for reprocessing, just not shipped.

### 2. `vite-plugin-pwa` + service worker

Add `vite-plugin-pwa` (devDependency) to `vite.config.ts` `plugins`, configured:
- `registerType: 'autoUpdate'`.
- **Precache glob** covering the app shell (JS/CSS/HTML for the `index.html` entry), fonts (woff/
  woff2), and `**/*.webp` (the ~1,668 images in `public/images/` → `dist/images/`). Set
  `workbox.maximumFileSizeToCacheInBytes` high enough for the largest asset (the GameBoard JS chunk
  is ~1MB — default Workbox limit is ~2MB, so likely fine, but set explicitly to be safe against the
  full image set / future growth).
- **Excludes:** `gallery.html` + its assets (dev-only), and anything matching the gallery entry.
  `images-src` cannot leak (removed from `public/` in §1).
- **Scope to the app entry** (`index.html`); `navigateFallback` → the app's `index.html` so
  deep/refreshed routes resolve offline. Ensure the gallery is not the fallback.
- **SW registration:** the plugin injects registration (virtual `virtual:pwa-register`) — wire it in
  `src/main.ts` (or rely on the plugin's auto-injection), whichever the plugin version prefers.

**Two-entry wrinkle:** the build has `index.html` + `gallery.html`. The SW precache + navigation
fallback must target the app, not the gallery. The gallery ships unlinked (as today) and simply is
not cached.

### 3. Web manifest + icon

`vite-plugin-pwa` generates `manifest.webmanifest` from config:
- `name: "Mesozooa"`, `short_name: "Mesozooa"`.
- `display: "standalone"` (fullscreen, no browser chrome).
- `start_url: "/"` (opens to the app / Daily, not the gallery).
- `background_color: "#f8f4ea"` (`--bg-page` — splash matches the icon ground, no white flash).
- `theme_color` — `#0d9aa8` (`--turq`) or the placard terracotta; pick against the status bar during
  implementation, default to `--turq`.
- **Icons:** generated from `genus.svg` — turquoise (#0d9aa8) footprint centered with ~⅓ padding on a
  #f8f4ea paper tile. Emit the required sizes: **180×180** (`apple-touch-icon`, iOS home screen),
  **192×192** and **512×512** (manifest), plus a **512×512 maskable** (safe-zone padding for
  Android-style adaptive icons — harmless on iOS). Generation via an SVG wrapper (paper `<rect>` +
  recolored footprint) → `rsvg-convert` to PNG at each size (prototyped in brainstorm); commit the
  generated PNGs so the build doesn't depend on `rsvg-convert` being present. `apple-touch-icon` must
  be referenced from `index.html` `<head>` (iOS reads the `<link rel="apple-touch-icon">`, not the
  manifest, for the home-screen icon).

## Components & boundaries

- `vite.config.ts` — adds the `VitePWA({...})` plugin (manifest + workbox config). The one config
  surface.
- `scripts/fetch-images.ts`, `scripts/process-images.ts`, `.gitignore` — the §1 path move (one const
  each + ignore line).
- `public/` or repo-root icon PNGs — committed generated icon assets (180/192/512/512-maskable).
- `index.html` — `<link rel="apple-touch-icon">` + any manifest link the plugin doesn't auto-inject.
- `src/main.ts` — SW registration wiring (if not auto-injected).

## Testing & verification (controller-owned)

Per this project's SDD mode, the controller runs the build/preview verification (subagents do
code + gates only).

1. **Build is lean:** after §1, `du -sh dist` ≈ 67MB; `ls dist/images-src` does not exist; `dist/`
   contains `manifest.webmanifest`, `sw.js` (or Workbox output), and the icon PNGs.
2. **SW registers + precaches:** `npm run preview`, open `localhost:4173`, DevTools → Application →
   Service Workers shows an active worker; Cache Storage holds the precached shell + images.
3. **Offline works:** with the SW active, go offline (DevTools "Offline" / kill the preview server
   after caching) and reload — the app loads, a Daily/Practice round plays, and a solved specimen
   photo renders (from cache, not network).
4. **Install presents correctly:** manifest parses (no DevTools manifest errors); icon + name show in
   the install UI; `display: standalone` is honored.
5. **Gallery excluded:** `gallery.html` is not in the precache manifest; the SW does not cache it.
6. **Gates:** `npx tsc --noEmit` clean; `npx svelte-check --threshold error` 0; `npm test` green
   (the PWA config shouldn't touch runtime logic, but confirm).

## Explicitly out of scope (deferred, not gaps)

- **nginx / HTTPS deploy** — its own follow-up spec. This spec ends at a locally-verified PWA. The
  iPad install (Add-to-Home-Screen over HTTPS, then offline at camp) depends on that deploy.
- **On-iPad offline verification** — needs real HTTPS (LAN IP isn't a secure origin); lands with the
  nginx follow-up.
- **a11y keyboard nav** (deferred-findings §B), **data-quality** (taxonomy/PBDB homonyms) — separate,
  post-release.
- **Push notifications / background sync / any dynamic PWA feature** — YAGNI; this is a static
  offline game, precache is the whole story.
