#!/bin/sh
# Full build: stage upstream PoB, build the engine (native + wasm), pack the data, build the site.
#   ./build.sh            uses the checkout and commit pinned in pob.json
set -e
cd "$(dirname "$0")"
node scripts/sync-pob.mjs --game poe1
make -C engine
./engine/build-wasm.sh
node scripts/pack-pob.mjs poe1
npm ci && node scripts/pack-art.mjs poe1
(cd web && npm ci && npx vite build)
echo "site in web/dist"
