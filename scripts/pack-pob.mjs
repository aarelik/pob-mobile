#!/usr/bin/env node
// Pack a staged PoB tree (pob/<game>, from sync-pob.mjs) for the browser.
//
//   web/public/pob/<game>/core-<hash>.pack      (gzip) files the engine reads at boot or on most builds
//   web/public/pob/<game>/files/<path>          everything else, fetched by the worker on demand
//   web/public/pob/<game>/manifest.json         { core, lazy: { path: size }, version, ... }
//
// Pack format (before gzip): u32 LE index length, JSON index [[path, offset, size], ...], payload.
// The engine reads on-demand files with a synchronous XHR from its worker.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const game = process.argv[2] || "poe1";
const src = path.join(root, "pob", game);
const out = path.join(root, "web", "public", "pob", game);
const sync = JSON.parse(fs.readFileSync(path.join(src, "pob-mobile-sync.json"), "utf8"));

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

fs.rmSync(out, { recursive: true, force: true });
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
		fs.copyFileSync(abs, dest);
		lazy[rel] = fs.statSync(abs).size;
		continue;
	}
	const data = fs.readFileSync(abs);
	index.push([rel, offset, data.length]);
	chunks.push(data);
	offset += data.length;
}
// The engine's own Lua (compat, host, bridge) travels in the same pack.
for (const name of fs.readdirSync(path.join(root, "engine", "lua")).sort()) {
	if (!name.endsWith(".lua")) continue;
	const data = fs.readFileSync(path.join(root, "engine", "lua", name));
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
console.log(`${game}: core ${index.length} files, ${(raw.length / 1048576).toFixed(1)} MB -> ${(gz.length / 1048576).toFixed(1)} MB gz; ${Object.keys(lazy).length} on-demand files (${(lazyTotal / 1048576).toFixed(0)} MB); latest tree ${latest}`);
