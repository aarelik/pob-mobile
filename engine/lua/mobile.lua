-- pob-mobile additions to the bridge method table. Loaded after bridge.lua
-- with the table as its argument; bridge.lua itself stays as PoB Redux ships it.
--
-- tree_geometry: what PoB's PassiveTree computed when it loaded the tree
--   (node positions, connector arcs and lines with PoB's own rules), so the
--   phone draws the same tree without shipping PoB Redux's exported art files.
-- node_detail: one node as PoB currently sees it (masteries, jewel rewrites).

local M = ...
local native = __native
local array, null = native.array, native.null
local main = launch.main
local function build() return main.modes["BUILD"] end
local function opt(v) if v == nil then return null end return v end
local function strArray(t)
	local out = array({})
	for i, v in ipairs(t or {}) do out[i] = tostring(v) end
	return out
end

local TYPE = { Normal = 0, Notable = 1, Keystone = 2, Mastery = 3, Socket = 4, ClassStart = 5, AscendClassStart = 6 }
local geometryCache = {}

M.tree_geometry = function()
	local spec = build().spec
	local tree = spec.tree
	local key = spec.treeVersion
	if geometryCache[key] then return geometryCache[key] end

	local nodes = array({})
	local minX, minY, maxX, maxY = math.huge, math.huge, -math.huge, -math.huge
	local shown = {}
	for id, node in pairs(tree.nodes) do
		-- Proxy nodes and groups only anchor cluster jewel subgraphs.
		if node.x and node.y and node.group and not node.isProxy and not node.group.isProxy then
			shown[id] = true
			nodes[#nodes + 1] = {
				id = id,
				x = math.floor(node.x * 10 + 0.5) / 10,
				y = math.floor(node.y * 10 + 0.5) / 10,
				t = TYPE[node.type] or 0,
				n = opt(node.dn),
				a = opt(node.ascendancyName),
				c = opt(node.classStartIndex),
				b = node.isBlighted and true or nil,
				m = node.isMultipleChoiceOption and true or nil,
			}
			if not node.ascendancyName then
				minX, minY = math.min(minX, node.x), math.min(minY, node.y)
				maxX, maxY = math.max(maxX, node.x), math.max(maxY, node.y)
			end
		end
	end
	table.sort(nodes, function(a, b) return a.id < b.id end)

	-- Same filter as PassiveTreeClass's connector pass: no lines to class starts
	-- or masteries, none across the ascendancy boundary, none to proxies.
	-- An arc is drawn the short way round the orbit, as BuildConnector does.
	local links = array({})
	local seen = {}
	for id, node in pairs(tree.nodes) do
		for _, otherId in pairs(node.out or {}) do
			otherId = tonumber(otherId)
			local other = tree.nodes[otherId]
			if other and shown[id] and shown[otherId]
				and node.type ~= "ClassStart" and other.type ~= "ClassStart"
				and node.type ~= "Mastery" and other.type ~= "Mastery"
				and node.ascendancyName == other.ascendancyName then
				local a, b = math.min(id, otherId), math.max(id, otherId)
				local k = a .. ":" .. b
				if not seen[k] then
					seen[k] = true
					local n1, n2 = tree.nodes[a], tree.nodes[b]
					if n1.g == n2.g and n1.o == n2.o and n1.o and n1.o > 0 then
						local a1, a2 = n1.angle, n2.angle
						if a1 > a2 then a1, a2 = a2, a1 end
						if a2 - a1 > math.pi then a1, a2 = a2, a1 + 2 * math.pi end
						links[#links + 1] = { a, b, n1.group.x, n1.group.y, tree.orbitRadii[n1.o + 1], a1, a2 }
					else
						links[#links + 1] = { a, b }
					end
				end
			end
		end
	end

	-- Ascendancy bubbles: centre and size of each ascendancy's nodes, for a backdrop.
	local asc = {}
	for _, n in ipairs(nodes) do
		if n.a ~= null then
			local e = asc[n.a]
			if not e then e = { name = n.a, minX = n.x, maxX = n.x, minY = n.y, maxY = n.y }; asc[n.a] = e end
			e.minX, e.maxX = math.min(e.minX, n.x), math.max(e.maxX, n.x)
			e.minY, e.maxY = math.min(e.minY, n.y), math.max(e.maxY, n.y)
		end
	end
	local ascendancies = array({})
	for _, e in pairs(asc) do
		ascendancies[#ascendancies + 1] = { name = e.name, x = (e.minX + e.maxX) / 2, y = (e.minY + e.maxY) / 2, r = math.max(e.maxX - e.minX, e.maxY - e.minY) / 2 + 120 }
	end

	local out = {
		version = key,
		nodes = nodes,
		links = links,
		ascendancies = ascendancies,
		bounds = { minX = minX, minY = minY, maxX = maxX, maxY = maxY },
	}
	geometryCache[key] = out
	return out
end

M.node_detail = function(p)
	local b = build()
	local spec = b.spec
	local id = tonumber(p and p.id)
	local node = id and spec.nodes[id]
	if not node then error("unknown node id " .. tostring(p and p.id), 0) end
	local out = {
		id = id,
		name = opt(node.dn),
		type = opt(node.type),
		stats = strArray(node.sd),
		reminder = strArray(node.reminderText),
		flavour = strArray(node.flavourText),
		allocated = node.alloc == true,
		ascendancy = opt(node.ascendancyName),
		canAllocate = (not node.alloc and node.path ~= nil) and true or false,
		pathCost = node.path and #node.path or null,
		-- Allocated nodes that would go with this one (PoB's dependency list).
		removes = node.alloc and #(node.depends or {}) or null,
	}
	if node.type == "Mastery" and node.masteryEffects then
		local effects = array({})
		for _, effect in ipairs(node.masteryEffects) do
			local takenBy
			for nid, eid in pairs(spec.masterySelections or {}) do
				if eid == effect.effect and nid ~= id then takenBy = nid break end
			end
			local data = spec.tree.masteryEffects and spec.tree.masteryEffects[effect.effect]
			effects[#effects + 1] = { effect = effect.effect, stats = strArray(data and data.sd or effect.stats), takenBy = opt(takenBy) }
		end
		out.masteryEffects = effects
		out.masterySelected = opt(spec.masterySelections and spec.masterySelections[id])
	end
	return out
end

-- A database item (unique or template) with one variant chosen, as raw text,
-- so the phone previews exactly what item_db_equip will equip.
M.item_db_variant_raw = function(p)
	if not p or not p.name then error("params.name is required", 0) end
	local dbList = (p.db == "rare" and main.rareDB or main.uniqueDB).list
	local dbItem = dbList[p.name]
	if not dbItem then error("unknown database item " .. tostring(p.name), 0) end
	local item = new("Item"):Item(dbItem:BuildRaw())
	local v = tonumber(p.variant)
	if v and item.variantList and item.variantList[v] then
		item.variant = v
		item:BuildAndParseRaw()
	end
	return { raw = item:BuildRaw() }
end
