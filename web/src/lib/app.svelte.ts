// App state: engine lifecycle, the open build, saving and importing.
import { EngineClient, type Progress } from "../engine/client";
import type { BuildInfo, BuildSummary } from "../engine/types";
import { fetchBuildLink } from "./net";
import { deleteBuild, getBuild, lastBuildId, listBuilds, newId, putBuild, type SavedBuild } from "./storage";

export type Tab = "overview" | "tree" | "skills" | "items" | "config" | "stats" | "notes";
export type Screen = "builds" | "build";

class App {
	phase = $state<"booting" | "ready" | "error">("booting");
	progress = $state<Progress>({ phase: "manifest", loaded: 0, total: 1 });
	error = $state<string | null>(null);
	pobVersion = $state("");
	upstreamCommit = $state("");
	bootMs = $state(0);

	screen = $state<Screen>("builds");
	tab = $state<Tab>("overview");
	build = $state<BuildInfo | null>(null);
	/** Bumps whenever the engine's build output changes; views refetch on it. */
	rev = $state(0);
	currentId = $state<string | null>(null);
	busy = $state(0);
	saving = $state(false);
	toast = $state<{ text: string; kind: "info" | "error" } | null>(null);
	lazyLoading = $state<string | null>(null);
	saved = $state<SavedBuild[]>([]);
	/** A slot for the Items tab to open (set by the tree's jewel button). */
	openSlot = $state<string | null>(null);
	canUndo = $state(false);
	canRedo = $state(false);

	engine!: EngineClient;
	private saveTimer: ReturnType<typeof setTimeout> | null = null;
	private toastTimer: ReturnType<typeof setTimeout> | null = null;

	async start() {
		this.saved = await listBuilds().catch(() => []);
		this.engine = new EngineClient();
		this.engine.onProgress = (p) => (this.progress = p);
		this.engine.onLazy = (path) => {
			this.lazyLoading = path;
			setTimeout(() => (this.lazyLoading = null), 1500);
		};
		try {
			const ready = await this.engine.ready;
			this.pobVersion = String(ready.version.pobVersion ?? "");
			this.upstreamCommit = ready.upstream.commit;
			this.bootMs = ready.bootMs;
			this.phase = "ready";
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			this.phase = "error";
			return;
		}
		const last = lastBuildId.get();
		if (last && this.saved.some((b) => b.id === last)) {
			await this.openSaved(last).catch(() => (this.screen = "builds"));
		}
	}

	notify(text: string, kind: "info" | "error" = "info") {
		this.toast = { text, kind };
		if (this.toastTimer) clearTimeout(this.toastTimer);
		this.toastTimer = setTimeout(() => (this.toast = null), kind === "error" ? 5000 : 2500);
	}

	/** A read-only bridge call. */
	call<T>(method: string, params?: unknown): Promise<T> {
		return this.engine.call<T>(method, params);
	}

	/** A bridge call that changes the build: refreshes state and schedules a save. */
	async mutate<T>(method: string, params?: unknown): Promise<T> {
		this.busy++;
		try {
			const r = await this.engine.call<T>("mutate", { method, params: params ?? {} });
			this.canUndo = true;
			this.canRedo = false;
			await this.refresh();
			this.scheduleSave();
			return r;
		} catch (e) {
			this.notify(e instanceof Error ? e.message : String(e), "error");
			throw e;
		} finally {
			this.busy--;
		}
	}

	/** Undoes (or redoes) the last change anywhere in the build. */
	async undo(redo = false) {
		this.busy++;
		try {
			const r = await this.engine.call<{ canUndo: boolean; canRedo: boolean }>("undo", { redo });
			this.canUndo = r.canUndo;
			this.canRedo = r.canRedo;
			await this.refresh();
			this.scheduleSave();
		} catch (e) {
			this.notify(e instanceof Error ? e.message : String(e), "error");
		} finally {
			this.busy--;
		}
	}

	async refresh() {
		this.build = await this.engine.call<BuildInfo>("get_build");
		this.rev++;
	}

	private async opened(info: BuildInfo, id: string, xmlForNew?: string) {
		this.build = info;
		this.canUndo = false;
		this.canRedo = false;
		this.currentId = id;
		lastBuildId.set(id);
		this.rev++;
		this.screen = "build";
		this.tab = "overview";
		void import("./tree-cache").then((m) => m.warmTree(info.treeVersion));
		if (xmlForNew !== undefined) await this.saveNow();
	}

	async openSaved(id: string) {
		const b = await getBuild(id);
		if (!b) throw new Error("build not found");
		this.busy++;
		try {
			const info = await this.engine.call<BuildInfo>("load_build_xml", { xml: b.xml, name: b.name });
			await this.opened(info, id);
		} finally {
			this.busy--;
		}
	}

	async newBuild(name = "New build") {
		this.busy++;
		try {
			const info = await this.engine.call<BuildInfo>("new_build", { name });
			await this.opened(info, newId(), "");
		} finally {
			this.busy--;
		}
	}

	/** Imports a share code, build XML, or a pobb.in / pastebin link. */
	async importBuild(input: string, name?: string) {
		let text = input.trim();
		if (!text) throw new Error("Paste a build code or link first.");
		if (/^(https?:\/\/)?(www\.)?(pobb\.in|poe\.ninja|maxroll\.gg|mobalytics\.gg|pob\.codes|pastebinp?\.com|rentry\.co|poedb\.tw|poe2db\.tw)\//i.test(text) || /^https?:\/\//i.test(text)) text = await fetchBuildLink(text);
		this.busy++;
		try {
			let info: BuildInfo;
			if (text.startsWith("<")) {
				if (/<PathOfBuilding2[\s>]/.test(text)) throw new Error("That is a Path of Exile 2 build. This app runs Path of Building for Path of Exile 1.");
				info = await this.engine.call<BuildInfo>("load_build_xml", { xml: text, name: name || xmlName(text) || "Imported build" });
			} else {
				const code = text.replace(/\s+/g, "");
				const { game } = await this.engine.call<{ game: string | null }>("code_game", { code });
				if (game === "poe2") throw new Error("That is a Path of Exile 2 build. This app runs Path of Building for Path of Exile 1.");
				if (!game) throw new Error("That does not look like a Path of Building code.");
				info = await this.engine.call<BuildInfo>("load_build_code", { code, name: name || "Imported build" });
			}
			await this.opened(info, newId(), "");
			if (info.name === "Imported build" && this.build) {
				// Name it after what it is, as PoB's build list would show it.
				const label = `${info.ascendClassName || info.className} ${info.level}`;
				await this.engine.call("set_build_name", { name: label }).catch(() => {});
				await this.refresh();
				await this.saveNow();
			}
		} finally {
			this.busy--;
		}
	}

	/** Imports a character from pathofexile.com data (see net.ts). */
	async importCharacter(data: string, name: string) {
		this.busy++;
		try {
			const info = await this.engine.call<BuildInfo>("import_character", { data, name });
			await this.opened(info, newId(), "");
		} finally {
			this.busy--;
		}
	}

	/** Re-imports the open build's tree and/or gear from the character data. */
	async reimportCharacter(data: string, parts: { tree: boolean; gear: boolean }) {
		await this.mutate("import_character_into", { data, ...parts, deleteJewels: parts.tree, deleteEquipment: parts.gear, deleteSkills: parts.gear });
	}

	scheduleSave() {
		if (this.saveTimer) clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => this.saveNow(), 800);
	}

	async saveNow() {
		if (!this.currentId || !this.build) return;
		this.saving = true;
		try {
			const [{ xml }, summary] = await Promise.all([
				this.engine.call<{ xml: string }>("save_build_xml"),
				this.engine.call<BuildSummary>("build_summary").catch(() => null),
			]);
			const b = this.build;
			const entry: SavedBuild = {
				id: this.currentId,
				name: b.name,
				xml,
				updatedAt: Date.now(),
				summary: {
					className: b.className,
					ascendancy: b.ascendClassName,
					level: b.level,
					mainSkill: summary?.mainSkill ?? null,
					dps: summary?.totalDPS ?? null,
					life: summary?.life ?? null,
					es: summary?.energyShield ?? null,
				},
			};
			await putBuild(entry);
			this.saved = await listBuilds();
		} catch (e) {
			this.notify(`Could not save: ${e instanceof Error ? e.message : e}`, "error");
		} finally {
			this.saving = false;
		}
	}

	async reloadSaved() {
		this.saved = await listBuilds();
	}

	async remove(id: string) {
		await deleteBuild(id);
		if (this.currentId === id) {
			this.currentId = null;
			lastBuildId.set(null);
		}
		this.saved = await listBuilds();
	}

	async duplicate(id: string) {
		const b = await getBuild(id);
		if (!b) return;
		await putBuild({ ...b, id: newId(), name: `${b.name} (copy)`, updatedAt: Date.now() });
		this.saved = await listBuilds();
	}

	async exportCode(): Promise<string> {
		const { code } = await this.engine.call<{ code: string }>("save_build_code");
		return code;
	}

	closeBuild() {
		this.screen = "builds";
	}
}

function xmlName(xml: string): string | null {
	return /<Build [^>]*\bbuildName="([^"]+)"/.exec(xml)?.[1] ?? null;
}

export const app = new App();
