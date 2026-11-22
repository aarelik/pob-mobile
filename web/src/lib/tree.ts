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
