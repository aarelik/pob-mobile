/// <reference lib="webworker" />
// Runs Path of Building in a worker: downloads (or reads from cache) the
// packed PoB tree, boots the WebAssembly engine and answers bridge calls.
// Each call runs to completion before the next; the engine is single-threaded.
import { bootEngine } from "./core.js";

type Req = { id: number; method: string; params?: unknown };
type Init = { type: "init"; root: string };

// The page's base URL; engine/ and pob/ live under it (public/ in the source tree).
let root = "";

const CACHE = "pob-mobile-data-v1";
let engine: Awaited<ReturnType<typeof bootEngine>> | null = null;
const queue: Req[] = [];

function post(msg: unknown) {
	(self as unknown as Worker).postMessage(msg);
}

async function fetchCached(url: string, expectSize: number, phase: string): Promise<Uint8Array> {
	let cache: Cache | null = null;
	try {
		cache = await caches.open(CACHE);
		const hit = await cache.match(url);
		if (hit) return new Uint8Array(await hit.arrayBuffer());
	} catch {
		cache = null;
	}
	let res: Response;
	try {
		res = await fetch(url);
	} catch (e) {
		throw new Error(`could not download ${url}: ${e instanceof Error ? e.message : e}`);
	}
	if (!res.ok || !res.body) throw new Error(`could not download ${url} (HTTP ${res.status})`);
	const total = Number(res.headers.get("content-length")) || expectSize;
	const reader = res.body.getReader();
	const parts: Uint8Array[] = [];
	let loaded = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		parts.push(value);
		loaded += value.length;
		post({ type: "progress", phase, loaded, total });
	}
	const bytes = new Uint8Array(loaded);
	let o = 0;
	for (const p of parts) {
		bytes.set(p, o);
		o += p.length;
	}
	if (cache) {
		// Hashed file names never change content; drop older packs.
		try {
			for (const key of await cache.keys()) {
				if (/core-[0-9a-f]+\.pack$/.test(key.url) && key.url !== url && url.includes("core-")) await cache.delete(key);
			}
			await cache.put(url, new Response(bytes));
		} catch {
			/* private mode or quota: run without the cache */
		}
	}
	return bytes;
}

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
	// A host that sent it with Content-Encoding has unzipped it already.
	if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
	const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

function readSync(url: string): Uint8Array {
	const xhr = new XMLHttpRequest();
	xhr.open("GET", url, false);
	xhr.responseType = "arraybuffer";
	xhr.send(null);
	if (xhr.status < 200 || xhr.status >= 300) throw new Error(`HTTP ${xhr.status} for ${url}`);
	return new Uint8Array(xhr.response as ArrayBuffer);
}

async function boot() {
	const game = "poe1";
	const dataBase = new URL(`pob/${game}/`, root).href;
	post({ type: "progress", phase: "manifest", loaded: 0, total: 1 });
	const manifestUrl = new URL("manifest.json", dataBase).href;
	const manifest = await fetch(manifestUrl, { cache: "no-cache" })
		.then((r) => r.json())
		.catch((e) => {
			throw new Error(`could not read ${manifestUrl}: ${e instanceof Error ? e.message : e}`);
		});
	const wasmUrl = new URL("engine/pob-engine.wasm", root).href;
	const [packGz, wasm] = await Promise.all([
		fetchCached(new URL(manifest.core, dataBase).href, manifest.coreSize, "data"),
		fetchCached(`${wasmUrl}?v=${manifest.engine ?? manifest.commit}`, 0, "engine"),
	]);
	post({ type: "progress", phase: "unpack", loaded: 0, total: 1 });
	const core = await gunzip(packGz);
	post({ type: "progress", phase: "boot", loaded: 0, total: 1 });
	const { default: createPobEngine } = await import(/* @vite-ignore */ new URL("engine/pob-engine.mjs", root).href);
	engine = await bootEngine({
		createPobEngine,
		manifest,
		core,
		readLazy: (p: string) => {
			post({ type: "lazy", path: p });
			return readSync(new URL(`files/${p}`, dataBase).href);
		},
		moduleOptions: { wasmBinary: wasm },
	});
	const version = engine.call("version") as Record<string, unknown>;
	post({ type: "ready", bootMs: engine.bootMs, version, upstream: { commit: manifest.commit, version: manifest.version } });
	drain();
}

function drain() {
	if (!engine) return;
	while (queue.length) {
		const req = queue.shift()!;
		const t0 = performance.now();
		try {
			const result = engine.call(req.method, req.params);
			post({ id: req.id, result, ms: performance.now() - t0 });
		} catch (e) {
			post({ id: req.id, error: e instanceof Error ? e.message : String(e), ms: performance.now() - t0 });
		}
	}
}

self.onmessage = (ev: MessageEvent<Req | Init>) => {
	const msg = ev.data;
	if ("type" in msg && msg.type === "init") {
		root = msg.root;
		boot().catch((e) => post({ type: "fatal", error: e instanceof Error ? e.message : String(e) }));
		return;
	}
	queue.push(msg as Req);
	drain();
};
