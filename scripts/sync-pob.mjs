#!/usr/bin/env node
// Stage an upstream Path of Building checkout into the layout the engine
// expects (the file set of an installed PoB release, as pob-redux's pob-sync
// does): src/ minus dev-only folders, runtime/lua/ as lua/, and a
// release-style manifest.xml. Art is left out; the engine never draws.
//
//   node scripts/sync-pob.mjs --game poe2|poe1 [--source <checkout>] [--dest <dir>]
//
// Pinned upstream commits live in pob.json; the script refuses a checkout at a
// different commit unless --allow-mismatch is passed.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
	process.argv.slice(2).reduce((acc, a, i, all) => {
		if (a.startsWith("--")) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]);
		return acc;
	}, []),
);
const game = args.game || "poe1";
const pins = JSON.parse(fs.readFileSync(path.join(root, "pob.json"), "utf8"));
const pin = pins[game];
if (!pin) throw new Error(`unknown game ${game}`);
const source = path.resolve(root, args.source || pin.source);
const dest = path.resolve(root, args.dest || `pob/${game}`);

const head = execFileSync("git", ["-C", source, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (head !== pin.commit && !args["allow-mismatch"]) {
	console.error(`${source} is at ${head}, pob.json pins ${pin.commit} (pass --allow-mismatch)`);
	process.exit(1);
}

const EXCLUDE_DIRS = new Set(["Export", "Builds", "Assets"]);
const EXCLUDE_FILES = new Set([
	"HeadlessWrapper.lua", "LaunchInstall.lua", "Settings.xml", "_SimpleGraphic.def.lua",
	"luacov.stats.out", "poe_api_response.json",
]);
// Engine-relevant file types. Tree art (png, dds.zst) stays out.
const KEEP_EXT = /\.(lua|json|jsonc|xml|txt|zip|part\d+|zst)$/i;
const TREE_KEEP = /\.(lua|json)$/i;

fs.rmSync(dest, { recursive: true, force: true });
let files = 0, bytes = 0;
function copy(from, to) {
	fs.mkdirSync(path.dirname(to), { recursive: true });
	// Normalise line endings in text so packs are stable across platforms.
	fs.copyFileSync(from, to);
	files++;
	bytes += fs.statSync(to).size;
}
function walk(dir, rel, visit) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const r = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory()) walk(path.join(dir, e.name), r, visit);
		else if (e.isFile()) visit(path.join(dir, e.name), r);
	}
}

const src = path.join(source, "src");
walk(src, "", (abs, rel) => {
	const top = rel.split("/")[0];
	const name = path.basename(rel);
	if (rel.includes("/") && EXCLUDE_DIRS.has(top)) return;
	if (EXCLUDE_FILES.has(name)) return;
	if (top === "TreeData") {
		if (!TREE_KEEP.test(name)) return;
		// Data/TreeData *.zst are art.
	} else if (!KEEP_EXT.test(name) || /\.dds\.zst$/i.test(name)) {
		return;
	}
	copy(abs, path.join(dest, rel));
});
walk(path.join(source, "runtime/lua"), "lua", (abs, rel) => {
	if (rel.endsWith("lua-profiler.lua")) return;
	copy(abs, path.join(dest, rel));
});
for (const f of ["changelog.txt", "LICENSE.md", "help.txt"]) {
	if (fs.existsSync(path.join(source, f))) copy(path.join(source, f), path.join(dest, f));
}

const manifestText = fs.readFileSync(path.join(source, "manifest.xml"), "utf8");
const version = /<Version number="([^"]+)"/.exec(manifestText)?.[1] ?? "unknown";
// Launch.lua treats a manifest without branch and platform as a dev checkout.
fs.writeFileSync(
	path.join(dest, "manifest.xml"),
	`<?xml version='1.0' encoding='UTF-8'?>\n<PoBVersion>\n\t<Version number="${version}" branch="release" platform="win32" />\n</PoBVersion>\n`,
);
fs.writeFileSync(
	path.join(dest, "pob-mobile-sync.json"),
	JSON.stringify({ game, upstreamCommit: head, upstreamVersion: version, syncedAt: new Date().toISOString() }, null, 2),
);
console.log(`${game}: PoB ${version} @ ${head.slice(0, 10)} -> ${path.relative(root, dest)} (${files} files, ${(bytes / 1048576).toFixed(1)} MB)`);
