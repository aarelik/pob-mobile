<script lang="ts">
	// PoB's set dropdowns (passive tree, skill, item and config sets) as a chip
	// that opens a sheet: switch, add, copy, rename and delete.
	import Icon from "./Icon.svelte";
	import Sheet from "./Sheet.svelte";
	import { app } from "../lib/app.svelte";
	import { stripPobText } from "../lib/pobtext";

	type Kind = "spec" | "skill" | "item" | "config";
	let { kind, label }: { kind: Kind; label?: string } = $props();

	interface Entry {
		key: number;
		title: string;
		active: boolean;
		sub?: string;
	}
	const NAMES: Record<Kind, string> = { spec: "Passive tree", skill: "Skill set", item: "Item set", config: "Config set" };
	const M = $derived({
		spec: { list: "list_specs", select: "select_spec", create: "create_spec", rename: "rename_spec", copy: "copy_spec", del: "delete_spec", key: "index" },
		skill: { list: "get_skills", select: "select_skill_set", create: "create_skill_set", rename: "rename_skill_set", copy: "copy_skill_set", del: "delete_skill_set", key: "id" },
		item: { list: "list_item_sets", select: "select_item_set", create: "create_item_set", rename: "rename_item_set", copy: "copy_item_set", del: "delete_item_set", key: "id" },
		config: { list: "get_config", select: "select_config_set", create: "create_config_set", rename: "rename_config_set", copy: "copy_config_set", del: "delete_config_set", key: "id" },
	}[kind]);

	let sets = $state<Entry[]>([]);
	let open = $state(false);
	const active = $derived(sets.find((s) => s.active));

	$effect(() => {
		void app.rev;
		load();
	});
	async function load() {
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const r = await app.call<any>(M.list).catch(() => null);
		if (!r) return;
		if (kind === "spec") sets = r.specs.map((s: { index: number; title: string; active: boolean; treeVersion: string; allocatedNodeCount: number }) => ({ key: s.index, title: s.title || "Default", active: s.active, sub: `${s.treeVersion.replace("_", ".")} · ${s.allocatedNodeCount} nodes` }));
		else if (kind === "skill") sets = r.skillSets.map((s: { id: number; title: string | null; active: boolean }) => ({ key: s.id, title: s.title || "Default", active: !!s.active }));
		else if (kind === "item") sets = r.itemSets.map((s: { id: number; title: string | null; active: boolean }) => ({ key: s.id, title: s.title || "Default", active: !!s.active }));
		else sets = r.sets.map((s: { id: number; title: string | null; active: boolean }) => ({ key: s.id, title: s.title || "Default", active: !!s.active }));
	}
	const p = (key: number, extra: Record<string, unknown> = {}) => ({ [M.key]: key, ...extra });
	async function pick(e: Entry) {
		if (!e.active) await app.mutate(M.select, p(e.key));
		open = false;
	}
	async function create() {
		const title = prompt(`Name the new ${NAMES[kind].toLowerCase()}`, "New set");
		if (title == null) return;
		await app.mutate(M.create, { title });
	}
	async function copy(e: Entry) {
		await app.mutate(M.copy, p(e.key, { title: `${e.title} (copy)` }));
	}
	async function rename(e: Entry) {
		const title = prompt("Rename", e.title);
		if (title == null || title === e.title) return;
		await app.mutate(M.rename, p(e.key, { title }));
	}
	async function del(e: Entry) {
		if (sets.length < 2) return app.notify("A build needs at least one set.", "error");
		if (!confirm(`Delete "${e.title}"?`)) return;
		await app.mutate(M.del, p(e.key));
	}
</script>

<button class="chip setchip" onclick={() => (open = true)} aria-label={`${NAMES[kind]}: ${active?.title ?? ""}`}>
	{#if label !== ""}<span class="k">{label ?? NAMES[kind]}</span>{/if}
	<span class="v">{stripPobText(active?.title ?? "Default")}</span>
	{#if sets.length > 1}<span class="n num">{sets.length}</span>{/if}
</button>

<Sheet bind:open title={`${NAMES[kind]}s`}>
	<div class="list">
		{#each sets as e (e.key)}
			<div class="set" class:on={e.active}>
				<button class="rowbtn" onclick={() => pick(e)}>
					<span class="radio" class:on={e.active}></span>
					<span class="grow">
						<span class="t">{stripPobText(e.title)}</span>
						{#if e.sub}<span class="muted sub">{e.sub}</span>{/if}
					</span>
				</button>
				<button class="icon-btn" aria-label="Rename" onclick={() => rename(e)}><Icon name="edit" size={18} /></button>
				<button class="icon-btn" aria-label="Copy" onclick={() => copy(e)}><Icon name="copy" size={18} /></button>
				<button class="icon-btn" aria-label="Delete" onclick={() => del(e)}><Icon name="trash" size={18} /></button>
			</div>
		{/each}
	</div>
	<button class="btn block" style="margin-top:12px" onclick={create}><Icon name="plus" size={18} /> New {NAMES[kind].toLowerCase()}</button>
</Sheet>

<style>
	.setchip {
		max-width: 100%;
	}
	.k {
		color: var(--fg-3);
		font-size: 12px;
	}
	.v {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: var(--fg-0);
	}
	.n {
		font-size: 11px;
		color: var(--fg-3);
	}
	.set {
		display: flex;
		align-items: center;
	}
	.set + .set {
		border-top: 1px solid var(--line-0);
	}
	.set .rowbtn {
		flex: 1;
		min-width: 0;
	}
	.t {
		display: block;
	}
	.sub {
		display: block;
		font-size: 12px;
	}
	.radio {
		width: 18px;
		height: 18px;
		border-radius: 50%;
		border: 1.5px solid var(--line-2);
		flex: none;
	}
	.radio.on {
		border: 5px solid var(--fg-0);
	}
</style>
