-- LuaJIT compatibility for Path of Building on PUC Lua 5.2 (built with
-- LUA_COMPAT_ALL and pob-web's LuaJIT patches). Loaded before host.lua.
-- Adapted from pob-web's boot.lua (MIT, Koji AGAWA).

-- Real LuaJIT (the differential test host) needs none of the shims below,
-- only a loadfile that skips a leading '#' line as SimpleGraphic's does.
if rawget(_G, "jit") and not rawget(_G, "bit32") then
	local l_loadfile, io_open = loadfile, io.open
	loadfile = function(path, ...)
		local f = io_open(path, "rb")
		if not f then return l_loadfile(path, ...) end
		local src = f:read("*a")
		f:close()
		if src:sub(1, 1) == "#" then src = "--" .. src end
		return loadstring(src, "@" .. path)
	end
	return
end

unpack = unpack or table.unpack
loadstring = loadstring or load

local band, bor, bxor, bnot = bit32.band, bit32.bor, bit32.bxor, bit32.bnot
local lshift, rshift, arshift = bit32.lshift, bit32.rshift, bit32.arshift
local lrotate, rrotate = bit32.lrotate, bit32.rrotate

local function tobit(v)
	v = v % 0x100000000
	return v >= 0x80000000 and v - 0x100000000 or v
end

-- LuaJIT's bit ops return signed 32-bit results; bit32 returns unsigned.
bit = {
	tobit = tobit,
	band = function(...) return tobit(band(...)) end,
	bor = function(...) return tobit(bor(...)) end,
	bxor = function(...) return tobit(bxor(...)) end,
	bnot = function(x) return tobit(bnot(x)) end,
	lshift = function(x, n) return tobit(lshift(x, n)) end,
	rshift = function(x, n) return tobit(rshift(x, n)) end,
	arshift = function(x, n) return tobit(arshift(x, n)) end,
	rol = function(x, n) return tobit(lrotate(x, n)) end,
	ror = function(x, n) return tobit(rrotate(x, n)) end,
	bswap = function(x)
		x = x % 0x100000000
		local a, b = band(x, 0xff), band(rshift(x, 8), 0xff)
		local c, d = band(rshift(x, 16), 0xff), rshift(x, 24)
		return tobit(lshift(a, 24) + lshift(b, 16) + lshift(c, 8) + d)
	end,
	tohex = function(x, n)
		n = n or 8
		local up = n < 0
		if up then n = -n end
		local s = string.format(up and "%08X" or "%08x", x % 0x100000000)
		return s:sub(-n)
	end,
}
package.loaded.bit = bit

-- setfenv/getfenv over the "(luajit-env)" upvalue the patched parser names.
if not setfenv then
	local function findenv(f)
		local level = 1
		repeat
			local name, value = debug.getupvalue(f, level)
			if name == "(luajit-env)" then return level, value end
			level = level + 1
		until name == nil
	end
	getfenv = function(f)
		if type(f) ~= "function" then return _G end
		return select(2, findenv(f)) or _G
	end
	setfenv = function(f, t)
		local level = findenv(f)
		if level then debug.setupvalue(f, level, t) end
		return f
	end
end

jit = jit or {
	version = "Lua 5.2 (pob-mobile)",
	arch = "wasm",
	os = "Web",
	opt = { start = function() end, stop = function() end },
	on = function() end,
	off = function() end,
	flush = function() end,
}

table.unpack = table.unpack or unpack
math.pow = math.pow or function(a, b) return a ^ b end
