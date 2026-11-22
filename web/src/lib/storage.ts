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

function open(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
	const db = await open();
	return new Promise((resolve, reject) => {
		const t = db.transaction(STORE, mode);
		const req = fn(t.objectStore(STORE));
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

export function newId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const LAST = "pob-mobile:last-build";
export const lastBuildId = {
	get: () => localStorage.getItem(LAST),
	set: (id: string | null) => (id ? localStorage.setItem(LAST, id) : localStorage.removeItem(LAST)),
};
