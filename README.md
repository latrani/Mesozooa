# Mesozooa

A paleo-themed [Metazooa](https://metazooa.com/)-style cladistics guessing game, and an
explorable cladogram tool. Try to find a mystery Mesozoic dinosaur; every time you make a
guess, the tree tells you the most recent common ancestor of the two. Use cladistic hints
and field clues to add the unknown dino to the display!

**Play it: [mesozooa.latrani.net](https://mesozooa.latrani.net/)**

Currently this is a static single-page app with no backend. The tree of life is harvested from
[Wikidata](https://www.wikidata.org/) at build time, paleo clues come from the
[Paleobiology Database](https://paleobiodb.org/), and everything is baked into committed JSON,
so the running app makes no network calls, and it can install as an offline PWA to take with
you on a dino dig.

## How to play

Three tabs:

- **Daily**: One deterministic mystery genus per day, a shared 20-guess budget, and hints.
  Everyone gets the same dinosaur.
- **Practice**: Unlimited turns with random genus selection.
- **Explore**: The full dinosaur cladogram as a reference. You can search for a genus, climb up
  and down the branches, and see which genera the game will accept as guesses.

Each guess lands on the tree at the [most recent common ancestor](https://en.wikipedia.org/wiki/Most_recent_common_ancestor)
it shares with the target. A guess that shares a small, deep clade with the answer is warm; one
that only meets it way up near the root is cold. Narrow the shared clade until you land on the
genus itself.

## Tech stack

- **Svelte 5** (runes) + **TypeScript**, built with **Vite**
- No backend, no runtime network calls; all game data is committed JSON
- Installable, fully-offline **PWA** (Workbox service worker, precached assets)
- Pure game logic (tree assembly, MRCA, the reducer + selectors) is TDD-tested with **Vitest**

## Development

Requires Node 18+ and npm.

```sh
npm install      # install dependencies
npm run dev      # start the Vite dev server
npm run build    # production build into dist/
npm run preview  # serve the production build locally
npm run test     # run the Vitest suite
```

The game reads pre-built data from `src/data/`, which is committed, so you can develop the app
without ever regenerating it.

### Regenerating the data (optional)

The committed data is produced by a harvest pipeline (`npm run fetch`) that pulls from Wikidata
and PBDB and downloads/downscales Wikimedia Commons images. The image steps shell out to macOS
tools (`sips`, `cwebp`) and every step is network-bound, so regenerating from scratch is a
macOS-only, online operation. You almost never need to run it. See `src/data/README.md` for the
per-stage breakdown.

## Data and attribution

Mesozooa is built entirely on open data. Every image credits its author and license in-app.

- **Taxonomy and images** come from **[Wikidata](https://www.wikidata.org/)**, whose structured
  data is released under [CC0](https://creativecommons.org/publicdomain/zero/1.0/).
- **Paleontological clues** (ages, discovery locations) come from the
  **[Paleobiology Database](https://paleobiodb.org/)**, whose data is licensed
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- **Genus photographs** come from **[Wikimedia Commons](https://commons.wikimedia.org/)**. Each
  image keeps its own license and its author is credited both in the app and in
  `data/image-credits.json`. Licenses vary per image (public domain and various Creative Commons
  licenses); no non-free images are used.

## Project docs

This project was built spec-first. The design specs and implementation plans live under
`docs/superpowers/`, and `CLAUDE.md` captures the architecture and the working agreements. If
you want to understand how a piece works or why a decision was made, start there.

## License

The Mesozooa source code is released under the [MIT License](./LICENSE). The data and images it
uses carry their own licenses, described above under **Data and attribution**.
