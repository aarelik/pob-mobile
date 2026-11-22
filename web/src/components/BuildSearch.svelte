<script lang="ts">
	// One search across the open build: passives (PoB's tree search), items
	// and their mods, gems, config options and calculated stats. A result
	// opens the tab it belongs to, at the thing found.
	import PobText from "./PobText.svelte";
	import Sheet from "./Sheet.svelte";
	import type { ConfigOption, Sidebar, Skills } from "../engine/types";
	import { app } from "../lib/app.svelte";
	import { stripPobText } from "../lib/pobtext";

	let { open = $bindable(false) }: { open?: boolean } = $props();

	interface Hit {
		kind: "Passive" | "Item" | "Gem" | "Config" | "Stat";
		title: string;
		sub: string;
		go: () => void;
	}
	let q = $state("");
	let hits = $state<Hit[]>([]);
	let input = $state<HTMLInputElement | null>(null);
	let cache: { rev: number; items: { id: number; name: string; raw: string; equippedSlot: string | null }[]; skills: Skills; config: ConfigOption[]; side: Sidebar } | null = null;

	$effect(() => {
		if (open) setTimeout(() => input?.focus(), 250);
	});
	$effect(() => {
		void q;
		const t = setTimeout(run, 220);
		return () => clearTimeout(t);
	});

	async function data() {
		if (cache?.rev === app.rev) return cache;
		const [items, skills, config, side] = await Promise.all([
			app.call<{ items: { id: number; name: string; raw: string; equippedSlot: string | null }[] }>("get_items"),
			app.call<Skills>("get_skills"),
			app.call<{ options: ConfigOption[] }>("list_config_options"),
			app.call<Sidebar>("get_sidebar"),
		]);
		cache = { rev: app.rev, items: items.items, skills, config: config.options, side };
		return cache;
	}
	const has = (text: string | null | undefined, words: string[]) => {
		const t = stripPobText(text ?? "").toLowerCase();
		return words.every((w) => t.includes(w));
	};
	function go(tab: typeof app.tab, extra?: () => void) {
		open = false;
		app.tab = tab;
		extra?.();
	}

	async function run() {
		const query = q.trim();
		if (query.length < 2) {
			hits = [];
			return;
		}
		const words = query.toLowerCase().split(/\s+/);
		const d = await data().catch(() => null);
		const tree = await app.call<{ nodes: { id: number; name: string; stats: string[]; allocated: boolean; type: string }[] }>("search_tree", { query, limit: 12 }).catch(() => ({ nodes: [] }));
		const out: Hit[] = [];
		for (const n of tree.nodes) {
			const stat = n.stats.find((s) => has(s, words)) ?? n.stats[0] ?? "";
			out.push({ kind: "Passive", title: n.name, sub: `${n.allocated ? "Allocated · " : ""}${n.type === "Normal" ? "" : `${n.type} · `}${stat}`, go: () => go("tree", () => (app.focusNode = n.id)) });
		}
		if (d) {
			for (const it of d.items) {
				const line = it.raw.split("\n").find((l) => has(l, words));
				if (!line && !has(it.name, words)) continue;
				out.push({ kind: "Item", title: it.name, sub: `${it.equippedSlot ?? "Not equipped"}${line && !has(it.name, words) ? ` · ${line.replace(/\{[^}]*\}/g, "")}` : ""}`, go: () => go("items", () => it.equippedSlot && (app.openSlot = it.equippedSlot)) });
			}
			for (const g of d.skills.socketGroups) {
				for (const gem of g.gems) {
					if (!has(gem.name || gem.nameSpec, words)) continue;
					out.push({ kind: "Gem", title: gem.name || gem.nameSpec, sub: `${gem.level}/${gem.quality} in ${g.label || g.displayLabel}`, go: () => go("skills") });
				}
			}
			for (const o of d.config) {
				if (!has(o.label, words)) continue;
				out.push({ kind: "Config", title: stripPobText(o.label).replace(/:$/, ""), sub: o.section, go: () => go("config", () => (app.configQuery = stripPobText(o.label).replace(/:$/, ""))) });
			}
			for (const r of d.side.rows) {
				if (!r.lhs || !r.rhs || !has(r.lhs, words)) continue;
				out.push({ kind: "Stat", title: `${stripPobText(r.lhs)} ${stripPobText(r.rhs)}`, sub: "Calculated", go: () => go("stats") });
			}
		}
		hits = out.slice(0, 80);
	}
</script>

<Sheet bind:open title="Search this build">
	<input bind:this={input} class="field" type="search" placeholder="Passives, items, gems, options, stats" bind:value={q} autocomplete="off" />
	{#each hits as h, i (i)}
		<button class="rowbtn" onclick={h.go}>
			<span class="kind">{h.kind}</span>
			<span class="grow"><span class="t"><PobText text={h.title} /></span><span class="sub">{stripPobText(h.sub)}</span></span>
		</button>
	{:else}
		{#if q.trim().length >= 2}<p class="muted">Nothing found.</p>{/if}
	{/each}
</Sheet>

<style>
	.kind {
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--fg-3);
		width: 52px;
		flex: none;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.t {
		display: block;
		font-size: 14px;
	}
	.sub {
		display: block;
		font-size: 12px;
		color: var(--fg-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	input {
		margin-bottom: 8px;
	}
</style>
