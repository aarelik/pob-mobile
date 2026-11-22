// Path of Exile's passive tree art, drawn the way PoB's PassiveTreeView draws it:
// group backgrounds, class and ascendancy art, node icons from GGG's sprite
// sheets under PoB's frames, mastery effects, jewel socket art. The engine
// says which image and region each part uses (tree_art); images load on demand
// from art/<hash>.webp and are cached by the browser and the service worker.

/** [imageIndex] whole image, or [imageIndex, x, y, w, h] a region of it. */
export type Sprite = [number] | [number, number, number, number, number];

export interface NodeArt {
	on?: Sprite;
	off?: Sprite;
	hover?: Sprite;
	fx?: Sprite;
	o?: Record<string, string>;
	s?: number;
	start?: string;
	mid?: string;
	bp?: string;
	charm?: boolean;
	alt?: boolean;
}

export interface TreeArt {
	version: string;
	images: string[];
	assets: Record<string, Sprite>;
	nodes: Record<string, NodeArt>;
	groups: { x: number; y: number; bg: string; half?: boolean; asc: string | null }[];
}

export interface ArtState {
	sockets: Record<string, string>;
	classStart: number | null;
	ascendancy: string | null;
	secondary: string | null;
}

type Entry = [string, number, number];
let catalogue: Promise<Record<string, Entry>> | null = null;

/** art.json: every TreeData image the build ships, by PoB path. */
export function loadCatalogue(base: string): Promise<Record<string, Entry>> {
	catalogue ??= fetch(new URL("art.json", base))
		.then((r) => r.json())
		.then((j) => j.files as Record<string, Entry>)
		.catch(() => ({}));
	return catalogue;
}

// PoB's art scale: DrawAsset draws an image of w pixels 2 * 1.33 * w tree units wide.
export const ART = 2.66;

export class ArtStore {
	private imgs = new Map<string, HTMLImageElement | null>();
	private profiles = new Map<string, string[]>();
	constructor(
		private base: string,
		private files: Record<string, Entry>,
		private version: string,
		private onLoad: () => void,
	) {}

	/** PoB's LoadImage looks in TreeData/ first, then TreeData/<version>/. */
	resolve(path: string): Entry | null {
		const direct = this.files[path];
		if (direct) return direct;
		const name = path.replace(/^TreeData\//, "");
		return this.files[`TreeData/${this.version}/${name}`] ?? null;
	}

	image(path: string): HTMLImageElement | null {
		const hit = this.imgs.get(path);
		if (hit !== undefined) return hit && hit.complete && hit.naturalWidth ? hit : null;
		const entry = this.resolve(path);
		if (!entry) {
			this.imgs.set(path, null);
			return null;
		}
		const img = new Image();
		img.decoding = "async";
		img.onload = () => this.onLoad();
		img.src = new URL(`art/${entry[0]}.webp`, this.base).href;
		this.imgs.set(path, img);
		return null;
	}

	size(path: string): [number, number] | null {
		const e = this.resolve(path);
		return e ? [e[1], e[2]] : null;
	}

	/**
	 * Colour bands across a connector texture, outer edge first, so a line or
	 * an arc can be stroked in layers that look like PoB's textured connector.
	 */
	profile(path: string): string[] | null {
		const cached = this.profiles.get(path);
		if (cached) return cached;
		const img = this.image(path);
		if (!img) return null;
		const c = document.createElement("canvas");
		c.width = 64;
		c.height = img.naturalHeight;
		const g = c.getContext("2d", { willReadFrequently: true })!;
		g.drawImage(img, 0, 0, img.naturalWidth, img.naturalHeight, 0, 0, 64, img.naturalHeight);
		const data = g.getImageData(0, 0, 64, img.naturalHeight).data;
		const rows: string[] = [];
		const half = Math.ceil(img.naturalHeight / 2);
		for (let y = 0; y < half; y++) {
			let r = 0, gg = 0, b = 0, a = 0;
			for (const yy of [y, img.naturalHeight - 1 - y]) {
				for (let x = 0; x < 64; x++) {
					const i = (yy * 64 + x) * 4;
					const al = data[i + 3] / 255;
					r += data[i] * al; gg += data[i + 1] * al; b += data[i + 2] * al; a += al;
				}
			}
			const n = 128;
			rows.push(a > 0 ? `rgba(${Math.round(r / a)},${Math.round(gg / a)},${Math.round(b / a)},${(a / n).toFixed(3)})` : "rgba(0,0,0,0)");
		}
		this.profiles.set(path, rows);
		return rows;
	}
}

/** Draws one asset or sprite centred on (x, y) in screen space. */
export function drawSprite(
	ctx: CanvasRenderingContext2D,
	store: ArtStore,
	art: TreeArt,
	sp: Sprite | undefined,
	x: number,
	y: number,
	scale: number,
	half = false,
): boolean {
	if (!sp) return false;
	const path = art.images[sp[0] - 1];
	if (!path) return false;
	const img = store.image(path);
	if (!img) return false;
	let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight;
	if (sp.length === 5) [, sx, sy, sw, sh] = sp;
	const w = sw * ART * scale, h = sh * ART * scale;
	if (half) {
		// PoB's isHalf: the image is the top half of the circle; the bottom is its mirror.
		ctx.drawImage(img, sx, sy, sw, sh, x - w / 2, y - h, w, h);
		ctx.save();
		ctx.translate(x, y);
		ctx.scale(1, -1);
		ctx.drawImage(img, sx, sy, sw, sh, -w / 2, -h, w, h);
		ctx.restore();
		return true;
	}
	ctx.drawImage(img, sx, sy, sw, sh, x - w / 2, y - h / 2, w, h);
	return true;
}

export function assetSprite(art: TreeArt, name: string | undefined): Sprite | undefined {
	return name ? art.assets[name] : undefined;
}

// PoB's class background art positions (PassiveTreeView: "the position data
// doesn't seem to be in the tree JSON yet").
export const CLASS_BACKGROUND: Record<number, [string, number, number]> = {
	1: ["BackgroundStr", -2750, 1600],
	2: ["BackgroundDex", 2550, 1600],
	3: ["BackgroundInt", -250, -2200],
	4: ["BackgroundStrDex", -150, 2350],
	5: ["BackgroundStrInt", -2100, -1500],
	6: ["BackgroundDexInt", 2350, -1950],
};
