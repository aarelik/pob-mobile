// Boots the WebAssembly engine from a packed PoB tree. Shared by the browser
// worker and the Node smoke test, so it only uses what both have.

/** Splits an unpacked core pack into [path, bytes] entries. */
export function unpack(raw) {
	const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
	const indexLen = view.getUint32(0, true);
	const index = JSON.parse(new TextDecoder().decode(raw.subarray(4, 4 + indexLen)));
	const base = 4 + indexLen;
	return index.map(([path, offset, size]) => [path, raw.subarray(base + offset, base + offset + size)]);
}

function mkdirp(FS, dir) {
	let cur = "";
	for (const part of dir.split("/").filter(Boolean)) {
		cur += "/" + part;
		try {
			FS.mkdir(cur);
		} catch {
			/* exists */
		}
	}
}

/**
 * @param {object} o
 * @param {Function} o.createPobEngine  Emscripten module factory
 * @param {object} o.manifest           manifest.json of the pack
 * @param {Uint8Array} o.core           unpacked core pack
 * @param {(path: string) => Uint8Array} o.readLazy  synchronously reads an on-demand file (sync XHR in the worker)
 * @param {Map<string, Uint8Array>} [o.prefetched]  on-demand files already on hand (from an earlier visit)
 * @param {object} [o.moduleOptions]    extra Emscripten module options (locateFile, print...)
 */
/** A MEMFS file whose bytes are read on first access. */
function createLazyFile(FS, dir, name, size, read) {
	const node = FS.createFile(dir, name, {}, true, false);
	const load = () => {
		if (node.lazyLoaded) return;
		const bytes = read();
		node.contents = bytes;
		node.usedBytes = bytes.length;
		node.lazyLoaded = true;
	};
	const base = node.stream_ops;
	node.stream_ops = Object.fromEntries(Object.entries(base).map(([k, fn]) => [k, (...a) => (load(), fn(...a))]));
	const getattr = node.node_ops.getattr;
	node.node_ops = { ...node.node_ops, getattr: (n) => ({ ...getattr(n), size: n.lazyLoaded ? n.usedBytes : size }) };
	return node;
}

export async function bootEngine({ createPobEngine, manifest, core, readLazy, prefetched = new Map(), moduleOptions = {} }) {
	const logs = [];
	const mod = await createPobEngine({
		print: (s) => logs.push(s),
		printErr: (s) => logs.push(s),
		...moduleOptions,
	});
	const { FS } = mod;
	const root = "/pob";
	for (const [path, bytes] of unpack(core)) {
		const full = `${root}/${path}`;
		mkdirp(FS, full.slice(0, full.lastIndexOf("/")));
		FS.writeFile(full, bytes, { canOwn: false });
	}
	for (const [path, size] of Object.entries(manifest.lazy)) {
		const full = `${root}/${path}`;
		const dir = full.slice(0, full.lastIndexOf("/"));
		mkdirp(FS, dir);
		const have = prefetched.get(path);
		if (have && have.length === size) FS.writeFile(full, have);
		else createLazyFile(FS, dir, full.slice(dir.length + 1), size, () => readLazy(path));
	}
	mkdirp(FS, "/user");

	const init = mod.cwrap("pob_init", "string", ["string", "string", "string"]);
	const callRaw = mod.cwrap("pob_call", "string", ["string", "string"]);
	const uptime = mod.cwrap("pob_uptime", "number", []);
	const t0 = Date.now();
	const err = init(root, "/user", `${root}/__engine`);
	if (err) throw new Error(`engine boot failed: ${err}\n${logs.slice(-20).join("\n")}`);
	return {
		module: mod,
		bootMs: Date.now() - t0,
		logs,
		uptime,
		/** Calls a bridge method; resolves its result or throws its error. */
		call(method, params) {
			const out = JSON.parse(callRaw(method, params == null ? "" : JSON.stringify(params)));
			if (out.error !== undefined) {
				const e = new Error(out.error);
				e.engine = true;
				throw e;
			}
			return out.result;
		},
	};
}
