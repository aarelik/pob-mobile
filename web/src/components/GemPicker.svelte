<script lang="ts">
	// PoB's gem name box as a searchable list: supports that fit the group's
	// skill first, optionally ranked by what each would add to the build's DPS.
	import Icon from "./Icon.svelte";
	import Sheet from "./Sheet.svelte";
	import TooltipView from "./TooltipView.svelte";
	import { app } from "../lib/app.svelte";
	import { fmtBig } from "../lib/format";
	import type { Tooltip } from "../engine/types";

	interface Row {
		gemId: string;
		name: string;
		support: boolean;
		valid: boolean;
		color: string;
		tags: string | null;
		dpsDiff?: number;
	}
	let {
		open = $bindable(false),
		groupIndex,
		title = "Add gem",
		onpick,
	}: { open?: boolean; groupIndex: number | null; title?: string; onpick: (gemId: string) => void } = $props();

	let q = $state("");
	let kind = $state<"all" | "active" | "support">("all");
	let byDps = $state(false);
	let rows = $state<Row[]>([]);
	let loading = $state(false);
	let preview = $state<{ row: Row; tip: Tooltip | null } | null>(null);
	let seq = 0;
	let wasOpen = false;
	$effect(() => {
		if (open && !wasOpen) {
			q = "";
			kind = "all";
			byDps = false;
			preview = null;
			rows = [];
		}
		wasOpen = open;
	});

	$effect(() => {
		if (!open) return;
		void q;
		void kind;
		void byDps;
		const my = ++seq;
		const t = setTimeout(async () => {
			loading = true;
			const r = await app
				.call<{ gems: Row[] }>("gem_search", {
					query: q.trim(),
					groupIndex,
					limit: 80,
					onlySupports: kind === "all" ? undefined : kind === "support",
					sortByDps: byDps,
				})
				.catch(() => ({ gems: [] }));
			if (my === seq) {
				rows = r.gems;
				loading = false;
			}
		}, 160);
		return () => clearTimeout(t);
	});
	function colour(c: string) {
		const m = /\^x([0-9a-fA-F]{6})/.exec(c);
		return m ? `#${m[1]}` : "var(--fg-2)";
	}
	async function showTip(row: Row) {
		preview = { row, tip: null };
		const tip = await app.call<Tooltip>("gem_tooltip", { gemId: row.gemId }).catch(() => null);
		if (preview?.row === row) preview = { row, tip };
	}
	function choose(row: Row) {
		preview = null;
		open = false;
		onpick(row.gemId);
	}
</script>

<Sheet bind:open {title}>
	<input class="field" type="search" placeholder="Gem name or tag" bind:value={q} autocomplete="off" />
	<div class="chips filters">
		<button class="chip" class:on={kind === "all"} onclick={() => (kind = "all")}>All</button>
		<button class="chip" class:on={kind === "active"} onclick={() => (kind = "active")}>Skills</button>
		<button class="chip" class:on={kind === "support"} onclick={() => (kind = "support")}>Supports</button>
		{#if groupIndex != null}
			<button class="chip" class:on={byDps} onclick={() => (byDps = !byDps)}>Sort by DPS</button>
		{/if}
	</div>
	{#if preview}
		<div class="preview card">
			<div class="ph">
				<b style:color={colour(preview.row.color)}>{preview.row.name}</b>
				<button class="icon-btn" aria-label="Close preview" onclick={() => (preview = null)}><Icon name="close" size={18} /></button>
			</div>
			{#if preview.tip}<TooltipView tooltip={preview.tip} />{:else}<p class="muted">Loading…</p>{/if}
			<button class="btn primary block" onclick={() => choose(preview!.row)}>Use {preview.row.name}</button>
		</div>
	{/if}
	<div class="results" class:loading>
		{#each rows as r (r.gemId)}
			<div class="res" class:invalid={!r.valid}>
				<button class="rowbtn" onclick={() => choose(r)}>
					<span class="dot" style:background={colour(r.color)}></span>
					<span class="grow">
						<span class="nm">{r.name}</span>
						{#if r.tags}<span class="tags">{r.tags}</span>{/if}
					</span>
					{#if r.dpsDiff != null}
						<span class="num dd" class:up={r.dpsDiff > 0} class:down={r.dpsDiff < 0}>{r.dpsDiff > 0 ? "+" : ""}{fmtBig(r.dpsDiff)}</span>
					{/if}
				</button>
				<button class="icon-btn" aria-label={`About ${r.name}`} onclick={() => showTip(r)}><Icon name="info" size={18} /></button>
			</div>
		{/each}
		{#if !rows.length && !loading}<p class="muted">No gems match.</p>{/if}
	</div>
</Sheet>

<style>
	.filters {
		margin: 10px 0;
	}
	.results.loading {
		opacity: 0.6;
	}
	.res {
		display: flex;
		align-items: center;
		border-top: 1px solid var(--line-0);
	}
	.res .rowbtn {
		flex: 1;
		min-width: 0;
	}
	.res.invalid {
		opacity: 0.45;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex: none;
	}
	.nm {
		display: block;
	}
	.tags {
		display: block;
		font-size: 11px;
		color: var(--fg-3);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.dd {
		font-size: 12px;
		color: var(--fg-2);
	}
	.dd.up {
		color: var(--ok);
	}
	.dd.down {
		color: var(--bad);
	}
	.preview {
		padding: 10px 12px;
		margin-bottom: 10px;
	}
	.ph {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
</style>
