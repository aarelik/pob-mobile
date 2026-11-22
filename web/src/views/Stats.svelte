<script lang="ts">
	// PoB's sidebar stat list, row for row with its colours; rows with a
	// breakdown open it in a sheet.
	import BreakdownView from "../components/BreakdownView.svelte";
	import CalcGrid from "../components/CalcGrid.svelte";
	import Compare from "../components/Compare.svelte";
	import Party from "../components/Party.svelte";
	import Icon from "../components/Icon.svelte";
	import PobText from "../components/PobText.svelte";
	import Sheet from "../components/Sheet.svelte";
	import type { Breakdown, Sidebar, SidebarRow } from "../engine/types";
	import { app } from "../lib/app.svelte";
	import { stripPobText } from "../lib/pobtext";

	let side = $state<Sidebar | null>(null);
	let seg = $state<"summary" | "calcs" | "compare" | "party">("summary");
	const SEGS = [
		["summary", "Summary"],
		["calcs", "Calculations"],
		["compare", "Compare"],
		["party", "Party"],
	] as const;
	let open = $state(false);
	let title = $state("");
	let breakdown = $state<Breakdown | null>(null);

	$effect(() => {
		void app.rev;
		app.call<Sidebar>("get_sidebar").then((r) => (side = r)).catch((e) => app.notify(e.message, "error"));
	});

	// Spacer rows (no text) split the list into PoB's groups.
	const groups = $derived.by(() => {
		const out: { row: SidebarRow; index: number }[][] = [[]];
		side?.rows.forEach((row, i) => {
			if (!row.lhs && !row.rhs) {
				if (out[out.length - 1].length) out.push([]);
			} else out[out.length - 1].push({ row, index: i + 1 });
		});
		return out.filter((g) => g.length);
	});

	async function show(row: SidebarRow, index: number) {
		if (!row.hasBreakdown) return;
		title = stripPobText(row.lhs).replace(/:$/, "");
		breakdown = null;
		open = true;
		breakdown = await app.call<Breakdown>("sidebar_breakdown", { rowIndex: index }).catch((e) => {
			app.notify(e.message, "error");
			return null;
		});
	}
</script>

<div class="page">
	<div class="seg">
		{#each SEGS as [id, label] (id)}<button class:on={seg === id} onclick={() => (seg = id)}>{label}</button>{/each}
	</div>
	{#if seg === "calcs"}
		<div><CalcGrid /></div>
	{:else if seg === "compare"}
		<div><Compare /></div>
	{:else if seg === "party"}
		<div><Party /></div>
	{:else}
	{#if side?.notCounted?.count}
		<div class="nc card">
			<Icon name="info" size={16} />
			<span>{side.notCounted.count} modifier{side.notCounted.count === 1 ? "" : "s"} on this build are not calculated by Path of Building.</span>
		</div>
	{/if}
	{#each groups as g, gi (gi)}
		<div class="list card">
			{#each g as { row, index } (index)}
				{#if row.lhs && !row.rhs}
					<div class="head"><PobText text={row.lhs} /></div>
				{:else}
					<button class="row" class:tap={row.hasBreakdown} onclick={() => show(row, index)} disabled={!row.hasBreakdown}>
						<span class="l"><PobText text={row.lhs} /></span>
						<span class="r num"><PobText text={row.rhs} /></span>
					</button>
				{/if}
			{/each}
		</div>
	{/each}
	{/if}
</div>

<Sheet bind:open {title}>
	{#if breakdown}<BreakdownView {breakdown} />{:else}<p class="muted">Loading…</p>{/if}
</Sheet>

<style>
	.page {
		padding: 12px 14px 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.seg {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 3px;
		padding: 3px;
		background: var(--bg-0);
		border: 1px solid var(--line-1);
		border-radius: var(--radius-sm);
	}
	.seg button {
		min-height: 34px;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--fg-2);
		font-size: 12.5px;
	}
	.seg button.on {
		background: var(--bg-3);
		color: var(--fg-0);
	}
	.nc {
		display: flex;
		gap: 8px;
		align-items: flex-start;
		padding: 10px 12px;
		font-size: 13px;
		color: var(--fg-2);
	}
	.head {
		padding: 8px 12px 4px;
		font-size: 12px;
		font-weight: 600;
		color: var(--fg-2);
	}
	.row {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		width: 100%;
		min-height: 36px;
		padding: 6px 12px;
		background: none;
		border: 0;
		text-align: left;
		font-size: 14px;
		color: var(--fg-0);
	}
	.row:disabled {
		opacity: 1;
		cursor: default;
	}
	.row.tap:active {
		background: var(--bg-hover);
	}
	.row.tap .l {
		text-decoration: underline dotted var(--fg-4);
		text-underline-offset: 3px;
	}
	.r {
		text-align: right;
		white-space: nowrap;
	}
</style>
