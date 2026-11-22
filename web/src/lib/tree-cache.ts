// Tree layout and art catalogue per tree version, shared by every view.
// The engine's tree_geometry and tree_art answers depend only on the tree
// version and the engine build, so they are kept in IndexedDB between visits.
// warmTree() runs when a build opens, so the Tree tab finds everything ready.
import type { Geometry } from "./tree";
import { ArtStore, loadCatalogue, type TreeArt } from "./tree-art";
import { cacheGet, cachePut } from "./storage";
import { app } from "./app.svelte";

export const artBase = new URL("pob/poe1/", document.baseURI).href;

export interface TreeData {
	geo: Geometry;
	art: TreeArt;
	store: ArtStore;
}

const loaded = new Map<string, Promise<TreeData>>();

async function cached<T>(key: string, method: string): Promise<T> {
	const full = `${app.upstreamCommit}:${key}`;
	const hit = await cacheGet<T>(full);
	if (hit) return hit;
	const fresh = await app.call<T>(method);
	void cachePut(full, fresh);
	return fresh;
}

/** The tree for a version. Must be called while that version is the open build's tree. */
export function treeData(version: string): Promise<TreeData> {
	let p = loaded.get(version);
	if (!p) {
		p = (async () => {
			const [geo, art, files] = await Promise.all([
				cached<Geometry>(`geo:${version}`, "tree_geometry"),
				cached<TreeArt>(`art:${version}`, "tree_art"),
				loadCatalogue(artBase),
			]);
			return { geo, art, store: new ArtStore(artBase, files, version) };
		})();
		p.catch(() => loaded.delete(version));
		loaded.set(version, p);
	}
	return p;
}

/** Prepares the open build's tree in the background: layout, then every image. */
export function warmTree(version: string) {
	const idle = (cb: () => void) => ("requestIdleCallback" in window ? requestIdleCallback(cb, { timeout: 1500 }) : setTimeout(cb, 300));
	idle(() => {
		treeData(version)
			.then((d) => d.store.preload(d.art.images))
			.catch(() => {});
	});
}
