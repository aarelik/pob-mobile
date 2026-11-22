# Native build of the engine host (tests, golden checks). See build-wasm.sh for the browser build.
LUA_SRC := $(filter-out vendor/lua/lua.c vendor/lua/luac.c vendor/lua/ltests.c,$(wildcard vendor/lua/*.c))
ZLIB_SRC := $(addprefix vendor/zlib/,adler32.c compress.c crc32.c deflate.c infback.c inffast.c inflate.c inftrees.c trees.c uncompr.c zutil.c)
SRC := c/host.c vendor/luautf8/lutf8lib.c $(LUA_SRC) $(ZLIB_SRC)
CFLAGS ?= -O2 -g
CFLAGS += -DLUA_COMPAT_ALL -DLUA_USE_POSIX -Ivendor/lua -Ivendor/zlib -Wno-deprecated-non-prototype

build/pobhost: $(SRC) c/*.c
	@mkdir -p build
	$(CC) $(CFLAGS) -o $@ $(SRC) -lm

clean:
	rm -rf build

# Same host on real LuaJIT 2.1, for differential tests (LUAJIT=path to a LuaJIT checkout with src/libluajit.a).
LUAJIT ?= ../../ref/luajit
build/pobhost-luajit: c/host.c vendor/luautf8/lutf8lib.c $(ZLIB_SRC)
	@mkdir -p build
	$(CC) -O2 -g -DPOB_LUAJIT -I$(LUAJIT)/src -Ivendor/zlib -Wno-deprecated-non-prototype -o $@ c/host.c vendor/luautf8/lutf8lib.c $(ZLIB_SRC) $(LUAJIT)/src/libluajit.a -lm -ldl
