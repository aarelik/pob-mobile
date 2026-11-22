<script lang="ts">
	import Sheet from "../components/Sheet.svelte";
	import TooltipView from "../components/TooltipView.svelte";
	import type { Slot, Tooltip } from "../engine/types";
	import { app } from "../lib/app.svelte";

	const RARITY: Record<string, string> = {
		UNIQUE: "var(--c-unique)",
		RELIC: "var(--c-gem)",
		RARE: "var(--c-rare)",
		MAGIC: "var(--c-magic)",
		NORMAL: "var(--c-normal)",
	};

	let slots = $state<Slot[]>([]);
	let open = $state(false);
	let sel = $state<Slot | null>(null);
	let tooltip = $state<Tooltip | null>(null);

	$effect(() => {
		void app.rev;
		app.call<{ slots: Slot[] }>("list_slots").then((r) => (slots = r.slots)).catch((e) => app.notify(e.message, "error"));
	});

	// Gear first, then flasks, then tree jewels; hide empty sockets nobody can fill.
	const visible = $derived(slots.filter((s) => s.shown && !(s.inactive && !s.itemId) && (s.itemId > 0 || !s.slot.includes("Abyssal"))));
	const gear = $derived(visible.filter((s) => !s.slot.startsWith("Flask") && !s.nodeId));
	const flasks = $derived(visible.filter((s) => s.slot.startsWith("Flask")));
	const jewels = $derived(visible.filter((s) => s.nodeId && s.itemId > 0));

	async function show(s: Slot) {
		if (!s.itemId) return;
		sel = s;
		tooltip = null;
		open = true;
		tooltip = await app.call<Tooltip>("item_tooltip", { itemId: s.itemId, slotName: s.slot }).catch((e) => {
			app.notify(e.message, "error");
			return null;
		});
	}
</script>

{#snippet slotList(list: Slot[])}
	<div class="list card">
		{#each list as s (s.slot)}
			<button class="slot" class:empty={!s.itemId} onclick={() => show(s)} disabled={!s.itemId}>
				<span class="label">{s.label || s.slot}</span>
				{#if s.itemId}
					{@const parts = (s.itemName ?? "").split(", ")}
					<span class="item" style:color={RARITY[s.itemRarity ?? ""] ?? null}>
						<span class="iname">{parts[0]}</span>
						{#if parts[1]}<span class="base">{parts.slice(1).join(", ")}</span>{/if}
					</span>
				{:else}
					<span class="item muted">Empty</span>
				{/if}
			</button>
		{/each}
	</div>
{/snippet}

<div class="page">
	<h2 class="eyebrow">Equipment</h2>
	{@render slotList(gear)}
	{#if flasks.length}
		<h2 class="eyebrow">Flasks</h2>
		{@render slotList(flasks)}
	{/if}
	{#if jewels.length}
		<h2 class="eyebrow">Tree jewels</h2>
		{@render slotList(jewels)}
	{/if}
</div>

<Sheet bind:open title={sel?.label ?? sel?.slot ?? ""}>
	{#if tooltip}<TooltipView {tooltip} />{:else}<p class="muted">Loading…</p>{/if}
</Sheet>

<style>
	.page {
		padding: 6px 14px 28px;
	}
	h2 {
		margin: 16px 2px 6px;
	}
	.slot {
		display: grid;
		grid-template-columns: 92px 1fr;
		gap: 10px;
		align-items: center;
		width: 100%;
		min-height: 52px;
		padding: 8px 14px;
		background: none;
		border: 0;
		text-align: left;
	}
	.slot:not(:disabled):active {
		background: var(--bg-hover);
	}
	.label {
		font-size: 12px;
		color: var(--fg-3);
	}
	.item {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.iname {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.base {
		font-size: 12px;
		opacity: 0.75;
	}
	.slot.empty .item {
		font-size: 13px;
	}
</style>
