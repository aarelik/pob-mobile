#!/bin/sh
# Browser build of the engine host: build/wasm/pob-engine.mjs + .wasm
set -e
cd "$(dirname "$0")"
mkdir -p build/wasm
LUA_SRC=$(ls vendor/lua/*.c | grep -v -e 'lua\.c$' -e 'luac\.c$' -e 'ltests\.c$')
ZLIB_SRC=$(for f in adler32 compress crc32 deflate infback inffast inflate inftrees trees uncompr zutil; do echo vendor/zlib/$f.c; done)
emcc -O3 -DLUA_COMPAT_ALL -DLUA_USE_POSIX -Ivendor/lua -Ivendor/zlib \
  c/host.c vendor/luautf8/lutf8lib.c $LUA_SRC $ZLIB_SRC \
  -o build/wasm/pob-engine.mjs \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createPobEngine \
  -sENVIRONMENT=worker,node -sFORCE_FILESYSTEM=1 \
  -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=268435456 -sMAXIMUM_MEMORY=2147483648 \
  -sTOTAL_STACK=16777216 \
  -sEXPORTED_FUNCTIONS=_pob_init,_pob_call,_pob_eval,_pob_uptime,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=ccall,cwrap,FS,UTF8ToString,stringToUTF8,lengthBytesUTF8 \
  -sINVOKE_RUN=0 -sEXIT_RUNTIME=0
ls -la build/wasm
