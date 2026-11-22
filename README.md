# PoB Mobile

A phone-first web version of [Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)
for Path of Exile 1. It runs upstream PoB's own Lua, unchanged, compiled to WebAssembly in a Web Worker, so every
number is Path of Building's. The interface takes its design language from [PoB Redux](https://github.com/pobredux/pob-redux).

## How it works

```
upstream PathOfBuilding (pinned in pob.json)
        │  scripts/sync-pob.mjs      stage src/ + runtime/lua as an installed release
        ▼
pob/poe1/  ──── scripts/pack-pob.mjs ───►  web/public/pob/poe1/core-<hash>.pack   (7 MB gzip, read at boot;
                                                                                  Lua precompiled to bytecode)
upstream TreeData images ─ pack-art.mjs ─► web/public/pob/poe1/art/<hash>.webp    (tree art, fetched per tree version)
                                           web/public/pob/poe1/files/…            (old trees, timeless data: on demand)
engine/
  vendor/lua      PUC Lua 5.2 with pob-web's LuaJIT-compat patches, plus LuaJIT 2.1's 2026
                  syntax backport: ?. ?? ternary, bit operators, short functions, continue,
                  const, compound assignment, digit separators (lparser/llex/lcode/lvm)
  c/host.c        SimpleGraphic host functions (zlib, fs, time, sync HTTP) and a JSON call API
  lua/host.lua    headless SimpleGraphic globals        ┐ from PoB Redux (MIT), unchanged
  lua/bridge.lua  JSON methods over PoB's live state    ┘
  lua/mobile.lua  pob-mobile's additions: tree geometry and art, build-wide undo, set fixes
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
python3 web/test/skills.py  …  craft.py  …  misc.py  …  analysis.py …   # gems, crafting, undo/sets/backup, calcs/compare/power
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

`.github/workflows/upstream.yml` checks daily for a new Path of Building release; when there is one it pins it in
`pob.json` and redeploys. The deploy smoke-tests the new engine first, so a release that breaks it leaves the site
on the previous version. To move by hand: update the commit in `pob.json` and push.

### Relay (optional)

Browsers can't read pathofexile.com or most build-sharing sites from another site (CORS). Pasting a build code
always works; account import and poe.ninja / Maxroll / Mobalytics links need the small Cloudflare Worker in
`relay/` (free, about five minutes to set up, see `relay/README.md`). Its URL goes in the app under Builds → Settings.

## Features

- **Passive tree** drawn with Path of Exile's art as PoB draws it: pinch, pan, tap for stats and what allocating
  changes, masteries, cluster jewels, jewel radius rings, socketing jewels, timeless jewels, search, several trees per
  build, node power heat map with the best passives to take.
- **Skills**: socket groups and gems: add, remove, replace, reorder, level and quality, gem search ranked by DPS,
  skill parts, stages, minions, skill sets.
- **Items**: equip from the build, PoB's uniques and templates, or text copied from the game; craft normal, magic and
  rare items from any base with PoB's affix tiers and rolls; quality, item level, influence, sockets, variants,
  catalysts, enchants, anoints, corruption, crafted and custom mods; item sets.
- **Config** with PoB's visibility rules, config sets, custom modifiers checked by PoB's parser.
- **Calcs**: the sidebar with breakdowns, the full calculation grid, build comparison, Party tab.
- Undo and redo for every change, search across the build, PoB Redux's themes.
- Builds stay on the phone (IndexedDB): import codes, XML, links and characters from your account; share codes,
  links and .xml for desktop PoB; back up and restore all builds. Works offline and installs to the home screen.

## Licences

MIT. Path of Building Community is MIT. Engine Lua host and bridge from PoB Redux (MIT). Patched Lua from pob-web
(Lua licence, MIT). Lua, zlib and luautf8 carry their own licences in `engine/vendor`.
Not affiliated with or endorsed by Grinding Gear Games.
