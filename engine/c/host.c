/*
 * pob-mobile engine host.
 *
 * Boots Path of Building's unchanged Lua code on a portable Lua (PUC Lua 5.2
 * with LuaJIT compatibility patches, from pob-web) and exposes one entry point
 * that calls a bridge method with JSON params and returns JSON.
 *
 * The same file builds natively (for tests and the golden checker) and with
 * Emscripten (for the browser worker).
 *
 * The `__native` table mirrors pob-redux's Rust host (crates/pob-engine/src/native.rs).
 */
#include <dirent.h>
#include <errno.h>
#include <fnmatch.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <time.h>
#include <unistd.h>

#include "lauxlib.h"
#include "lua.h"
#include "lualib.h"
#include "zlib.h"

#ifdef __EMSCRIPTEN__
#include <emscripten.h>
#define EXPORT EMSCRIPTEN_KEEPALIVE
#else
#define EXPORT
#endif

extern int luaopen_utf8(lua_State *L);

#ifdef POB_LUAJIT
/* Built against LuaJIT for differential tests (Lua 5.1 API). */
#define LUA_OK 0
#define lua_rawlen lua_objlen
static int lua_absindex(lua_State *L, int i) { return (i > 0 || i <= LUA_REGISTRYINDEX) ? i : lua_gettop(L) + i + 1; }
#define luaL_newlib(L, l) (lua_newtable(L), luaL_register(L, NULL, l))
#endif

static lua_State *L = NULL;
static double t0_ms = 0;
static int methods_ref = LUA_NOREF;
static const char *ARRAY_MT = "pob.array";

/* ------------------------------------------------------------------------ */
/* Growable byte buffer                                                      */
/* ------------------------------------------------------------------------ */
typedef struct {
	char *p;
	size_t n, cap;
} buf_t;

static void buf_grow(buf_t *b, size_t extra) {
	if (b->n + extra + 1 <= b->cap) return;
	size_t cap = b->cap ? b->cap : 4096;
	while (cap < b->n + extra + 1) cap *= 2;
	b->p = realloc(b->p, cap);
	b->cap = cap;
}
static void buf_put(buf_t *b, const char *s, size_t n) {
	buf_grow(b, n);
	memcpy(b->p + b->n, s, n);
	b->n += n;
	b->p[b->n] = 0;
}
static void buf_puts(buf_t *b, const char *s) { buf_put(b, s, strlen(s)); }
static void buf_putc(buf_t *b, char c) { buf_put(b, &c, 1); }

/* ------------------------------------------------------------------------ */
/* Time                                                                      */
/* ------------------------------------------------------------------------ */
static double now_ms(void) {
#ifdef __EMSCRIPTEN__
	return emscripten_get_now();
#else
	struct timespec ts;
	clock_gettime(CLOCK_MONOTONIC, &ts);
	return ts.tv_sec * 1000.0 + ts.tv_nsec / 1e6;
#endif
}

/* ------------------------------------------------------------------------ */
/* JSON encode (Lua value -> text). Mirrors mlua's serde rules as pob-redux   */
/* configures them: tables with the array metatable or a 1..n sequence are    */
/* arrays, other tables are objects (empty ones {}), functions are skipped.   */
/* ------------------------------------------------------------------------ */
static void json_str(buf_t *b, const char *s, size_t n) {
	static const char hex[] = "0123456789abcdef";
	buf_grow(b, n + 2);
	buf_putc(b, '"');
	for (size_t i = 0; i < n; i++) {
		unsigned char c = (unsigned char)s[i];
		switch (c) {
		case '"': buf_put(b, "\\\"", 2); break;
		case '\\': buf_put(b, "\\\\", 2); break;
		case '\n': buf_put(b, "\\n", 2); break;
		case '\r': buf_put(b, "\\r", 2); break;
		case '\t': buf_put(b, "\\t", 2); break;
		default:
			if (c < 0x20 || c == 0x7f) {
				char e[6] = {'\\', 'u', '0', '0', hex[c >> 4], hex[c & 15]};
				buf_put(b, e, 6);
			} else {
				buf_putc(b, (char)c);
			}
		}
	}
	buf_putc(b, '"');
}

static void json_num(buf_t *b, lua_Number v) {
	char tmp[64];
	if (v != v || v > 1.7976931348623157e308 || v < -1.7976931348623157e308) {
		buf_puts(b, "null");
		return;
	}
	if (v == (lua_Number)(long long)v && v < 9e15 && v > -9e15) {
		snprintf(tmp, sizeof tmp, "%lld", (long long)v);
	} else {
		snprintf(tmp, sizeof tmp, "%.17g", v);
	}
	buf_puts(b, tmp);
}

static int is_array_mt(lua_State *L, int idx) {
	if (!lua_getmetatable(L, idx)) return 0;
	luaL_getmetatable(L, ARRAY_MT);
	int eq = lua_rawequal(L, -1, -2);
	lua_pop(L, 2);
	return eq;
}

/* 0 = object, >0 = sequence length */
static size_t seq_len(lua_State *L, int idx) {
	size_t n = lua_rawlen(L, idx), count = 0;
	if (n == 0) return 0;
	lua_pushnil(L);
	while (lua_next(L, idx)) {
		lua_pop(L, 1);
		if (lua_type(L, -1) != LUA_TNUMBER) {
			lua_pop(L, 1);
			return 0;
		}
		count++;
	}
	return count == n ? n : 0;
}

static int encodable(lua_State *L, int idx) {
	int t = lua_type(L, idx);
	return t == LUA_TNIL || t == LUA_TBOOLEAN || t == LUA_TNUMBER || t == LUA_TSTRING || t == LUA_TTABLE ||
	       (t == LUA_TLIGHTUSERDATA && lua_touserdata(L, idx) == NULL);
}

static void json_encode(lua_State *L, int idx, buf_t *b, int depth) {
	idx = lua_absindex(L, idx);
	switch (lua_type(L, idx)) {
	case LUA_TBOOLEAN: buf_puts(b, lua_toboolean(L, idx) ? "true" : "false"); return;
	case LUA_TNUMBER: json_num(b, lua_tonumber(L, idx)); return;
	case LUA_TSTRING: {
		size_t n;
		const char *s = lua_tolstring(L, idx, &n);
		json_str(b, s, n);
		return;
	}
	case LUA_TTABLE: break;
	default: buf_puts(b, "null"); return;
	}
	if (depth > 96) {
		buf_puts(b, "null");
		return;
	}
	luaL_checkstack(L, 8, "json");
	size_t n = is_array_mt(L, idx) ? lua_rawlen(L, idx) : seq_len(L, idx);
	if (n > 0 || is_array_mt(L, idx)) {
		buf_putc(b, '[');
		for (size_t i = 1; i <= n; i++) {
			if (i > 1) buf_putc(b, ',');
			lua_rawgeti(L, idx, (int)i);
			json_encode(L, -1, b, depth + 1);
			lua_pop(L, 1);
		}
		buf_putc(b, ']');
		return;
	}
	buf_putc(b, '{');
	int first = 1;
	lua_pushnil(L);
	while (lua_next(L, idx)) {
		if (!encodable(L, -1) || lua_type(L, -1) == LUA_TNIL) {
			lua_pop(L, 1);
			continue;
		}
		if (!first) buf_putc(b, ',');
		first = 0;
		if (lua_type(L, -2) == LUA_TSTRING) {
			size_t kn;
			const char *k = lua_tolstring(L, -2, &kn);
			json_str(b, k, kn);
		} else if (lua_type(L, -2) == LUA_TNUMBER) {
			buf_t kb = {0};
			json_num(&kb, lua_tonumber(L, -2));
			json_str(b, kb.p, kb.n);
			free(kb.p);
		} else {
			json_str(b, "?", 1);
		}
		buf_putc(b, ':');
		json_encode(L, -1, b, depth + 1);
		lua_pop(L, 1);
	}
	buf_putc(b, '}');
}

/* ------------------------------------------------------------------------ */
/* JSON decode (text -> Lua value). null becomes nil, arrays get ARRAY_MT.    */
/* ------------------------------------------------------------------------ */
typedef struct {
	const char *s, *e;
	const char *err;
} jp_t;

static void jp_ws(jp_t *p) {
	while (p->s < p->e && (*p->s == ' ' || *p->s == '\t' || *p->s == '\n' || *p->s == '\r')) p->s++;
}

static void utf8_put(buf_t *b, unsigned cp) {
	char o[4];
	if (cp < 0x80) { o[0] = (char)cp; buf_put(b, o, 1); }
	else if (cp < 0x800) { o[0] = (char)(0xC0 | (cp >> 6)); o[1] = (char)(0x80 | (cp & 0x3F)); buf_put(b, o, 2); }
	else if (cp < 0x10000) { o[0] = (char)(0xE0 | (cp >> 12)); o[1] = (char)(0x80 | ((cp >> 6) & 0x3F)); o[2] = (char)(0x80 | (cp & 0x3F)); buf_put(b, o, 3); }
	else { o[0] = (char)(0xF0 | (cp >> 18)); o[1] = (char)(0x80 | ((cp >> 12) & 0x3F)); o[2] = (char)(0x80 | ((cp >> 6) & 0x3F)); o[3] = (char)(0x80 | (cp & 0x3F)); buf_put(b, o, 4); }
}

static unsigned hex4(const char *s) {
	unsigned v = 0;
	for (int i = 0; i < 4; i++) {
		char c = s[i];
		v <<= 4;
		if (c >= '0' && c <= '9') v |= c - '0';
		else if (c >= 'a' && c <= 'f') v |= c - 'a' + 10;
		else if (c >= 'A' && c <= 'F') v |= c - 'A' + 10;
	}
	return v;
}

static int jp_string(jp_t *p, buf_t *b) {
	p->s++; /* opening quote */
	b->n = 0;
	buf_grow(b, 16);
	b->p[0] = 0;
	while (p->s < p->e && *p->s != '"') {
		if (*p->s == '\\' && p->s + 1 < p->e) {
			char c = p->s[1];
			p->s += 2;
			switch (c) {
			case 'n': buf_putc(b, '\n'); break;
			case 't': buf_putc(b, '\t'); break;
			case 'r': buf_putc(b, '\r'); break;
			case 'b': buf_putc(b, '\b'); break;
			case 'f': buf_putc(b, '\f'); break;
			case 'u': {
				if (p->e - p->s < 4) { p->err = "bad \\u escape"; return 0; }
				unsigned cp = hex4(p->s);
				p->s += 4;
				if (cp >= 0xD800 && cp < 0xDC00 && p->e - p->s >= 6 && p->s[0] == '\\' && p->s[1] == 'u') {
					unsigned lo = hex4(p->s + 2);
					if (lo >= 0xDC00 && lo < 0xE000) {
						cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
						p->s += 6;
					}
				}
				utf8_put(b, cp);
				break;
			}
			default: buf_putc(b, c);
			}
		} else {
			buf_putc(b, *p->s++);
		}
	}
	if (p->s >= p->e) { p->err = "unterminated string"; return 0; }
	p->s++;
	return 1;
}

static int jp_value(lua_State *L, jp_t *p, buf_t *tmp, int depth) {
	jp_ws(p);
	if (p->s >= p->e) { p->err = "unexpected end"; return 0; }
	if (depth > 200) { p->err = "too deep"; return 0; }
	luaL_checkstack(L, 6, "json");
	char c = *p->s;
	if (c == '{') {
		p->s++;
		lua_newtable(L);
		jp_ws(p);
		if (p->s < p->e && *p->s == '}') { p->s++; return 1; }
		for (;;) {
			jp_ws(p);
			if (p->s >= p->e || *p->s != '"') { p->err = "expected key"; return 0; }
			if (!jp_string(p, tmp)) return 0;
			lua_pushlstring(L, tmp->p, tmp->n);
			jp_ws(p);
			if (p->s >= p->e || *p->s != ':') { p->err = "expected ':'"; return 0; }
			p->s++;
			if (!jp_value(L, p, tmp, depth + 1)) return 0;
			lua_rawset(L, -3);
			jp_ws(p);
			if (p->s < p->e && *p->s == ',') { p->s++; continue; }
			if (p->s < p->e && *p->s == '}') { p->s++; return 1; }
			p->err = "expected ',' or '}'";
			return 0;
		}
	}
	if (c == '[') {
		p->s++;
		lua_newtable(L);
		luaL_setmetatable(L, ARRAY_MT);
		int i = 1;
		jp_ws(p);
		if (p->s < p->e && *p->s == ']') { p->s++; return 1; }
		for (;;) {
			if (!jp_value(L, p, tmp, depth + 1)) return 0;
			lua_rawseti(L, -2, i++);
			jp_ws(p);
			if (p->s < p->e && *p->s == ',') { p->s++; continue; }
			if (p->s < p->e && *p->s == ']') { p->s++; return 1; }
			p->err = "expected ',' or ']'";
			return 0;
		}
	}
	if (c == '"') {
		if (!jp_string(p, tmp)) return 0;
		lua_pushlstring(L, tmp->p, tmp->n);
		return 1;
	}
	if (!strncmp(p->s, "true", 4)) { p->s += 4; lua_pushboolean(L, 1); return 1; }
	if (!strncmp(p->s, "false", 5)) { p->s += 5; lua_pushboolean(L, 0); return 1; }
	if (!strncmp(p->s, "null", 4)) { p->s += 4; lua_pushnil(L); return 1; }
	char *end;
	double v = strtod(p->s, &end);
	if (end == p->s) { p->err = "bad value"; return 0; }
	p->s = end;
	lua_pushnumber(L, v);
	return 1;
}

/* ------------------------------------------------------------------------ */
/* Filesystem helpers                                                        */
/* ------------------------------------------------------------------------ */
static int mkdir_p(const char *path) {
	char tmp[4096];
	size_t n = strlen(path);
	if (n == 0 || n >= sizeof tmp) return -1;
	memcpy(tmp, path, n + 1);
	for (char *q = tmp + 1; *q; q++) {
		if (*q == '/' || *q == '\\') {
			char save = *q;
			*q = 0;
			mkdir(tmp, 0755);
			*q = save;
		}
	}
	if (mkdir(tmp, 0755) != 0 && errno != EEXIST) return -1;
	return 0;
}

static int rm_rf(const char *path) {
	struct stat st;
	if (lstat(path, &st) != 0) return -1;
	if (S_ISDIR(st.st_mode)) {
		DIR *d = opendir(path);
		if (d) {
			struct dirent *e;
			while ((e = readdir(d))) {
				if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
				char sub[4096];
				snprintf(sub, sizeof sub, "%s/%s", path, e->d_name);
				rm_rf(sub);
			}
			closedir(d);
		}
		return rmdir(path);
	}
	return unlink(path);
}

/* ------------------------------------------------------------------------ */
/* __native functions                                                        */
/* ------------------------------------------------------------------------ */
static int n_array(lua_State *L) {
	luaL_checktype(L, 1, LUA_TTABLE);
	lua_settop(L, 1);
	luaL_setmetatable(L, ARRAY_MT);
	return 1;
}

static int n_time(lua_State *L) {
	lua_pushnumber(L, (lua_Number)(long long)(now_ms() - t0_ms));
	return 1;
}

static int n_log(lua_State *L) {
	const char *level = luaL_checkstring(L, 1);
	const char *msg = luaL_optstring(L, 2, "");
	if (getenv("POB_QUIET") && strcmp(level, "error") && strcmp(level, "warn")) return 0;
	fprintf(stderr, "[pob %s] %s\n", level, msg);
	return 0;
}

static int n_deflate(lua_State *L) {
	size_t n;
	const char *data = luaL_checklstring(L, 1, &n);
	int gzip = lua_toboolean(L, 2);
	z_stream zs;
	memset(&zs, 0, sizeof zs);
	if (deflateInit2(&zs, Z_BEST_COMPRESSION, Z_DEFLATED, gzip ? 31 : 15, 8, Z_DEFAULT_STRATEGY) != Z_OK) {
		lua_pushnil(L);
		return 1;
	}
	uLong cap = deflateBound(&zs, (uLong)n) + 32;
	unsigned char *out = malloc(cap);
	zs.next_in = (Bytef *)data;
	zs.avail_in = (uInt)n;
	zs.next_out = out;
	zs.avail_out = (uInt)cap;
	int r = deflate(&zs, Z_FINISH);
	if (r != Z_STREAM_END) {
		deflateEnd(&zs);
		free(out);
		lua_pushnil(L);
		return 1;
	}
	lua_pushlstring(L, (const char *)out, zs.total_out);
	deflateEnd(&zs);
	free(out);
	return 1;
}

/* windowBits: 47 = auto zlib/gzip, -15 = raw deflate */
static int inflate_with(const char *data, size_t n, int wbits, buf_t *out) {
	z_stream zs;
	memset(&zs, 0, sizeof zs);
	if (inflateInit2(&zs, wbits) != Z_OK) return 0;
	zs.next_in = (Bytef *)data;
	zs.avail_in = (uInt)n;
	unsigned char chunk[65536];
	int r;
	out->n = 0;
	do {
		zs.next_out = chunk;
		zs.avail_out = sizeof chunk;
		r = inflate(&zs, Z_NO_FLUSH);
		if (r != Z_OK && r != Z_STREAM_END) {
			inflateEnd(&zs);
			return 0;
		}
		buf_put(out, (const char *)chunk, sizeof chunk - zs.avail_out);
		/* concatenated gzip members */
		if (r == Z_STREAM_END && zs.avail_in > 0 && wbits == 47) {
			inflateReset(&zs);
			r = Z_OK;
		}
	} while (r != Z_STREAM_END);
	inflateEnd(&zs);
	return 1;
}

static int n_inflate(lua_State *L) {
	size_t n;
	const char *data = luaL_checklstring(L, 1, &n);
	buf_t out = {0};
	if (inflate_with(data, n, 47, &out) || inflate_with(data, n, -15, &out)) {
		lua_pushlstring(L, out.p ? out.p : "", out.n);
	} else {
		lua_pushnil(L);
	}
	free(out.p);
	return 1;
}

#ifdef __EMSCRIPTEN__
/* Synchronous GET from the worker (PoB's one-shot cache fills). Returns a
 * malloc'd buffer, or NULL with an error string in *err. */
EM_JS(char *, js_http_get, (const char *url, int *len, char **err), {
	try {
		const xhr = new XMLHttpRequest();
		xhr.open("GET", (Module.pobFetchProxy || ((u) => u))(UTF8ToString(url)), false);
		xhr.responseType = "arraybuffer";
		xhr.send(null);
		if (xhr.status < 200 || xhr.status >= 300) {
			const m = "HTTP " + xhr.status;
			const p = _malloc(lengthBytesUTF8(m) + 1);
			stringToUTF8(m, p, lengthBytesUTF8(m) + 1);
			HEAP32[err >> 2] = p;
			return 0;
		}
		const bytes = new Uint8Array(xhr.response);
		const p = _malloc(bytes.length + 1);
		HEAPU8.set(bytes, p);
		HEAP32[len >> 2] = bytes.length;
		return p;
	} catch (e) {
		const m = String(e && e.message || e);
		const p = _malloc(lengthBytesUTF8(m) + 1);
		stringToUTF8(m, p, lengthBytesUTF8(m) + 1);
		HEAP32[err >> 2] = p;
		return 0;
	}
});
#endif

static int n_http_get(lua_State *L) {
#ifdef __EMSCRIPTEN__
	const char *url = luaL_checkstring(L, 1);
	int len = 0;
	char *err = NULL;
	char *body = js_http_get(url, &len, &err);
	if (body) {
		lua_pushlstring(L, body, len);
		free(body);
		return 1;
	}
	lua_pushnil(L);
	lua_pushstring(L, err ? err : "download failed");
	free(err);
	return 2;
#else
	lua_pushnil(L);
	lua_pushstring(L, "network is not available in the native host");
	return 2;
#endif
}

static int n_make_dir(lua_State *L) {
	const char *path = luaL_checkstring(L, 1);
	if (mkdir_p(path) == 0) {
		lua_pushboolean(L, 1);
		return 1;
	}
	lua_pushboolean(L, 0);
	lua_pushstring(L, strerror(errno));
	return 2;
}

static int n_remove_dir(lua_State *L) {
	const char *path = luaL_checkstring(L, 1);
	int ok = lua_toboolean(L, 2) ? rm_rf(path) == 0 : rmdir(path) == 0;
	lua_pushboolean(L, ok);
	return 1;
}

typedef struct {
	char name[512];
	double size, mtime;
} entry_t;

static int entry_cmp(const void *a, const void *b) {
	return strcasecmp(((const entry_t *)a)->name, ((const entry_t *)b)->name);
}

static int n_file_search(lua_State *L) {
	char spec[4096];
	snprintf(spec, sizeof spec, "%s", luaL_checkstring(L, 1));
	int want_dirs = lua_toboolean(L, 2);
	for (char *q = spec; *q; q++)
		if (*q == '\\') *q = '/';
	char *slash = strrchr(spec, '/');
	const char *dir = ".", *pat = spec;
	if (slash) {
		*slash = 0;
		dir = spec;
		pat = slash + 1;
	}
	DIR *d = opendir(dir);
	if (!d) {
		lua_pushnil(L);
		return 1;
	}
	entry_t *list = NULL;
	size_t n = 0, cap = 0;
	struct dirent *e;
	while ((e = readdir(d))) {
		if (!strcmp(e->d_name, ".") || !strcmp(e->d_name, "..")) continue;
		char full[4096];
		snprintf(full, sizeof full, "%s/%s", dir, e->d_name);
		struct stat st;
		if (stat(full, &st) != 0) continue;
		if ((S_ISDIR(st.st_mode) != 0) != (want_dirs != 0)) continue;
		if (fnmatch(pat, e->d_name, 0) != 0) continue;
		if (n == cap) {
			cap = cap ? cap * 2 : 32;
			list = realloc(list, cap * sizeof *list);
		}
		snprintf(list[n].name, sizeof list[n].name, "%s", e->d_name);
		list[n].size = (double)st.st_size;
		list[n].mtime = (double)st.st_mtime;
		n++;
	}
	closedir(d);
	if (n == 0) {
		free(list);
		lua_pushnil(L);
		return 1;
	}
	qsort(list, n, sizeof *list, entry_cmp);
	lua_createtable(L, (int)n, 0);
	for (size_t i = 0; i < n; i++) {
		lua_createtable(L, 0, 3);
		lua_pushstring(L, list[i].name);
		lua_setfield(L, -2, "name");
		lua_pushnumber(L, list[i].size);
		lua_setfield(L, -2, "size");
		lua_pushnumber(L, list[i].mtime);
		lua_setfield(L, -2, "mtime");
		lua_rawseti(L, -2, (int)i + 1);
	}
	free(list);
	return 1;
}

static int n_file_exists(lua_State *L) {
	struct stat st;
	lua_pushboolean(L, stat(luaL_checkstring(L, 1), &st) == 0);
	return 1;
}

static int n_file_modified_ms(lua_State *L) {
	struct stat st;
	if (stat(luaL_checkstring(L, 1), &st) != 0) {
		lua_pushnil(L);
		return 1;
	}
	lua_pushnumber(L, (double)st.st_mtime * 1000.0);
	return 1;
}

static int n_save_build_file(lua_State *L) {
	const char *path = luaL_checkstring(L, 1);
	size_t n;
	const char *xml = luaL_checklstring(L, 2, &n);
	char tmp[4096];
	snprintf(tmp, sizeof tmp, "%s.tmp", path);
	FILE *f = fopen(tmp, "wb");
	if (!f) return luaL_error(L, "%s: %s", path, strerror(errno));
	fwrite(xml, 1, n, f);
	fclose(f);
	if (rename(tmp, path) != 0) return luaL_error(L, "%s: %s", path, strerror(errno));
	return 0;
}

static const luaL_Reg native_fns[] = {
	{"array", n_array},
	{"time", n_time},
	{"log", n_log},
	{"deflate", n_deflate},
	{"inflate", n_inflate},
	{"http_get", n_http_get},
	{"make_dir", n_make_dir},
	{"remove_dir", n_remove_dir},
	{"file_search", n_file_search},
	{"file_exists", n_file_exists},
	{"file_modified_ms", n_file_modified_ms},
	{"save_build_file", n_save_build_file},
	{NULL, NULL},
};

/* ------------------------------------------------------------------------ */
/* Entry points                                                              */
/* ------------------------------------------------------------------------ */
static buf_t result = {0};

static int traceback(lua_State *L) {
	const char *msg = lua_tostring(L, 1);
	luaL_traceback(L, L, msg ? msg : "(error object is not a string)", 1);
	return 1;
}

static int run_file(const char *dir, const char *name, int nresults) {
	char path[4096];
	snprintf(path, sizeof path, "%s/%s", dir, name);
	lua_pushcfunction(L, traceback);
	int tb = lua_gettop(L);
	if (luaL_loadfile(L, path) != LUA_OK || lua_pcall(L, 0, nresults, tb) != LUA_OK) {
		buf_puts(&result, lua_tostring(L, -1));
		lua_remove(L, tb);
		return 0;
	}
	lua_remove(L, tb);
	return 1;
}

/* Boot PoB. Returns NULL on success or an error message. */
EXPORT const char *pob_init(const char *pob_root, const char *user_dir, const char *engine_dir) {
	result.n = 0;
	buf_puts(&result, "");
	t0_ms = now_ms();
	L = luaL_newstate();
	luaL_openlibs(L);

	luaL_newmetatable(L, ARRAY_MT);
	lua_pop(L, 1);

	lua_getglobal(L, "package");
	lua_getfield(L, -1, "preload");
	lua_pushcfunction(L, luaopen_utf8);
	lua_setfield(L, -2, "lua-utf8");
	lua_pop(L, 2);

	lua_pushstring(L, pob_root);
	lua_setglobal(L, "__pob_root");
	lua_pushstring(L, user_dir);
	lua_setglobal(L, "__user_dir");
	lua_pushstring(L, engine_dir);
	lua_setglobal(L, "__engine_dir");

	luaL_newlib(L, native_fns);
	lua_pushlightuserdata(L, NULL);
	lua_setfield(L, -2, "null");
	lua_setglobal(L, "__native");

	mkdir_p(user_dir);

	if (!run_file(engine_dir, "compat.lua", 0)) return result.p;
	if (!run_file(engine_dir, "host.lua", 0)) return result.p;

	lua_pushcfunction(L, traceback);
	lua_getglobal(L, "__pob_boot");
	if (lua_pcall(L, 0, 0, -2) != LUA_OK) {
		buf_puts(&result, lua_tostring(L, -1));
		return result.p;
	}
	lua_pop(L, 1);

	if (!run_file(engine_dir, "mod_families.lua", 1)) return result.p;
	lua_setglobal(L, "__mod_families");
	if (!run_file(engine_dir, "bridge.lua", 1)) return result.p;
	if (!lua_istable(L, -1)) {
		buf_puts(&result, "bridge.lua did not return a method table");
		return result.p;
	}
	/* pob-mobile's own methods, added to the same table */
	{
		char path[4096];
		snprintf(path, sizeof path, "%s/mobile.lua", engine_dir);
		lua_pushcfunction(L, traceback);
		int tb = lua_gettop(L);
		if (luaL_loadfile(L, path) != LUA_OK) {
			buf_puts(&result, lua_tostring(L, -1));
			return result.p;
		}
		lua_pushvalue(L, -3); /* the method table */
		if (lua_pcall(L, 1, 0, tb) != LUA_OK) {
			buf_puts(&result, lua_tostring(L, -1));
			return result.p;
		}
		lua_pop(L, 1);
	}
	methods_ref = luaL_ref(L, LUA_REGISTRYINDEX);
	return NULL;
}

/* Milliseconds since pob_init started. */
EXPORT double pob_uptime(void) { return now_ms() - t0_ms; }

/* Call a bridge method. Returns {"result":...} or {"error":"..."}; the buffer
 * stays valid until the next call. */
EXPORT const char *pob_call(const char *method, const char *params_json) {
	result.n = 0;
	buf_puts(&result, "");
	if (!L || methods_ref == LUA_NOREF) {
		buf_puts(&result, "{\"error\":\"engine is not booted\"}");
		return result.p;
	}
	int top = lua_gettop(L);
	lua_pushcfunction(L, traceback);
	int tb = lua_gettop(L);
	lua_rawgeti(L, LUA_REGISTRYINDEX, methods_ref);
	lua_getfield(L, -1, method);
	lua_remove(L, -2);
	if (!lua_isfunction(L, -1)) {
		lua_settop(L, top);
		buf_puts(&result, "{\"error\":");
		char msg[512];
		snprintf(msg, sizeof msg, "unknown engine method '%s'", method);
		json_str(&result, msg, strlen(msg));
		buf_puts(&result, "}");
		return result.p;
	}
	if (params_json && *params_json) {
		jp_t p = {params_json, params_json + strlen(params_json), NULL};
		buf_t tmp = {0};
		int ok = jp_value(L, &p, &tmp, 0);
		free(tmp.p);
		if (!ok) {
			lua_settop(L, top);
			buf_puts(&result, "{\"error\":");
			json_str(&result, p.err, strlen(p.err));
			buf_puts(&result, "}");
			return result.p;
		}
	} else {
		lua_pushnil(L);
	}
	if (lua_pcall(L, 1, 1, tb) != LUA_OK) {
		size_t n;
		const char *msg = lua_tolstring(L, -1, &n);
		buf_puts(&result, "{\"error\":");
		json_str(&result, msg ? msg : "error", msg ? n : 5);
		buf_puts(&result, "}");
		lua_settop(L, top);
		return result.p;
	}
	buf_puts(&result, "{\"result\":");
	json_encode(L, -1, &result, 0);
	buf_puts(&result, "}");
	lua_settop(L, top);
	return result.p;
}

/* Run a raw Lua chunk; returns its JSON-encoded result. Debug use only. */
EXPORT const char *pob_eval(const char *code) {
	result.n = 0;
	buf_puts(&result, "");
	int top = lua_gettop(L);
	lua_pushcfunction(L, traceback);
	int tb = lua_gettop(L);
	if (luaL_loadstring(L, code) != LUA_OK || lua_pcall(L, 0, 1, tb) != LUA_OK) {
		buf_puts(&result, "{\"error\":");
		const char *m = lua_tostring(L, -1);
		json_str(&result, m, strlen(m));
		buf_puts(&result, "}");
	} else {
		buf_puts(&result, "{\"result\":");
		json_encode(L, -1, &result, 0);
		buf_puts(&result, "}");
	}
	lua_settop(L, top);
	return result.p;
}

#ifndef __EMSCRIPTEN__
/* Native CLI: pobhost <pob_root> <user_dir> <engine_dir> then reads
 * "method<TAB>json" lines from stdin and prints one JSON result per line. */
int main(int argc, char **argv) {
	if (argc < 4) {
		fprintf(stderr, "usage: %s <pob_root> <user_dir> <engine_dir>\n", argv[0]);
		return 2;
	}
	const char *err = pob_init(argv[1], argv[2], argv[3]);
	if (err) {
		fprintf(stderr, "boot failed: %s\n", err);
		return 1;
	}
	fprintf(stderr, "booted in %.0f ms\n", pob_uptime());
	static char line[1 << 24];
	while (fgets(line, sizeof line, stdin)) {
		size_t n = strlen(line);
		while (n && (line[n - 1] == '\n' || line[n - 1] == '\r')) line[--n] = 0;
		if (!n) continue;
		char *tab = strchr(line, '\t');
		const char *params = "";
		if (tab) {
			*tab = 0;
			params = tab + 1;
		}
		double t = now_ms();
		const char *out;
		if (!strcmp(line, "eval")) {
			/* params is {"code":"..."}: decode it with the JSON reader */
			lua_State *S = L;
			jp_t p = {params, params + strlen(params), NULL};
			buf_t tmp = {0};
			const char *code = "";
			if (jp_value(S, &p, &tmp, 0) && lua_istable(S, -1)) {
				lua_getfield(S, -1, "code");
				code = lua_tostring(S, -1);
			}
			char *copy = strdup(code ? code : "");
			lua_settop(S, 0);
			free(tmp.p);
			out = pob_eval(copy);
			free(copy);
		} else {
			out = pob_call(line, params);
		}
		fprintf(stderr, "%s: %.0f ms\n", line, now_ms() - t);
		fputs(out, stdout);
		fputc('\n', stdout);
		fflush(stdout);
	}
	return 0;
}
#endif
