#!/usr/bin/env node
// Pack a staged PoB tree (pob/<game>, from sync-pob.mjs) for the browser.
//
//   web/public/pob/<game>/core-<hash>.pack      (gzip) files the engine reads at boot or on most builds
//   web/public/pob/<game>/files/<path>          everything else, fetched by the worker on demand
//   web/public/pob/<game>/manifest.json         { core, lazy: { path: size }, version, ... }
//
// Pack format (before gzip): u32 LE index length, JSON index [[path, offset, size], ...], payload.
// The engine reads on-demand files with a synchronous XHR from its worker.
// Lua files are stored as bytecode compiled by the WebAssembly engine's own
// parser (loadfile reads either form; bytecode loads about 5x faster than
// source parses). POB_SOURCE=1 keeps them as source.
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const game = process.argv[2] || "poe1";
const src = path.join(root, "pob", game);
const out = path.join(root, "web", "public", "pob", game);
const sync = JSON.parse(fs.readFileSync(path.join(src, "pob-mobile-sync.json"), "utf8"));

// The wasm engine's pob_compile: same parser and bytecode sizes as the browser's VM.
let compile = (_rel, data) => data;
let compiled = 0;
if (!process.env.POB_SOURCE) {
	globalThis.require = createRequire(import.meta.url);
	globalThis.__dirname = path.join(root, "engine/build/wasm");
	const { default: createPobEngine } = await import(path.join(root, "engine/build/wasm/pob-engine.mjs"));
	const mod = await createPobEngine({ wasmBinary: fs.readFileSync(path.join(root, "engine/build/wasm/pob-engine.wasm")), print() {}, printErr() {} });
	compile = (rel, data) => {
		mod.FS.writeFile("/in.lua", data);
		// Data tables need no line numbers; code keeps them for tracebacks.
		const strip = /^(Data|TreeData)\//.test(rel) ? 1 : 0;
		const err = mod.ccall("pob_compile", "string", ["string", "string", "string", "number"], ["/in.lua", "/out.luac", `@/pob/${rel}`, strip]);
		if (err) throw new Error(`${rel}: ${err}`);
		compiled++;
		return Buffer.from(mod.FS.readFile("/out.luac"));
	};
}

const files = [];
(function walk(dir, rel) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
		const r = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory()) walk(path.join(dir, e.name), r);
		else files.push(r);
	}
})(src, "");

// The newest tree version is the last entry of GameVersions.lua's treeVersionList.
const gv = fs.readFileSync(path.join(src, "GameVersions.lua"), "utf8");
const listBody = /treeVersionList\s*=\s*\{([^}]*)\}/.exec(gv)?.[1] ?? "";
const listed = [...listBody.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const latest = listed.filter((v) => /^\d+_\d+$/.test(v)).pop();
if (!latest) throw new Error("could not find the latest tree version in GameVersions.lua");

function isLazy(rel) {
	// Timeless jewel seed tables (big .zip/.partN archives) load when a timeless jewel is used.
	if (rel.startsWith("Data/TimelessJewelData/") && !rel.endsWith(".lua")) return true;
	const m = /^TreeData\/([^/]+)\//.exec(rel);
	if (!m) return false;
	const v = m[1];
	if (v === "legion" || v === latest) return false;
	// Shared assets some versions load from older folders (PassiveTree.lua requires TreeData.3_19.Assets).
	if (/\/Assets\.lua$/.test(rel)) return false;
	return true;
}

// Only this script's own output; art/ and art.json belong to pack-art.mjs.
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^core-[0-9a-f]+\.pack$/.test(f) || f === "manifest.json") fs.rmSync(path.join(out, f));
fs.rmSync(path.join(out, "files"), { recursive: true, force: true });
fs.mkdirSync(path.join(out, "files"), { recursive: true });

const index = [];
const chunks = [];
let offset = 0;
const lazy = {};
for (const rel of files) {
	const abs = path.join(src, rel);
	if (isLazy(rel)) {
		const dest = path.join(out, "files", rel);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		if (rel.endsWith(".lua")) fs.writeFileSync(dest, compile(rel, fs.readFileSync(abs)));
		else fs.copyFileSync(abs, dest);
		lazy[rel] = fs.statSync(dest).size;
		continue;
	}
	const data = rel.endsWith(".lua") ? compile(rel, fs.readFileSync(abs)) : fs.readFileSync(abs);
	index.push([rel, offset, data.length]);
	chunks.push(data);
	offset += data.length;
}
// The engine's own Lua (compat, host, bridge) travels in the same pack.
for (const name of fs.readdirSync(path.join(root, "engine", "lua")).sort()) {
	if (!name.endsWith(".lua")) continue;
	const data = compile(`__engine/${name}`, fs.readFileSync(path.join(root, "engine", "lua", name)));
	index.push([`__engine/${name}`, offset, data.length]);
	chunks.push(data);
	offset += data.length;
}
const indexBuf = Buffer.from(JSON.stringify(index));
const head = Buffer.alloc(4);
head.writeUInt32LE(indexBuf.length);
const raw = Buffer.concat([head, indexBuf, ...chunks]);
const gz = zlib.gzipSync(raw, { level: 9 });
const hash = crypto.createHash("sha256").update(gz).digest("hex").slice(0, 12);
// Not ".gz": static hosts would add Content-Encoding and the browser would unzip it first.
const coreName = `core-${hash}.pack`;
fs.writeFileSync(path.join(out, coreName), gz);
// The WebAssembly engine ships next to the data; its hash busts the cache when it changes.
const engineOut = path.join(root, "web", "public", "engine");
fs.mkdirSync(engineOut, { recursive: true });
let engineHash = "none";
for (const f of ["pob-engine.mjs", "pob-engine.wasm"]) {
	const from = path.join(root, "engine", "build", "wasm", f);
	if (!fs.existsSync(from)) throw new Error(`${from} is missing; run engine/build-wasm.sh first`);
	fs.copyFileSync(from, path.join(engineOut, f));
}
engineHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(engineOut, "pob-engine.wasm"))).digest("hex").slice(0, 12);
fs.writeFileSync(
	path.join(out, "manifest.json"),
	JSON.stringify({ game, version: sync.upstreamVersion, commit: sync.upstreamCommit, latestTree: latest, engine: engineHash, core: coreName, coreSize: gz.length, coreRawSize: raw.length, lazy }),
);
const lazyTotal = Object.values(lazy).reduce((a, b) => a + b, 0);
console.log(`${game}: ${compiled ? `${compiled} Lua files as bytecode; ` : ""}core ${index.length} files, ${(raw.length / 1048576).toFixed(1)} MB -> ${(gz.length / 1048576).toFixed(1)} MB gz; ${Object.keys(lazy).length} on-demand files (${(lazyTotal / 1048576).toFixed(0)} MB); latest tree ${latest}`);
