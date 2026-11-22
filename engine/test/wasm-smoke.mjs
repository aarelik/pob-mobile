#!/usr/bin/env node
// Boots the WebAssembly engine in Node from the browser pack and loads builds,
// printing the stats the differential test also checks.
//   node engine/test/wasm-smoke.mjs [build.xml...]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
globalThis.require = createRequire(import.meta.url);
globalThis.__dirname = path.join(root, "engine/build/wasm");

const { default: createPobEngine } = await import(path.join(root, "engine/build/wasm/pob-engine.mjs"));
const { bootEngine } = await import(path.join(root, "web/src/engine/core.js"));

const packDir = path.join(root, "web/public/pob/poe1");
const manifest = JSON.parse(fs.readFileSync(path.join(packDir, "manifest.json"), "utf8"));
const core = zlib.gunzipSync(fs.readFileSync(path.join(packDir, manifest.core)));

const engine = await bootEngine({
	createPobEngine,
	manifest,
	core: new Uint8Array(core.buffer, core.byteOffset, core.byteLength),
	readLazy: (p) => {
		console.log(`  (on demand: ${p})`);
		return new Uint8Array(fs.readFileSync(path.join(packDir, "files", p)));
	},
	moduleOptions: { wasmBinary: fs.readFileSync(path.join(root, "engine/build/wasm/pob-engine.wasm")) },
});
console.log(`booted in ${engine.bootMs} ms`, engine.call("version").pobVersion);
for (const file of process.argv.slice(2)) {
	const t = Date.now();
	const info = engine.call("load_build_xml", { xml: fs.readFileSync(file, "utf8"), name: path.basename(file) });
	const s = engine.call("get_stats", { fields: ["CombinedDPS", "Life", "TotalEHP"] }).stats;
	console.log(`${path.basename(file, ".xml")}: ${Date.now() - t} ms  ${info.className}/${info.ascendClassName}  CombinedDPS ${s.CombinedDPS?.toFixed(1)} Life ${s.Life} EHP ${Math.round(s.TotalEHP)}`);
}
