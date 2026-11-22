// Is there a newer Path of Building release than the one this app runs?
// GitHub's API allows cross-origin reads.
import { app } from "./app.svelte";

export interface UpstreamInfo {
	latest: string;
	newer: boolean;
}

function cmp(a: string, b: string): number {
	const pa = a.replace(/^v/, "").split(".").map(Number);
	const pb = b.replace(/^v/, "").split(".").map(Number);
	for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
		const d = (pa[i] ?? 0) - (pb[i] ?? 0);
		if (d) return d;
	}
	return 0;
}

export async function checkUpstream(): Promise<UpstreamInfo | null> {
	try {
		const r = await fetch("https://api.github.com/repos/PathOfBuildingCommunity/PathOfBuilding/releases/latest", { headers: { Accept: "application/vnd.github+json" } });
		if (!r.ok) return null;
		const j = await r.json();
		const latest = String(j.tag_name ?? "").replace(/^v/, "");
		if (!latest) return null;
		return { latest, newer: !!app.pobVersion && cmp(latest, app.pobVersion) > 0 };
	} catch {
		return null;
	}
}
