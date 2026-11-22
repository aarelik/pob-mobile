<script lang="ts">
	// A PoB tooltip (item, gem): its lines with PoB's colours, centred as PoB centres them.
	import type { Tooltip } from "../engine/types";
	import PobText from "./PobText.svelte";
	let { tooltip }: { tooltip: Tooltip } = $props();
	// PoB's desktop hints ("Press Ctrl+D…") have no meaning on a phone.
	const lines = $derived(tooltip.lines.filter((l) => !/\b(Ctrl|Shift|Alt)\+|Tip: /.test(l.text ?? "")));
</script>

<div class="tt">
	{#each lines as l, i (i)}
		{#if l.sep}
			<hr />
		{:else if l.text}
			<div class="line" class:center={l.center} class:title={l.size >= 20} class:fontin={l.font === "FONTIN SC" && l.size >= 20}><PobText text={l.text} /></div>
		{/if}
	{/each}
</div>

<style>
	.tt {
		background: var(--bg-0);
		border: 1px solid var(--line-1);
		border-radius: var(--radius);
		padding: 12px 14px;
		font-size: 14px;
		line-height: 1.45;
	}
	.line.center {
		text-align: center;
	}
	.line.title {
		font-size: 17px;
		font-weight: 600;
	}
	hr {
		border: 0;
		border-top: 1px solid var(--line-1);
		margin: 8px 0;
	}
</style>
