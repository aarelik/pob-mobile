#!/usr/bin/env node
// Passive tree art for the browser, from the upstream checkout's TreeData/.
// Every image is re-encoded as WebP (same pixel size: sprite coordinates are
// in pixels) and stored once under its content hash, so the many identical
// files across tree versions and their ruthless/alternate variants cost
// nothing extra. Nothing here is committed; CI builds it with the site.
//
//   web/public/pob/<game>/art/<hash>.webp
//   web/public/pob/<game>/art.json   { files: { "TreeData/<path>": [hash, width, height] } }
//
//   node scripts/pack-art.mjs [game]
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const game = process.argv[2] || "poe1";
const pins = JSON.parse(fs.readFileSync(path.join(root, "pob.json"), "utf8"));
const treeData = path.join(path.resolve(root, pins[game].source), "src", "TreeData");
const out = path.join(root, "web", "public", "pob", game);
const artDir = path.join(out, "art");
fs.mkdirSync(artDir, { recursive: true });

const IMAGE = /\.(png|jpe?g|webp)$/i;
const files = [];
(function walk(dir, rel) {
	for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
		const r = rel ? `${rel}/${e.name}` : e.name;
		if (e.isDirectory()) walk(path.join(dir, e.name), r);
		else if (IMAGE.test(e.name)) files.push(r);
	}
})(treeData, "");

const map = {};
const byHash = new Map();
let rawBytes = 0, outBytes = 0, unique = 0;
const queue = files.slice();
async function worker() {
	for (let rel; (rel = queue.shift()); ) {
		const abs = path.join(treeData, rel);
		const data = fs.readFileSync(abs);
		rawBytes += data.length;
		const hash = crypto.createHash("sha256").update(data).digest("hex").slice(0, 16);
		let entry = byHash.get(hash);
		if (!entry) {
			entry = (async () => {
				const dest = path.join(artDir, `${hash}.webp`);
				const img = sharp(data, { limitInputPixels: false });
				const meta = await img.metadata();
				if (!fs.existsSync(dest)) {
					const lossless = meta.width * meta.height < 64 * 64;
					await img.webp(lossless ? { lossless: true } : { quality: 88, alphaQuality: 100, effort: 5 }).toFile(dest);
				}
				outBytes += fs.statSync(dest).size;
				unique++;
				return [hash, meta.width, meta.height];
			})();
			byHash.set(hash, entry);
		}
		map[`TreeData/${rel}`] = await entry;
	}
}
await Promise.all(Array.from({ length: Math.max(2, os.cpus().length) }, worker));

// Drop images no longer referenced (an upstream bump changes some).
const keep = new Set(Object.values(map).map(([h]) => `${h}.webp`));
for (const f of fs.readdirSync(artDir)) if (!keep.has(f)) fs.rmSync(path.join(artDir, f));

fs.writeFileSync(path.join(out, "art.json"), JSON.stringify({ files: map }));
console.log(
	`${game}: ${files.length} tree images (${(rawBytes / 1048576).toFixed(0)} MB) -> ${unique} unique WebP (${(outBytes / 1048576).toFixed(0)} MB)`,
);
