// Saved builds live in IndexedDB as PoB XML plus a small summary for the list.

export interface SavedBuild {
	id: string;
	name: string;
	xml: string;
	updatedAt: number;
	summary: {
		className: string;
		ascendancy: string | null;
		level: number;
		mainSkill: string | null;
		dps: number | null;
		life: number | null;
		es: number | null;
	};
}

const DB = "pob-mobile";
const STORE = "builds";

const CACHE = "cache";

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 2);
		req.onupgradeneeded = () => {
			const db = req.result;
			if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
			if (!db.objectStoreNames.contains(CACHE)) db.createObjectStore(CACHE);
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>, store = STORE): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const t = db.transaction(store, mode);
		const req = fn(t.objectStore(store));
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export async function listBuilds(): Promise<SavedBuild[]> {
	const all = await tx<SavedBuild[]>("readonly", (s) => s.getAll());
	return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export const getBuild = (id: string) => tx<SavedBuild | undefined>("readonly", (s) => s.get(id));
export const putBuild = (b: SavedBuild) => tx("readwrite", (s) => s.put(b));
export const deleteBuild = (id: string) => tx("readwrite", (s) => s.delete(id));

/** Derived data worth keeping between visits (tree layout per version). */
export const cacheGet = <T>(key: string) => tx<T | undefined>("readonly", (s) => s.get(key), CACHE).catch(() => undefined);
export const cachePut = (key: string, value: unknown) => tx("readwrite", (s) => s.put(value, key), CACHE).catch(() => undefined);

export function newId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const LAST = "pob-mobile:last-build";
export const lastBuildId = {
	get: () => localStorage.getItem(LAST),
	set: (id: string | null) => (id ? localStorage.setItem(LAST, id) : localStorage.removeItem(LAST)),
};
