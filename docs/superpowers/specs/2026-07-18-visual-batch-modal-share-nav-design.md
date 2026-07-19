# Visual batch: shared Modal, How-to-play, Share, in-progress nav

*Closes three "adds-new-visuals" issues so the CSS can be tinkered independently:
[#4](https://github.com/latrani/Mesozooa/issues/4) How-to-play,
[#7](https://github.com/latrani/Mesozooa/issues/7) Emoji sharing,
[#3](https://github.com/latrani/Mesozooa/issues/3) in-progress nav. #4 and #7 share one new
Modal component.*

## Scope & principle

Function-first (per working agreements): structurally-correct, visually-minimal UI. The
detailed visual pass is the user's, later. Everything here is wired to work and legible, not
polished.

Four deliverables:

1. **`Modal.svelte`** — new shared component, consumed by #4 and #7.
2. **How to play (#4)** — a header link that opens the Modal with rules copy.
3. **Share (#7)** — recolor the warmth buckets, add a Share button on daily completion that
   opens the Modal with a grid preview + Copy.
4. **In-progress nav (#3)** — a pure `hasProgress` helper + tab-label text.

## 1. `Modal.svelte` (shared)

New file `src/lib/components/Modal.svelte` (first tenant of a shared `src/lib/components/`
dir; existing game/explorer components stay put).

- Wraps the native HTML `<dialog>` element. Native `showModal()` provides the focus-trap,
  top-layer stacking, `::backdrop`, and Esc-to-close for free — no custom a11y wiring.
- Props:
  - `open: boolean` (bindable) — the single source of truth for visibility.
  - `title: string` — rendered in the header row.
  - `children` — default snippet for the body content.
- Behavior:
  - An `$effect` syncs `open` → the `<dialog>`: `showModal()` when true, `close()` when false
    (guarded so it doesn't re-call if already in that state).
  - The dialog's native `close` event (Esc, form-method=dialog) writes `open = false` back, so
    the binding stays consistent however it was dismissed.
  - Header: `title` + a `✕` close button (`onclick` → `open = false`).
  - Backdrop click closes: listen for a click whose target is the `<dialog>` itself (clicks on
    inner content don't bubble as the dialog element).
- Structure only: minimal styling using existing tokens (`--placard`/`--cream` surface,
  `--space-*`, a border-radius) so it reads as a panel. The real visual treatment is deferred
  to the user's CSS pass.

One clear job: *show dismissible content over the page.* Both #4 and #7 depend on it through
the `open` / `title` / body interface and nothing else.

## 2. How to play (#4)

- A `How to play` `<button>` (link-styled) placed **after the tagline** in the `App.svelte`
  header. Hidden alongside the tagline at the `≤640px` breakpoint is **not** wanted — keep the
  How-to-play affordance visible on narrow screens (it's more useful there); only the tagline
  drops. (If it crowds, revisit in the visual pass.)
- Clicking sets a local `howToOpen` state; renders `<Modal bind:open={howToOpen}
  title="How to play">` with the rules copy.
- Rules copy (from issue #4, verbatim except three typo fixes — "moved"→"moves",
  "spend move"→"spend moves", "a single-move will tell"→"a single move will tell"):

  > Find today's dinosaur by its similarity to others.
  >
  > Guess any dinosaur, and you'll see the clade that it shares with the one you're hunting
  > for. Try to find the target in the fewest moves!
  >
  > You can spend moves on hints to move down the tree. When you're almost at the end of the
  > tree, a single move will tell you more details about the dino, to help you sort through the
  > genera.
  >
  > If you're stuck, or just want to learn more, check out Explore mode to see the whole tree.
  > Not every dinosaur in Explore mode is playable, but every playable dinosaur is in Explore.

- To keep `App.svelte` lean, wrap the button + modal in a small `HowToPlay.svelte` in
  `src/lib/components/`; `App.svelte` just renders `<HowToPlay />` after the tagline.

## 3. Share (#7)

### 3a. Recolor (`src/lib/game/share.ts`)

The warmth ramp changes from `🟦🟩🟨🟧🟥` to **black → blue → white → orange → red**, which
carries the heat concept better (cold black, through neutral white, to hot red). New
`bucket()`:

| `warmth.fraction` | emoji |
|---|---|
| `< 0.2` | ⬛ |
| `< 0.4` | 🟦 |
| `< 0.6` | ⬜ |
| `< 0.8` | 🟧 |
| `≥ 0.8` | 🟥 |

`🎯` (winning guess), `💡` (hint expansion), and `🔦` (hint tally) are unchanged — the recolor
is only the five warmth buckets. Update the `bucket` mapping and the affected assertion in
`share.test.ts`.

### 3b. Share UI

- **Expose the daily date**: add a `get date()` getter to the daily store
  (`dailyStore.svelte.ts`) returning its closure `date` string, so the UI can call
  `buildShareText(state, daily.date)`. `buildShareText` itself is already written and tested —
  this is pure wiring.
- **Button placement**: `GameBoard.svelte` gains an optional `onshare?: () => void` prop,
  mirroring the existing `onnew` pattern. In the placard `action` snippet, when `ended`, render
  a **Share** button if `onshare` is present (next to a New-round button if `onnew` is present).
  Daily passes `onshare`, not `onnew`; Practice keeps `onnew`, no `onshare`. So Daily shows
  Share on completion, Practice shows New round — matching current behavior plus Share.
- **The modal lives in `Daily.svelte`** (keeps `GameBoard` modal-agnostic). Daily owns
  `shareOpen` state, passes `onshare={() => shareOpen = true}`, and renders
  `<Modal bind:open={shareOpen} title="Share your result">` containing:
  - The `buildShareText(daily.state, daily.date)` output shown as a preview (in a
    `white-space: pre` block so the grid rows line up).
  - A **Copy** button → `navigator.clipboard.writeText(text)` → a transient "Copied"
    acknowledgement (local boolean reset on a short timer).

Known limitation, not blocking: ⬜ white buckets may wash out against a light modal background
in the *in-app preview*. In pasted/shared text they render as emoji tiles and are fine. The
preview background is the user's CSS-pass call.

## 4. In-progress nav (#3)

- **Pure helper** (testable) in `engine-core.ts`:
  `hasProgress(state: GameState): boolean` → `state.guesses.length > 0 && state.status ===
  "playing"`. A started-but-unfinished game.
- **Tab labels** in `App.svelte`: when `hasProgress(daily.state)`, the Daily tab reads
  `Daily — in progress`; likewise Practice with `game.state`. Explore has no game state, no
  suffix. (Em-dash to match the existing result-line style; issue wrote " - in progress"
  loosely.)
- Reads the module-singleton stores (`daily`, `game`) reactively — Svelte runes make the label
  update as guesses land.

## Testing

- **Pure logic (TDD):** `hasProgress` (empty → false, mid-play → true, won/lost → false);
  `bucket` recolor assertions in `share.test.ts` (including the existing grid test's expected
  emoji).
- **Components (build + running):** Modal open/close/Esc/backdrop; How-to-play opens with copy;
  Share opens with preview + Copy writes to clipboard; tab labels flip on progress. Validated
  via `npx tsc --noEmit`, `npx svelte-check`, and the gallery / running app.
- **Gallery:** add Modal (open state), How-to-play, and Share-modal states to `gallery.html`
  for the user's visual pass.

## Out of scope

- Any final visual styling of the modal, share preview, or how-to-play panel — the user's
  dedicated CSS pass. This spec delivers structure + wiring only.
- Sharing anything other than the daily result (no practice share, no image export).
