// Backups: every saved build in one JSON file, or one build as PoB's .xml
// (which desktop Path of Building reads from its Builds folder).
import { listBuilds, newId, putBuild, type SavedBuild } from "./storage";

export function download(name: string, text: string, type = "application/json") {
	const url = URL.createObjectURL(new Blob([text], { type }));
	const a = document.createElement("a");
	a.href = url;
	a.download = name;
	document.body.append(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 5000);
}

const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, "_").trim() || "build";

export async function backupAll() {
	const builds = await listBuilds();
	const stamp = new Date().toISOString().slice(0, 10);
	download(`pob-mobile-builds-${stamp}.json`, JSON.stringify({ format: "pob-mobile-backup", version: 1, exported: Date.now(), builds }, null, 1));
	return builds.length;
}

export function downloadXml(name: string, xml: string) {
	download(`${safe(name)}.xml`, xml, "application/xml");
}

function summaryFromXml(xml: string): SavedBuild["summary"] {
	const attr = (n: string) => new RegExp(`<Build [^>]*\\b${n}="([^"]*)"`).exec(xml)?.[1] ?? null;
	return {
		className: attr("className") ?? "",
		ascendancy: attr("ascendClassName") && attr("ascendClassName") !== "None" ? attr("ascendClassName") : null,
		level: Number(attr("level") ?? 1),
		mainSkill: null,
		dps: null,
		life: null,
		es: null,
	};
}

/** Restores a backup file, or adds PoB .xml build files. Returns how many builds were added. */
export async function restoreFiles(files: FileList | File[]): Promise<number> {
	let n = 0;
	for (const f of Array.from(files)) {
		const text = await f.text();
		if (text.trimStart().startsWith("{")) {
			const j = JSON.parse(text);
			if (j.format !== "pob-mobile-backup" || !Array.isArray(j.builds)) throw new Error(`${f.name} is not a pob-mobile backup`);
			for (const b of j.builds as SavedBuild[]) {
				if (typeof b.xml !== "string") continue;
				await putBuild({ ...b, id: b.id || newId() });
				n++;
			}
		} else if (/<PathOfBuilding[\s>]/.test(text)) {
			const name = /<Build [^>]*\bbuildName="([^"]+)"/.exec(text)?.[1] ?? f.name.replace(/\.xml$/i, "");
			await putBuild({ id: newId(), name, xml: text, updatedAt: Date.now(), summary: summaryFromXml(text) });
			n++;
		} else if (/<PathOfBuilding2[\s>]/.test(text)) {
			throw new Error(`${f.name} is a Path of Exile 2 build`);
		} else {
			throw new Error(`${f.name} is not a build file`);
		}
	}
	return n;
}
