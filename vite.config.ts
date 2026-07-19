import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "node:path";

// Multi-page: the app (index.html) + a dev-only component gallery (gallery.html).
// The gallery is a static "testing views" surface; it ships unlinked and is NOT part of the PWA.
export default defineConfig({
  plugins: [
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      // Precache the whole app so it runs fully offline (any of ~776 genera can be the answer).
      workbox: {
        globPatterns: ["**/*.{js,css,html,woff,woff2,webp}"],
        globIgnores: ["**/gallery*", "gallery.html"], // dev-only surface — never cache
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/gallery/],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024, // GameBoard chunk is ~1MB; headroom
      },
      // apple-touch-icon + favicons: these types aren't in globPatterns, so precache them explicitly for offline.
      includeAssets: ["icons/pwa-180.png", "icons/favicon.svg", "icons/favicon-32.png", "icons/favicon-16.png"],
      manifest: {
        name: "Mesozooa",
        short_name: "Mesozooa",
        description: "A dinosaurs-only cladistics guessing game.",
        display: "standalone",
        start_url: "/",
        background_color: "#f8f4ea",
        theme_color: "#9a4a33", // --placard: matches the header so the browser frame melts into it (issue #8)
        icons: [
          { src: "/icons/pwa-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/pwa-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/pwa-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        gallery: resolve(__dirname, "gallery.html"),
      },
    },
  },
});
