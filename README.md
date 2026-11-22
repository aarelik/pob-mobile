# PoB Mobile

A phone-first web version of [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)
for Path of Exile 1. It runs upstream PoB's own Lua, unchanged, compiled to WebAssembly in a Web Worker, so every
number is Path of Building's. The interface takes its design language from [PoB Redux](https://github.com/pobredux/pob-redux).

## How it works

```
upstream PathOfBuilding (pinned in pob.json)
        │  scripts/sync-pob.mjs      stage src/ + runtime/lua as an installed release
        ▼
pob/poe1/  ──── scripts/pack-pob.mjs ───►  web/public/pob/poe1/core-<hash>.pack   (5 MB gzip, read at boot)
upstream TreeData images ─ pack-art.mjs ─► web/public/pob/poe1/art/<hash>.webp    (tree art, fetched per tree version)
                                           web/public/pob/poe1/files/…            (old trees, timeless data: on demand)
engine/
  vendor/lua      PUC Lua 5.2 with pob-web's LuaJIT-compat patches, plus LuaJIT 2.1's 2026
                  syntax backport: ?. ?? ternary, bit operators, short functions, continue,
                  const, compound assignment, digit separators (lparser/llex/lcode/lvm)
  c/host.c        SimpleGraphic host functions (zlib, fs, time, sync HTTP) and a JSON call API
  lua/host.lua    headless SimpleGraphic globals        ┐ from PoB Redux (MIT), unchanged
  lua/bridge.lua  JSON methods over PoB's live state    ┘
  build-wasm.sh   Emscripten build → pob-engine.mjs/.wasm
web/              Svelte 5 app; src/engine/worker.ts boots the engine, client.ts calls it
```

## Correctness

`engine/test/diff.mjs` loads builds into the portable engine and into the same host linked against real
LuaJIT 2.1, and compares every scalar stat and the whole sidebar. On upstream's test builds all 600–775 stats per
build match exactly. `engine/test/syntax.lua` checks the parser extensions against real LuaJIT
(`engine/test/syntax.expected`).

```sh
make -C engine build/pobhost build/pobhost-luajit LUAJIT=/path/to/LuaJIT   # LuaJIT v2.1 built with `make`
node engine/test/diff.mjs pob/poe1 path/to/*.xml
node engine/test/wasm-smoke.mjs path/to/*.xml        # the WebAssembly engine in Node
python3 web/test/mobile.py http://localhost:4173/ code.txt   # phone-viewport end-to-end run
python3 web/test/tree.py  http://localhost:4173/ code.txt    # passive tree
python3 web/test/items.py http://localhost:4173/ code.txt web/test/ring.txt   # item editing
```

## Building

Needs Node 22, a C compiler and Emscripten (tested with 3.1.6), and a clone of upstream PathOfBuilding at the
commit in `pob.json` (path in `pob.json` → `source`, default `upstream/PathOfBuilding`).

```sh
./build.sh                     # → web/dist, a static site
cd web && npx vite preview     # serve it locally
```

### GitHub Pages

`.github/workflows/deploy.yml` builds everything on each push to `main` (it checks out upstream PoB at the pinned
commit itself) and publishes to Pages. One-time setup: Settings → Pages → Source: **GitHub Actions**. On a phone,
open the site and choose "Install app" / "Add to Home Screen"; it then works offline (`web/public/sw.js`).

To move to a newer upstream: check out the new commit, update `pob.json`, run `./build.sh`, then the differential test.

## Status

Working: passive tree drawn with Path of Exile's art the way PoB draws it (pinch/pan, tap a node for its stats and what allocating it changes, allocate and
remove, masteries, search, undo/redo, reset, cluster jewel nodes), item editing (paste from the game, uniques and
templates from PoB's database with variants, swap between the build's items, edit as text, unequip, delete,
flask toggles), boot with progress and offline cache, build list (IndexedDB), import from code / XML / pobb.in link,
new build, offline use and home-screen install, class and ascendancy, level, main skill, overview stats, skills (enable, level, quality, Full DPS,
gem tooltips), items with PoB's tooltips and stat comparisons, configuration with PoB's visibility rules and
search, the full calcs sidebar with breakdowns, notes, sharing a build code.

Next: crafting rares from a base with an affix picker, skill/gem editing (add/remove gems and groups), calcs tab sections,
item and skill sets, PoB Redux themes.

## Licences

MIT. Path of Building Community is MIT. Engine Lua host and bridge from PoB Redux (MIT). Patched Lua from pob-web
(Lua licence, MIT). Lua, zlib and luautf8 carry their own licences in `engine/vendor`.
Not affiliated with or endorsed by Grinding Gear Games.
