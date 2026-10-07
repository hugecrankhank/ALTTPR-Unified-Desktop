# ALTTPR Unified Desktop — pop-out tracker windows for PC

This is the desktop edition of [ALTTPR Unified](https://github.com/hugecrankhank/ALTTPR-Unified),
built on the [iPad edition](https://github.com/hugecrankhank/ALTTPR-Unified-iPad)
(which is built on the [randomizer edition](https://github.com/hugecrankhank/ALTTPR-Unified-Randomizer)).
Everything from those is here (seed generator, sprites, MSU-1 packs, the tablet
layouts). What it adds is a **Desktop** layout whose tracker panels can be popped
out into windows of their own, to arrange by hand or capture for a stream.

```
 main window                         pop-out windows (any size, anywhere)
┌──────────────────┬───────┐        ┌───────────┐  ┌─────────────────────┐
│                  │ items │  ⧉ →   │   items   │  │ Light W.  │ Dark W. │
│       game       ├───────┤        └───────────┘  └─────────────────────┘
│                  │  map  │        the game grows into the space they leave
└──────────────────┴───────┘
```

## Desktop layout and pop-out windows

- **Layout → Auto** picks *Desktop* on a computer with a mouse or trackpad (window
  wider than 900px) and the tablet layouts on touch screens. *Desktop* can also be
  picked directly.
- **Pop out → Items / Map** opens that panel in its own window. It keeps tracking
  live, and clicks on it (marking items, checks, prizes) work exactly as they do
  docked. The game grows into the space it leaves; with both out, the main window
  is just the game.
- **Put a panel back:** close its window, press **Dock** in its toolbar, or click its
  (green) **Pop out** button again.
- **Window toolbar:** it appears while the mouse moves over a pop-out and fades out
  after a moment, so a capture shows only the tracker.
  - *Show* (map): both worlds, Light World only, or Dark World only.
  - *Arrange* (map): side by side, stacked, or whichever fits the window best.
  - *Background:* the tracker's own, black, or green/blue/magenta for an OBS
    Chroma Key filter.
  - *Fit:* the tracker grows or shrinks with the window. Off: the tracker's own
    size and zoom buttons.
  - *Clean:* hides the tracker's own menu bars. ⚙ still opens its settings.
  - 📌 keeps the toolbar showing.
- Each window remembers its size, position and options.
- **Broadcast** and **Timer** open Hutch's own broadcast view (a stream overlay of
  items and dungeons) and timer, connected to the game the same way.
- **Game only** hides everything but the game, edge to edge, for capture. Esc (or
  *Show trackers* at the top right) brings it back.
- **Resize the tracker column** by dragging its left edge; double-click to reset.

**Capturing in OBS:** add a *Window Capture* per window (they're titled
*ALTTPR Items* and *ALTTPR Map*). Use a solid background plus a *Chroma Key* filter
to drop the background.

Things to know:

- **Allow pop-ups** for the site the first time. If the browser blocks a window, a
  note says so; allow pop-ups from the address bar and click again.
- **Keyboard input goes to the window you last clicked.** After clicking a tracker
  window, click the game before playing on the keyboard. A controller isn't
  affected.
- **Keep the game window at least partly visible.** Browsers slow a fully hidden or
  minimized window down, and the game with it. (The game isn't paused when the
  window is covered.)
- **Popping a panel out or back in restarts that tracker.** Everything read from the
  game comes back within a second; a manual mark on an item the game doesn't track
  is reset. The same happens to all trackers when a new ROM is loaded.
- **One copy of each panel.** Hutch's tracker expects one item tracker and one map;
  two copies of either would disagree after a manual click. So a panel lives either
  in the main window or in its window, never both. Splitting the items from the
  dungeons, or the two worlds into windows open at the same time, needs a sync
  layer between copies and is the next step.
- Settings, ROMs, sprites and MSU packs are stored separately from the other
  editions, so they can be used side by side.

### The tablet layouts (from the iPad edition)

- *Tablet:* items on top, Light World left, game in the middle, Dark World right,
  dungeons along the bottom (Hutch's own tablet view, `js/mobile.js` in
  [his tracker](https://github.com/hutchch/ALTTPR-Tracker)). The **−** / **+** at the
  bottom left of the item tracker resize the maps; the game takes the rest.
- *Stacked:* the game with the items and dungeons under it, and both maps at full
  size (side by side when upright, in a column on the right when sideways).
- *Classic:* the randomizer edition's layout.

## Run it

It must be served over HTTP (opening `index.html` as a file won't work, because
the browser blocks the tracker frames from talking to the page).

```bash
cd ALTTPR-Unified-Desktop
python3 -m http.server 8080      # or: npx serve .
```

Open http://localhost:8080. Then either:

- **Generate a seed in the app.** Pick settings in the **Randomizer** bar, press
  **Base ROM…** once to choose your own Japanese 1.0 ALttP ROM, then press
  **Generate & Play**. The trackers are set up to match the seed automatically.
- **Play a seed you already have.** Click **Load ROM…** and pick the `.sfc`,
  then set **World** and **Dungeon items** in the top bar to match it.

It also works as a static site (GitHub Pages, Netlify, etc.), which lets you
test from any device.

## How it works

```
index.html  (desktop.js: Desktop layout, pop-outs; tablet.js: tablet layouts)
├── EmulatorJS (snes9x core, from cdn.emulatorjs.org)
├── bridge/sni-bridge.js   ← reads emulator memory, speaks usb2snes addresses
├── <iframe> tracker/itemtracker.html, tracker/map.html   (Hutch, unmodified)
└── pop-out windows: popout.html → <iframe> the same tracker page
        └── bridge/sni-shim.js  ← swaps WebSocket for an in-page fake SNI
```

1. **Finding WRAM.** EmulatorJS doesn't export the core's RAM pointer. The
   bridge takes one save-state snapshot, finds the tagged `RAM:131072:` block
   in it (snes9x's snapshot format), then searches the WASM heap for that
   exact 128 KB block. From then on reads are direct views into live memory.
   It re-verifies every 5 s and relocates if needed; if the heap search ever
   fails it falls back to throttled snapshots (status pill turns yellow).
2. **Fake SNI.** Hutch connects to `ws://localhost:23074` and sends usb2snes
   JSON (`DeviceList`, `Attach`, `GetAddress`). The shim answers those from
   the bridge using SD2SNES address mapping:
   `F50000+` → WRAM, `E00000+` → SRAM, `000000+` → ROM file.
   Because Hutch thinks it's talking to SNI, its tracker code is untouched,
   so upstream tracker updates can be dropped straight into `tracker/`.

A pop-out window (`popout.html`) holds the same tracker page in a frame. The
shim looks for `AlttpBridge` through the frame's parent and then that window's
`opener`, the main page, so a popped-out tracker reads the game exactly like a
docked one. Hutch's windows already talk to each other over one
`BroadcastChannel` (`alttp-tracker`), which works across all windows of the site,
so the item tracker and map stay in step wherever each one is. `desktop.js`
keeps one copy of each panel and handles docking; each pop-out asks the main
page once a second which tracker to show, which is also how it reconnects after
the main page reloads for a new ROM.

The only change to the Hutch files is one `<script>` line at the top of
`itemtracker.html`, `map.html`, `timer.html` and `broadcast.html`. Opened
outside this app, the shim does nothing and the tracker uses real SNI.

## The randomizer

`randomizer/` is a JavaScript port of the official ALttPR generator
([alttp_vt_randomizer](https://github.com/sporchia/alttp_vt_randomizer), the code
behind alttpr.com, build 2024-02-18) and runs entirely in the browser, in a
Web Worker.

```
randomizer/
├── app.js            ← the settings bar: base ROM, generate, patch, boot, downloads
├── worker.js         ← runs generate() off the main thread
├── generate.js       ← settings + seed → patch + spoiler (mirrors the alttpr.com API)
├── core/             ← Item, Location, Region, World, Randomizer, Rom, Text, …
├── regions/, worlds/ ← No Glitches logic for Standard / Open / Inverted / Retro
├── data/             ← base-patch.bin, config, text strings
├── tools/            ← converters, base-patch builder, PHP reference harness
└── test/             ← parity tests against the PHP original
```

How a seed is made:

1. Your Japanese 1.0 ROM (MD5 `03a63945…`) is stored in IndexedDB the first
   time you pick it. It never leaves the browser.
2. It's expanded to 2 MB and the base patch is applied. The base patch is
   z3randomizer (commit `dcb0a2b`, the version alttpr.com pins) assembled with
   asar; the result is checked against alttpr.com's base ROM MD5 (`edc01f3d…`).
3. The generator places items, writes the seed data, and returns a patch and
   spoiler. Heart beep, menu speed and quickswap are applied, then the checksum.
4. The ROM boots in the emulator and both trackers reload with the seed's
   world state, dungeon item shuffle, sword mode and GT crystal requirement.

**Same seed number + same settings = the same game**, so a seed can be shared
by its number. Some seeds can't be completed by the generator (the original
does this too); random seeds just roll again.

Supported: every alttpr.com option for No Glitches logic (world state, goal,
crystal requirements, swords, item placement, dungeon items, accessibility,
item pool and functionality, hints). Not included: glitched logic, entrance
shuffle, enemizer/boss shuffle, multiworld, tournament/race ROMs.

### Verifying the port

The port keeps the original's structure and order of operations, and the PHP
original can be run with the same seeded random number generator. For the same
settings and seed, both produce the same ROM bytes and the same spoiler:

```bash
git clone https://github.com/sporchia/alttp_vt_randomizer ../alttp_vt_randomizer
export VT_DIR=$PWD/../alttp_vt_randomizer         # needs PHP 8.1+
cd randomizer
node test/compare.mjs '{"mode":"inverted","dungeon_items":"full"}' 1 2 3
node test/logic.mjs '{"mode":"standard"}' 200     # per-location access logic
node test/sweep.mjs one                           # every option, one at a time
node test/sweep.mjs random 100                    # random combinations
```

Regenerating code from the PHP: `python3 tools/convert_regions.py` and
`python3 tools/convert_core.py` (the rest of `core/` is hand-ported).
Rebuilding the base patch: `python3 tools/make_base_patch.py <z3randomizer> data/base-patch.bin`.

## Debugging

In the browser console:

```js
AlttpBridge.status()             // mode: 'live' | 'snapshot' | 'idle'
AlttpBridge.peek(0x7EF340, 32)   // dump inventory bytes ($7EF340+)
```

## Known limits / next steps

- **snes9x core only.** The bridge parses snes9x's state format; bsnes would
  need its own parser (or a custom core build exporting `retro_get_memory_data`).
- **No Glitches only.** The in-app generator covers alttpr.com's No Glitches
  options; for glitched logic or entrance shuffle, generate elsewhere and use
  **Load ROM…**.
- **Changing ROMs reloads the page.** EmulatorJS can't swap games in place.
- Save files persist in the browser's IndexedDB (EmulatorJS default).

## Credits

- Tracker: [Hutch-ALTTPR Tracker](https://github.com/hutchch/ALTTPR-Tracker)
  by hutchch, MIT License (see `tracker/LICENSE`).
- Emulator: [EmulatorJS](https://github.com/EmulatorJS/EmulatorJS) (GPL-3.0),
  loaded from its CDN at runtime.
- Randomizer: ported from [alttp_vt_randomizer](https://github.com/sporchia/alttp_vt_randomizer)
  by sporchia (MIT); base patch built from [z3randomizer](https://github.com/KatDevsGames/z3randomizer)
  (MIT). See `randomizer/LICENSE-THIRD-PARTY.md`.
- No ROMs are included. Use your own legally obtained copy.
