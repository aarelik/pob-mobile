-- Differential test of LuaJIT 2.1's backported v3.0 syntax. Run on real
-- LuaJIT and on the engine's Lua; the printed lines must be identical.
local out = {}
local function p(...)
	local t = {}
	for i = 1, select("#", ...) do t[i] = tostring((select(i, ...))) end
	out[#out + 1] = table.concat(t, " ")
end

-- bit operators
p(6 & 3, 6 | 3, 6 ~ 3, ~0, ~5, 1 << 4, 256 >> 4, -256 >> 4, -256 ~>> 4)
p(1 << 31, 1 << 32, 1 << 33, 0xffffffff & 0xff, 2^40 & 0xffff, 3.7 & 7, -3.5 | 0)
p(pcall(function() return "12" & 4 end) == false, 5 & 3 | 8, 1 | 2 & 3, 1 ~ 3 & 2, 1 << 2 + 1, 2 + 1 << 1, 7 & 5 == 5)
p(~~5, - ~5, ~-5, #"abc" << 1)
local a = 12
a &= 10; p(a)
a |= 1; p(a)
a ~= 3; p(a)
a <<= 2; p(a)
a >>= 1; p(a)
a = -64; a ~>>= 3; p(a)

-- customary operators
p(!true, !nil, !0, 1 != 2, 1 != 1, true && 5, nil && 5, false || 7, 3 || 7)
p(1 < 2 && 2 < 3 || false, !(1 == 1) || 9)

-- ternary
local t = { v = 1, f = function(self) return "m" end }
p(true ? 1 : 2, false ? 1 : 2, nil ? 1 : 2, 0 ? "zero" : "no")
p(1 > 2 ? "a" : 3 > 2 ? "b" : "c")
p(t.v == 1 ? t.v + 1 : t.v - 1, (t.v ? (t:f()) : "x"), t.v ? (t:f()) : "y")
p(false ? 1 : t:f(), #{ 1, 2 } > 1 ? "long" : "short")
local x = t.v and nil ? "y" : "n"; p(x)
local function tern(c) return c ? "T" : "F" end
p(tern(1), tern(false), tern(nil))
p(({ k = 1 > 0 ? "yes" : "no" }).k, ({ 1 > 0 ? 5 : 6 })[1])

-- nil coalescing
local n = nil
p(n ?? 1, false ?? 1, 0 ?? 1, n ?? n ?? 3, (n ?? t).v, n ?? false or 4)
p(t.missing ?? "dflt", t.v ?? "dflt", 1 + (n ?? 2))

-- safe navigation
local s = { a = { b = { c = 5 }, list = { 10, 20 } }, f = function(self, k) return self.a[k] end }
p(s?.a?.b.c, n?.a, n?.a.b.c, s.x?.y.z, s?.["a"].list?.[2], s.a?.list[1])
p(type(s?.f), n?.f, s:f("b")?.c, s?.a.b?.c ?? 0)
local function g() return s end
p(g()?.a.b.c, (g()?.a.list[2] or 0) + 1)
local k = 0
for i = 1, 3 do local v = (i == 2 and s or nil)?.a.b.c; if v then k += v end end
p(k)
local items = { { gemData = nil }, { gemData = { gameId = "x", grantedEffect = { support = true } } } }
for _, it in ipairs(items) do p(it.gemData?.gameId, it.gemData?.grantedEffect.support) end
local calls = 0
local obj = { m = function(self) calls += 1; return self end }
obj?.m(obj)
n?.m(n)
p(calls)

-- compound assignment
local c = 10
c += 5; c -= 3; c *= 2; c /= 4; c %= 4; p(c)
local str = "a"; str ..= "b"; str ..= 1; p(str)
local tab = { n = 1, [2] = 3 }
tab.n += 10; tab[2] *= 7
local key = 2
tab[key] -= 1
p(tab.n, tab[2])
local hits = 0
local function idx() hits += 1; return "n" end
tab[idx()] += 1
p(tab.n, hits)

-- continue
local acc = {}
for i = 1, 6 do
	if i % 2 == 0 then continue end
	local fs = {}
	for j = 1, 3 do if j == 2 then continue end fs[#fs + 1] = function() return i * 10 + j end end
	acc[#acc + 1] = fs[1]() + fs[2]()
end
p(table.concat(acc, ","))
local w, cnt = 0, 0
while w < 10 do w += 1; if w > 5 then continue end; cnt += 1 end
p(cnt)
local r = 0
repeat r += 1; if r < 3 then continue end until r >= 5
p(r)
for _, v in pairs({ a = 1 }) do do if v then continue end end p("unreached") end

-- soft keywords stay usable as names
do
	local continue, const = 1, 2
	continue += const
	local tt = { continue = 3, const = 4 }
	p(continue, tt.continue + tt.const, ({ continue, const })[2])
	for i = 1, 3 do
		if i == 2 then goto continue end
		p("iter", i)
		::continue::
	end
	const = 9
	p(const)
end

-- const
const LIMIT = 40
const A, B = 1, 2
const function twice(v) return v * 2 end
p(LIMIT + A + B, twice(4))

-- short functions
local add = |a, b| -> a + b
local sq = x -> x * x
local none = || -> "none"
local blk = |a| -> do local y = a * 2; return y + 1, "extra" end
p(add(2, 3), sq(9), none(), blk(5))
p((|...| -> select("#", ...))(1, 2, 3))
local function two() return 1, 2 end
p((|| -> two())())
local sorted = { 3, 1, 2 }
table.sort(sorted, |l, rr| -> l > rr)
p(table.concat(sorted, ","))
local mt = setmetatable({}, { __index = |_, key2| -> key2 .. "!" })
p(mt.hello)
local function map(list, fn) local o = {} for i, v in ipairs(list) do o[i] = fn(v) end return o end
p(table.concat(map({ 1, 2, 3 }, v -> v * 10 ?? 0), ","))
local cond = true
p((cond ? |q| -> q + 1 : |q| -> q - 1)(10))

-- underscores in numbers
p(1_000_000, 0x_ff, 1_0.5, 0xFF_FF)

for _, line in ipairs(out) do print(line) end
