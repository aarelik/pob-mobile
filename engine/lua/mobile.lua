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

-- tree_art: which image (and which region of it) PoB draws for every part of
-- the tree, read from PoB's loaded tree: tree.assets (frames, backgrounds,
-- class art) and each node's sprites (icons from GGG's sheets). Image paths
-- are what PoB asked SimpleGraphic to load ("TreeData/<file>"); like PoB's
-- LoadImage, the phone looks for the file in TreeData/ and then in
-- TreeData/<version>/. Regions are pixel rectangles (the headless host
-- reports every image as 1x1, so PoB's fractions come out in pixels).
M.tree_art = function()
	local spec = build().spec
	local tree = spec.tree
	local images, imageIndex = array({}), {}
	local function img(path)
		if not path then return nil end
		local i = imageIndex[path]
		if not i then
			images[#images + 1] = path
			i = #images
			imageIndex[path] = i
		end
		return i
	end
	local function sprite(s)
		if type(s) ~= "table" or not s.handle or not s.handle.path then return nil end
		if type(s[1]) == "number" and type(s[4]) == "number" then
			return { img(s.handle.path), s[1], s[2], s[3] - s[1], s[4] - s[2] }
		end
		return { img(s.handle.path) }
	end
	local assets = {}
	for name, a in pairs(tree.assets) do
		local sp = sprite(a)
		if sp then assets[name] = sp end
	end
	local nodes = {}
	for id, node in pairs(tree.nodes) do
		if node.x and node.group and not node.isProxy and not node.group.isProxy then
			local e = { o = node.overlay and {} or nil }
			if node.overlay then
				for k, v in pairs(node.overlay) do
					if type(v) == "string" then e.o[k] = v end
				end
				e.s = node.overlay.size
			end
			local t = node.type
			local sp = node.sprites or {}
			if t == "Normal" or t == "Notable" or t == "Keystone" then
				local key = t:lower()
				e.on = sprite(sp[key .. "Active"])
				e.off = sprite(sp[key .. "Inactive"])
			elseif t == "Mastery" then
				local ms = node.masterySprites or {}
				e.off = sprite(ms.inactiveIcon and ms.inactiveIcon.masteryInactive) or sprite(sp.mastery)
				e.hover = sprite(ms.inactiveIcon and ms.inactiveIcon.masteryConnected)
				e.on = sprite(ms.activeIcon and ms.activeIcon.masteryActiveSelected) or sprite(sp.mastery)
				e.fx = sprite(ms.activeEffectImage and ms.activeEffectImage.masteryActiveEffect)
			elseif t == "ClassStart" then
				e.start = node.startArt
			elseif t == "AscendClassStart" then
				local prefix = tree.bloodlineSpritePrefixes and node.ascendancyName and tree.bloodlineSpritePrefixes[node.ascendancyName]
				e.mid = (prefix or "") .. "AscendancyMiddle"
			end
			if node.ascendancyName then
				e.bp = tree.bloodlineSpritePrefixes and tree.bloodlineSpritePrefixes[node.ascendancyName] or nil
			end
			e.charm = node.name == "Charm Socket" or nil
			e.alt = node.expansionJewel and true or nil
			nodes[tostring(id)] = e
		end
	end
	local groups = array({})
	for _, g in pairs(tree.groups) do
		if not g.isProxy and g.x then
			local bg, half
			if g.ascendancyName then
				if g.isAscendancyStart then bg = "Classes" .. g.ascendancyName end
			elseif g.oo and g.oo[3] then
				bg, half = "PSGroupBackground3", true
			elseif g.oo and g.oo[2] then
				bg = "PSGroupBackground2"
			elseif g.oo and g.oo[1] then
				bg = "PSGroupBackground1"
			end
			if bg then groups[#groups + 1] = { x = g.x, y = g.y, bg = bg, half = half, asc = opt(g.ascendancyName) } end
		end
	end
	return { version = spec.treeVersion, images = images, assets = assets, nodes = nodes, groups = groups }
end

-- Per-build art state: the jewel art for each filled socket (PoB's own choice).
M.tree_art_state = function()
	local b = build()
	local viewer = b.treeTab and b.treeTab.viewer
	local sockets = {}
	for nodeId, node in pairs(b.spec.nodes) do
		if node.type == "Socket" and node.alloc then
			local ok, _, jewel = pcall(b.itemsTab.GetSocketAndJewelForNodeID, b.itemsTab, nodeId)
			if ok and jewel and viewer then
				local alt = node.expansionJewel and not (jewel.base and jewel.base.subType == "Blightcore")
				local ok2, name = pcall(viewer.GetJewelSocketOverlay, viewer, jewel, alt)
				if ok2 and name then sockets[tostring(nodeId)] = name end
			end
		end
	end
	local mastery = {}
	for id, eid in pairs(b.spec.masterySelections or {}) do mastery[tostring(id)] = eid end
	return { sockets = sockets, classStart = opt(b.spec.curClassId), ascendancy = opt(b.spec.curAscendClassBaseName), secondary = opt(b.spec.curSecondaryAscendClass and b.spec.curSecondaryAscendClass.id) }
end
