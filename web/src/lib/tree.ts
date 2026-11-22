import { ART, assetSprite, CLASS_BACKGROUND, drawSprite, type ArtState, type ArtStore, type Sprite, type TreeArt } from "./tree-art";
// Passive tree drawing: geometry from the engine (PoB's own positions and
// connector rules), drawn on a 2D canvas with pan and pinch zoom.

export interface TNode {
	id: number;
	x: number;
	y: number;
	/** 0 normal, 1 notable, 2 keystone, 3 mastery, 4 socket, 5 class start, 6 ascendancy start */
	t: number;
	n: string | null;
	a: string | null;
	c: number | null;
	b?: boolean;
	m?: boolean;
}
/** [a, b] line, or [a, b, groupX, groupY, radius, angle1, angle2] arc */
export type TLink = [number, number] | [number, number, number, number, number, number, number];

export interface Geometry {
	version: string;
	nodes: TNode[];
	links: TLink[];
	ascendancies: { name: string; x: number; y: number; r: number }[];
	bounds: { minX: number; minY: number; maxX: number; maxY: number };
}

export interface DynamicNode {
	id: number;
	name: string | null;
	type: string | null;
	x: number;
	y: number;
	links: number[];
	allocated: boolean;
}

export interface TreeState {
	treeVersion: string;
	classId: number;
	ascendClassName: string | null;
	allocatedNodes: number[];
	passivePointsSpent: number;
	pointsAvailableMax: number;
	ascendancyPointsUsed: number;
	ascendancyPointsAvailable: number;
	sockets: { nodeId: number; rarity: string | null; name: string }[];
	dynamicNodes: DynamicNode[];
	overrides: Record<string, { name: string | null }>;
}

export const RADIUS = [26, 40, 58, 34, 38, 0, 30];
const TYPE_DYNAMIC: Record<string, number> = { Normal: 0, Notable: 1, Keystone: 2, Mastery: 3, Socket: 4 };

export interface View {
	cx: number;
	cy: number;
	scale: number;
}

export interface Highlight {
	path: Set<number>;
	selected: number | null;
	search: Set<number>;
}

function css(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";
}

/** Everything the renderer needs, with cluster jewel nodes merged in. */
export class TreeModel {
	nodes = new Map<number, TNode>();
	links: TLink[] = [];
	constructor(
		public geo: Geometry,
		dynamic: DynamicNode[] = [],
	) {
		for (const n of geo.nodes) this.nodes.set(n.id, n);
		this.links = geo.links.slice();
		for (const d of dynamic) {
			this.nodes.set(d.id, { id: d.id, x: d.x, y: d.y, t: TYPE_DYNAMIC[d.type ?? "Normal"] ?? 0, n: d.name, a: null, c: null });
		}
		const seen = new Set<string>();
		for (const d of dynamic) {
			for (const o of d.links) {
				const k = d.id < o ? `${d.id}:${o}` : `${o}:${d.id}`;
				if (seen.has(k) || !this.nodes.has(o)) continue;
				seen.add(k);
				this.links.push([d.id, o]);
			}
		}
	}

	/** The node under a screen point, if any; generous hit area for fingers. */
	hit(view: View, w: number, h: number, sx: number, sy: number): TNode | null {
		const wx = (sx - w / 2) / view.scale + view.cx;
		const wy = (sy - h / 2) / view.scale + view.cy;
		const touch = 22 / view.scale;
		let best: TNode | null = null;
		let bestD = Infinity;
		for (const n of this.nodes.values()) {
			if (n.t === 5) continue;
			const r = Math.max(RADIUS[n.t], touch);
			const dx = n.x - wx, dy = n.y - wy;
			const d = dx * dx + dy * dy;
			if (d < r * r && d < bestD) {
				best = n;
				bestD = d;
			}
		}
		return best;
	}

	/** A view that frames the given nodes (or the whole tree). */
	frame(ids: Iterable<number>, w: number, h: number): View {
		let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
		for (const id of ids) {
			const n = this.nodes.get(id);
			if (!n || n.a) continue;
			minX = Math.min(minX, n.x); maxX = Math.max(maxX, n.x);
			minY = Math.min(minY, n.y); maxY = Math.max(maxY, n.y);
		}
		if (!Number.isFinite(minX)) ({ minX, minY, maxX, maxY } = this.geo.bounds);
		const pad = 500;
		const scale = Math.min(w / (maxX - minX + pad * 2), h / (maxY - minY + pad * 2));
		return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, scale: Math.max(0.02, Math.min(scale, 0.6)) };
	}
}

export function draw(
	ctx: CanvasRenderingContext2D,
	model: TreeModel,
	view: View,
	w: number,
	h: number,
	alloc: Set<number>,
	hl: Highlight,
	state: TreeState | null,
) {
	const s = view.scale;
	const X = (x: number) => (x - view.cx) * s + w / 2;
	const Y = (y: number) => (y - view.cy) * s + h / 2;
	const col = {
		bg: css("--bg-0"),
		line: css("--line-2"),
		node: css("--bg-3"),
		ring: css("--fg-3"),
		alloc: css("--c-dps"),
		path: css("--c-cold"),
		search: css("--c-unique"),
		text: css("--fg-1"),
		asc: css("--bg-1"),
	};
	ctx.clearRect(0, 0, w, h);
	const margin = 80 / s;
	const vx0 = view.cx - w / 2 / s - margin, vx1 = view.cx + w / 2 / s + margin;
	const vy0 = view.cy - h / 2 / s - margin, vy1 = view.cy + h / 2 / s + margin;
	const visible = (n: TNode) => n.x >= vx0 && n.x <= vx1 && n.y >= vy0 && n.y <= vy1;
	const myAsc = state?.ascendClassName ?? null;

	// Ascendancy bubbles
	for (const a of model.geo.ascendancies) {
		ctx.beginPath();
		ctx.arc(X(a.x), Y(a.y), a.r * s, 0, Math.PI * 2);
		ctx.fillStyle = col.asc;
		ctx.fill();
		ctx.lineWidth = 1;
		ctx.strokeStyle = a.name === myAsc ? col.ring : col.line;
		ctx.stroke();
		if (s > 0.04) {
			ctx.fillStyle = a.name === myAsc ? col.alloc : col.text;
			ctx.font = `600 ${Math.max(10, Math.min(18, 60 * s))}px Geist Variable, system-ui`;
			ctx.textAlign = "center";
			ctx.fillText(a.name, X(a.x), Y(a.y - a.r + 40));
		}
	}

	// Connectors, batched by state
	const groups: [string, number, (l: TLink) => boolean][] = [
		[col.line, 1, (l) => !(alloc.has(l[0]) && alloc.has(l[1])) && !onPath(l)],
		[col.alloc, 2.4, (l) => alloc.has(l[0]) && alloc.has(l[1])],
		[col.path, 2.4, onPath],
	];
	function onPath(l: TLink): boolean {
		const a = alloc.has(l[0]) || hl.path.has(l[0]);
		const b = alloc.has(l[1]) || hl.path.has(l[1]);
		return a && b && (hl.path.has(l[0]) || hl.path.has(l[1])) && !(alloc.has(l[0]) && alloc.has(l[1]));
	}
	for (const [color, width, test] of groups) {
		ctx.beginPath();
		for (const l of model.links) {
			const a = model.nodes.get(l[0]), b = model.nodes.get(l[1]);
			if (!a || !b || (!visible(a) && !visible(b)) || !test(l)) continue;
			if (l.length === 7) {
				const [, , gx, gy, r, a1, a2] = l;
				const sx = X(gx) + Math.sin(a1) * r * s, sy = Y(gy) - Math.cos(a1) * r * s;
				ctx.moveTo(sx, sy);
				ctx.arc(X(gx), Y(gy), r * s, a1 - Math.PI / 2, a2 - Math.PI / 2, false);
			} else {
				ctx.moveTo(X(a.x), Y(a.y));
				ctx.lineTo(X(b.x), Y(b.y));
			}
		}
		ctx.strokeStyle = color;
		ctx.lineWidth = Math.max(width * 0.6, width * s * 8);
		ctx.stroke();
	}

	// Nodes
	const sockets = new Map((state?.sockets ?? []).map((j) => [j.nodeId, j]));
	for (const n of model.nodes.values()) {
		if (!visible(n)) continue;
		const x = X(n.x), y = Y(n.y);
		if (n.t === 5) {
			const mine = n.c === state?.classId;
			ctx.beginPath();
			ctx.arc(x, y, 150 * s, 0, Math.PI * 2);
			ctx.strokeStyle = mine ? col.alloc : col.line;
			ctx.lineWidth = mine ? 2 : 1;
			ctx.stroke();
			continue;
		}
		const r = Math.max(RADIUS[n.t] * s, n.t === 0 ? 1.6 : 2.6);
		const isAlloc = alloc.has(n.id);
		const onP = hl.path.has(n.id);
		const otherAsc = n.a && n.a !== myAsc;
		ctx.globalAlpha = otherAsc && !isAlloc ? 0.45 : 1;
		ctx.beginPath();
		if (n.t === 3) {
			// Mastery: a diamond
			ctx.moveTo(x, y - r);
			ctx.lineTo(x + r, y);
			ctx.lineTo(x, y + r);
			ctx.lineTo(x - r, y);
			ctx.closePath();
		} else {
			ctx.arc(x, y, r, 0, Math.PI * 2);
		}
		const jewel = sockets.get(n.id);
		ctx.fillStyle = isAlloc ? (jewel ? rarityColor(jewel.rarity) : col.alloc) : onP ? col.path : col.node;
		ctx.fill();
		if (n.t !== 0 || s > 0.08) {
			ctx.lineWidth = n.t >= 1 ? Math.max(1, 3 * s * 4) : 1;
			ctx.strokeStyle = isAlloc ? col.alloc : onP ? col.path : col.ring;
			ctx.stroke();
		}
		if (n.t === 4 && !isAlloc) {
			ctx.beginPath();
			ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
			ctx.strokeStyle = col.ring;
			ctx.stroke();
		}
		ctx.globalAlpha = 1;
		if (hl.search.has(n.id) || hl.selected === n.id) {
			ctx.beginPath();
			ctx.arc(x, y, r + Math.max(4, 14 * s), 0, Math.PI * 2);
			ctx.lineWidth = hl.selected === n.id ? 3 : 2;
			ctx.strokeStyle = hl.selected === n.id ? col.text : col.search;
			ctx.stroke();
		}
	}

	// Names of notables and keystones when zoomed in
	if (s > 0.22) {
		ctx.textAlign = "center";
		ctx.textBaseline = "top";
		for (const n of model.nodes.values()) {
			if ((n.t !== 1 && n.t !== 2) || !visible(n)) continue;
			const name = state?.overrides?.[n.id]?.name ?? n.n;
			if (!name) continue;
			ctx.font = `${n.t === 2 ? 600 : 500} ${n.t === 2 ? 13 : 11}px Geist Variable, system-ui`;
			ctx.fillStyle = alloc.has(n.id) ? col.alloc : col.text;
			ctx.fillText(name, X(n.x), Y(n.y) + RADIUS[n.t] * s + 4);
		}
		ctx.textBaseline = "alphabetic";
	}
}

function rarityColor(r: string | null): string {
	return r === "UNIQUE" ? css("--c-unique") : r === "RARE" ? css("--c-rare") : r === "MAGIC" ? css("--c-magic") : css("--c-normal");
}

// ---------------------------------------------------------------------------
// The tree as Path of Exile draws it (art from the engine's tree_art)
// ---------------------------------------------------------------------------

export interface TreeJewel {
	id: number;
	item: string | null;
	inner: number | null;
	outer: number | null;
	col: string | null;
	allocated: boolean;
}

export interface PowerMap {
	/** null: PoB's Offence/Defence heat map; otherwise one stat. */
	stat: string | null;
	nodes: Record<string, { s?: number | null; o?: number | null; d?: number | null }>;
	max: { singleStat: number; offence: number; defence: number };
}

export interface ArtContext {
	store: ArtStore;
	art: TreeArt;
	state: ArtState;
	jewels?: TreeJewel[];
	power?: PowerMap | null;
}

export function drawArt(
	ctx: CanvasRenderingContext2D,
	model: TreeModel,
	view: View,
	w: number,
	h: number,
	alloc: Set<number>,
	hl: Highlight,
	state: TreeState | null,
	a: ArtContext,
) {
	const { store, art } = a;
	const s = view.scale;
	const X = (x: number) => (x - view.cx) * s + w / 2;
	const Y = (y: number) => (y - view.cy) * s + h / 2;
	const margin = 700 / s;
	const vx0 = view.cx - w / 2 / s - margin, vx1 = view.cx + w / 2 / s + margin;
	const vy0 = view.cy - h / 2 / s - margin, vy1 = view.cy + h / 2 / s + margin;
	const inView = (x: number, y: number, pad = 0) => x >= vx0 - pad && x <= vx1 + pad && y >= vy0 - pad && y <= vy1 + pad;
	const myAsc = a.state.ascendancy;
	const isMyAsc = (name: string | null) => !!name && (name === myAsc || name === a.state.secondary);

	// Background: PoB tiles Background2 at 1.33 * 2.5 tree units per pixel.
	ctx.fillStyle = "#0b0a09";
	ctx.fillRect(0, 0, w, h);
	const bgPath = art.assets.Background2 ? "Background2" : "Background1";
	const bgSp = art.assets[bgPath];
	const bgImg = bgSp && store.image(art.images[bgSp[0] - 1]);
	if (bgImg) {
		const tile = bgImg.naturalWidth * 1.33 * 2.5 * s;
		const pat = ctx.createPattern(bgImg.src, "repeat");
		if (pat && tile > 12) {
			pat.setTransform(new DOMMatrix().translateSelf(X(0), Y(0)).scaleSelf(tile / bgImg.naturalWidth));
			ctx.fillStyle = pat;
			ctx.fillRect(0, 0, w, h);
		}
	}

	// Class background art for the chosen class
	const cb = a.state.classStart != null ? CLASS_BACKGROUND[a.state.classStart] : undefined;
	if (cb) drawSprite(ctx, store, art, assetSprite(art, cb[0]), X(cb[1]), Y(cb[2]), s);

	// Group backgrounds and ascendancy art
	for (const g of art.groups) {
		if (!inView(g.x, g.y, 1400)) continue;
		if (g.asc) {
			ctx.globalAlpha = isMyAsc(g.asc) ? 1 : 0.5;
			drawSprite(ctx, store, art, assetSprite(art, g.bg), X(g.x), Y(g.y), s);
			ctx.globalAlpha = 1;
		} else {
			drawSprite(ctx, store, art, assetSprite(art, g.bg), X(g.x), Y(g.y), s, !!g.half);
		}
	}

	// Connectors, stroked in layers sampled from PoB's connector textures
	const nodeState = (id: number): "alloc" | "path" | "unalloc" =>
		alloc.has(id) ? "alloc" : hl.path.has(id) || hl.selected === id ? "path" : "unalloc";
	const paths: Record<string, Path2D> = { Normal: new Path2D(), Intermediate: new Path2D(), Active: new Path2D(), Dim: new Path2D() };
	for (const l of model.links) {
		const n1 = model.nodes.get(l[0]), n2 = model.nodes.get(l[1]);
		if (!n1 || !n2 || (!inView(n1.x, n1.y) && !inView(n2.x, n2.y))) continue;
		const s1 = nodeState(l[0]), s2 = nodeState(l[1]);
		let key = s1 === "alloc" && s2 === "alloc" ? "Active" : s1 !== "unalloc" && s2 !== "unalloc" && hl.path.size ? "Intermediate" : "Normal";
		if (key === "Normal" && n1.a && !isMyAsc(n1.a)) key = "Dim";
		const p = paths[key];
		if (l.length === 7) {
			const [, , gx, gy, r, a1, a2] = l;
			p.moveTo(X(gx) + Math.sin(a1) * r * s, Y(gy) - Math.cos(a1) * r * s);
			p.arc(X(gx), Y(gy), r * s, a1 - Math.PI / 2, a2 - Math.PI / 2, false);
		} else {
			p.moveTo(X(n1.x), Y(n1.y));
			p.lineTo(X(n2.x), Y(n2.y));
		}
	}
	const lineSize = store.size("TreeData/LineConnectorNormal.png")?.[1] ?? 16;
	const width = lineSize * ART * s * 0.62;
	ctx.lineCap = "butt";
	for (const [key, tex] of [["Dim", "Normal"], ["Normal", "Normal"], ["Intermediate", "Intermediate"], ["Active", "Active"]] as const) {
		const prof = store.profile(`TreeData/LineConnector${tex}.png`);
		ctx.globalAlpha = key === "Dim" ? 0.6 : 1;
		if (prof && width >= 1.5) {
			prof.forEach((color, i) => {
				ctx.strokeStyle = color;
				ctx.lineWidth = Math.max(0.6, (width * (prof.length - i)) / prof.length);
				ctx.stroke(paths[key]);
			});
		} else {
			ctx.strokeStyle = key === "Active" ? "#d9b45f" : key === "Intermediate" ? "#7fb6c9" : "#4f4639";
			ctx.lineWidth = Math.max(1, width * 0.6);
			ctx.stroke(paths[key]);
		}
	}
	ctx.globalAlpha = 1;

	// Far out the icons are a pixel or two: dots, coloured like the frames.
	const far = s < 0.035;
	if (far) {
		const dots: Record<string, Path2D> = { alloc: new Path2D(), path: new Path2D(), unalloc: new Path2D() };
		for (const n of model.nodes.values()) {
			if (n.t === 5 || !inView(n.x, n.y)) continue;
			const r = Math.max(1.2, (RADIUS[n.t] + 14) * s);
			const p = dots[nodeState(n.id)];
			p.moveTo(X(n.x) + r, Y(n.y));
			p.arc(X(n.x), Y(n.y), r, 0, Math.PI * 2);
		}
		ctx.fillStyle = "#6d6150";
		ctx.fill(dots.unalloc);
		ctx.fillStyle = "#8fc3d6";
		ctx.fill(dots.path);
		ctx.fillStyle = "#e9c46a";
		ctx.fill(dots.alloc);
	}

	// Jewel radius rings, as PassiveTreeView draws them round socketed jewels.
	for (const j of a.jewels ?? []) {
		const n = model.nodes.get(j.id);
		if (!n || !j.outer || !j.allocated && hl.selected !== j.id) continue;
		const m = /\^x([0-9a-fA-F]{6})/.exec(j.col ?? "");
		const col = m ? `#${m[1]}` : "#bb6600";
		const sel = hl.selected === j.id;
		ctx.save();
		ctx.globalAlpha = sel ? 0.95 : 0.55;
		ctx.strokeStyle = col;
		ctx.lineWidth = Math.max(1.5, 14 * s);
		ctx.beginPath();
		ctx.arc(X(n.x), Y(n.y), j.outer * s, 0, Math.PI * 2);
		if (j.inner) {
			ctx.moveTo(X(n.x) + j.inner * s, Y(n.y));
			ctx.arc(X(n.x), Y(n.y), j.inner * s, 0, Math.PI * 2);
		}
		ctx.stroke();
		if (sel) {
			ctx.globalAlpha = 0.08;
			ctx.fillStyle = col;
			ctx.beginPath();
			ctx.arc(X(n.x), Y(n.y), j.outer * s, 0, Math.PI * 2);
			if (j.inner) ctx.arc(X(n.x), Y(n.y), j.inner * s, 0, Math.PI * 2, true);
			ctx.fill();
		}
		ctx.restore();
	}

	// Nodes: effect, icon, frame, as PassiveTreeView does
	for (const n of far ? [] : model.nodes.values()) {
		if (!inView(n.x, n.y)) continue;
		const na = art.nodes[n.id];
		const x = X(n.x), y = Y(n.y);
		const st = nodeState(n.id);
		const isAlloc = st === "alloc";
		if (!na) {
			// Cluster jewel nodes and anything without art: PoB's normal frame.
			const frame = assetSprite(art, isAlloc ? "PSSkillFrameActive" : st === "path" ? "PSSkillFrameHighlighted" : "PSSkillFrame");
			if (!drawSprite(ctx, store, art, frame, x, y, s)) fallbackNode(ctx, n, x, y, s, isAlloc);
			continue;
		}
		let base: Sprite | undefined, overlay: string | undefined, effect: Sprite | undefined;
		if (n.t === 5) {
			overlay = isAlloc || n.c === a.state.classStart ? na.start : "PSStartNodeBackgroundInactive";
		} else if (n.t === 6) {
			overlay = na.mid;
		} else if (n.t === 4) {
			const key = st + (na.alt ? "Alt" : "");
			base = assetSprite(art, (na.charm ? "Azmeri" : "") + (na.o?.[key] ?? ""));
			if (isAlloc) overlay = a.state.sockets[n.id];
		} else if (n.t === 3) {
			if (isAlloc) {
				base = na.on;
				effect = na.fx;
			} else base = st === "path" ? (na.hover ?? na.off) : na.off;
		} else {
			base = isAlloc ? na.on : na.off;
			const key = st + (n.a ? "Ascend" : "") + (n.b ? "Blighted" : "");
			const name = na.o?.[key] ?? na.o?.[st];
			overlay = n.a && na.bp && name ? na.bp + name : name;
		}
		if (effect) drawSprite(ctx, store, art, effect, x, y, s);
		const drewBase = drawSprite(ctx, store, art, base, x, y, s);
		const drewOverlay = drawSprite(ctx, store, art, assetSprite(art, overlay), x, y, s);
		if (!drewBase && !drewOverlay && n.t !== 5) fallbackNode(ctx, n, x, y, s, isAlloc);
	}

	// Node power, as PoB's heat map colours it: red for offence (or the chosen
	// stat), blue for defence, stronger for more.
	const pw = a.power;
	if (pw) {
		ctx.save();
		ctx.globalCompositeOperation = "lighter";
		for (const n of model.nodes.values()) {
			if (alloc.has(n.id) || n.t === 5 || !inView(n.x, n.y)) continue;
			const p = pw.nodes[n.id];
			if (!p) continue;
			let r = 0, b = 0;
			if (pw.stat) r = pw.max.singleStat > 0 ? Math.max(0, p.s ?? 0) / pw.max.singleStat : 0;
			else {
				r = pw.max.offence > 0 ? Math.max(0, p.o ?? 0) / pw.max.offence : 0;
				b = pw.max.defence > 0 ? Math.max(0, p.d ?? 0) / pw.max.defence : 0;
			}
			if (r < 0.03 && b < 0.03) continue;
			r = Math.sqrt(Math.min(1, r));
			b = Math.sqrt(Math.min(1, b));
			const rad = Math.max(4, (RADIUS[n.t] + 34) * s);
			const g = ctx.createRadialGradient(X(n.x), Y(n.y), rad * 0.2, X(n.x), Y(n.y), rad);
			const col = `${Math.round(255 * r)},${Math.round(60 * Math.min(r, b))},${Math.round(255 * b)}`;
			g.addColorStop(0, `rgba(${col},0.85)`);
			g.addColorStop(1, `rgba(${col},0)`);
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(X(n.x), Y(n.y), rad, 0, Math.PI * 2);
			ctx.fill();
		}
		ctx.restore();
	}

	// Search hits and the selected node
	for (const n of model.nodes.values()) {
		const sel = hl.selected === n.id;
		if ((!sel && !hl.search.has(n.id)) || !inView(n.x, n.y)) continue;
		ctx.beginPath();
		ctx.arc(X(n.x), Y(n.y), (RADIUS[n.t] + 26) * s + 4, 0, Math.PI * 2);
		ctx.lineWidth = sel ? 3 : 2.5;
		ctx.strokeStyle = sel ? "#ffffff" : "#ff5b3a";
		ctx.stroke();
	}
}

function fallbackNode(ctx: CanvasRenderingContext2D, n: TNode, x: number, y: number, s: number, alloc: boolean) {
	ctx.beginPath();
	ctx.arc(x, y, Math.max(RADIUS[n.t] * s, 1.5), 0, Math.PI * 2);
	ctx.fillStyle = alloc ? "#d9b45f" : "#3a352d";
	ctx.fill();
}
