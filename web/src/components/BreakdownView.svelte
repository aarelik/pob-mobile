<script lang="ts">
	// PoB's stat breakdown popup: text lines and modifier tables. Tables become
	// stacked rows on a phone: value first, then where it comes from.
	import type { Breakdown } from "../engine/types";
	import PobText from "./PobText.svelte";
	let { breakdown }: { breakdown: Breakdown } = $props();
</script>

{#each breakdown.sections as s, i (i)}
	{#if s.type === "text"}
		<div class="text">
			{#each s.lines as line, j (j)}<div class="num"><PobText text={line} /></div>{/each}
		</div>
	{:else if s.type === "table"}
		<section>
			{#if s.label}<h3 class="eyebrow">{s.label}</h3>{/if}
			<div class="list card">
				{#each s.rows as row, j (j)}
					<div class="row">
						<span class="val num">{row.displayValue ?? row[s.cols[0]?.key] ?? ""}</span>
						<div class="what">
							<div><PobText text={row.sourceName || row.source || row.name || ""} /></div>
							{#if (row.sourceName && row.source) || row.flags || row.tags || row.name}
								<div class="sub">
									{[row.sourceName ? row.source : null, row.name && (row.sourceName || row.source) ? row.name : null, row.flags, row.tags].filter(Boolean).join(" · ")}
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
			{#if s.footer}<div class="footer"><PobText text={s.footer} /></div>{/if}
		</section>
	{/if}
{/each}

<style>
	.text {
		background: var(--bg-0);
		border: 1px solid var(--line-0);
		border-radius: var(--radius);
		padding: 10px 12px;
		margin-bottom: 14px;
		font-size: 13px;
		line-height: 1.6;
	}
	section {
		margin-bottom: 16px;
	}
	h3 {
		margin: 0 0 6px;
	}
	.row {
		display: flex;
		gap: 12px;
		padding: 9px 12px;
		align-items: baseline;
	}
	.val {
		min-width: 64px;
		text-align: right;
		font-weight: 600;
		flex: none;
	}
	.what {
		min-width: 0;
		font-size: 14px;
	}
	.sub {
		font-size: 12px;
		color: var(--fg-3);
		margin-top: 1px;
	}
	.footer {
		font-size: 13px;
		margin-top: 6px;
		color: var(--fg-2);
	}
</style>
