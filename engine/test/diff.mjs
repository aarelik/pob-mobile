#!/usr/bin/env node
// Differential test: load the same builds into the portable engine (patched
// PUC Lua, what the browser runs) and into the same host linked against real
// LuaJIT 2.1 (what desktop PoB runs), then compare every scalar stat and the
// sidebar. Builds with an upstream spec file (spec/TestBuilds/*.lua) are
// also compared with upstream's expected outputs, for information only
// (they date from 2022 and upstream's CI no longer runs them).
//
//   node engine/test/diff.mjs <pob_root> <build.xml>...
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const here = path.dirname(new URL(import.meta.url).pathname);
const engineDir = path.resolve(here, "..");
const [pobRoot, ...files] = process.argv.slice(2);

function host(bin, tag) {
	const user = fs.mkdtempSync(path.join(os.tmpdir(), `pob-${tag}-`));
	const child = spawn(path.join(engineDir, "build", bin), [pobRoot, user, path.join(engineDir, "lua")], {
		env: { ...process.env, POB_QUIET: "1" },
		stdio: ["pipe", "pipe", "ignore"],
	});
	const rl = readline.createInterface({ input: child.stdout });
	const waiting = [];
	rl.on("line", (l) => waiting.shift()(JSON.parse(l)));
	return {
		call(method, params = {}) {
			return new Promise((res) => {
				waiting.push(res);
				child.stdin.write(`${method}\t${JSON.stringify(params)}\n`);
			});
		},
		close: () => child.stdin.end(),
	};
}

const a = host("pobhost", "lua52");
const b = host("pobhost-luajit", "luajit");
// Key order follows Lua's table iteration, which differs between VMs; compare canonically.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort()) : x));
const close = (x, y) => x === y || (typeof x === "number" && typeof y === "number" && Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y)));

let failed = 0;
for (const file of files) {
	const xml = fs.readFileSync(file, "utf8");
	const name = path.basename(file, ".xml");
	const [ra, rb] = await Promise.all([a.call("load_build_xml", { xml, name }), b.call("load_build_xml", { xml, name })]);
	if (ra.error || rb.error) {
		console.log(`${name}: load error\n  lua52: ${ra.error}\n  luajit: ${rb.error}`);
		failed++;
		continue;
	}
	const [sa, sb] = await Promise.all([a.call("get_stats"), b.call("get_stats")]);
	const [da, db] = await Promise.all([a.call("get_sidebar"), b.call("get_sidebar")]);
	const A = sa.result.stats, B = sb.result.stats;
	const keys = new Set([...Object.keys(A), ...Object.keys(B)]);
	const diffs = [...keys].filter((k) => !close(A[k], B[k]));
	const sideA = canon(da.result.rows), sideB = canon(db.result.rows);
	// Upstream's spec expectations (spec/TestBuilds/*.lua), compared as busted does: round to 4 places.
	let specLine = "";
	const specFile = file.replace(/\.xml$/, ".lua");
	let specBad = [];
	if (fs.existsSync(specFile)) {
		const r = await a.call("eval", { code: `return dofile(${JSON.stringify(path.resolve(specFile))}).output` });
		const expected = r.result || {};
		const round = (v) => Math.round(v * 1e4) / 1e4;
		for (const [k, v] of Object.entries(expected)) {
			const got = A[k];
			if (typeof v === "number" ? round(v) !== round(got ?? 0) : canon(v) !== canon(got)) specBad.push(k);
		}
		specLine = ` | upstream spec: ${Object.keys(expected).length - specBad.length}/${Object.keys(expected).length}`;
	}
	// Informational: upstream's expectations date from 2022 and its CI no longer runs them.
	const ok = diffs.length === 0 && sideA === sideB;
	if (!ok) failed++;
	console.log(
		`${ok ? "OK  " : "DIFF"} ${name}: ${keys.size} stats, ${diffs.length} differ, sidebar ${sideA === sideB ? "same" : "DIFFERENT"}` +
			specLine +
			` | CombinedDPS ${A.CombinedDPS?.toFixed?.(1)} Life ${A.Life}`,
	);
	for (const k of diffs.slice(0, 12)) console.log(`     ${k}: lua52=${A[k]} luajit=${B[k]}`);
}
a.close();
b.close();
process.exit(failed ? 1 : 0);
