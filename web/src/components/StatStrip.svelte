<script lang="ts">
	// Always-visible headline numbers, so a change on any tab shows its effect.
	import { app } from "../lib/app.svelte";
	import { fmtBig } from "../lib/format";

	type S = Record<string, number | null>;
	let stats = $state<S>({});
	let prev = $state<S>({});
	let delta = $state<S>({});
	let lastGen = -1;

	$effect(() => {
		void app.rev;
		const gen = app.build?.generation ?? -1;
		app.call<{ stats: S }>("get_stats", { fields: ["FullDPS", "CombinedDPS", "Life", "EnergyShield", "TotalEHP", "Mana"] })
			.then((r) => {
				const s = r.stats;
				if (gen === lastGen) {
					const d: S = {};
					for (const k of Object.keys(s)) {
						const a = prev[k], b = s[k];
						if (typeof a === "number" && typeof b === "number" && Math.abs(b - a) > 1e-6 * Math.max(1, Math.abs(a))) d[k] = b - a;
					}
					delta = d;
				} else delta = {};
				lastGen = gen;
				prev = s;
				stats = s;
			})
			.catch(() => {});
	});

	const dpsKey = $derived((stats.FullDPS ?? 0) > 0 ? "FullDPS" : "CombinedDPS");
	const cells = $derived([
		{ key: dpsKey, label: dpsKey === "FullDPS" ? "Full DPS" : "DPS", cls: "dps" },
		{ key: "Life", label: "Life", cls: "life" },
		{ key: "EnergyShield", label: "ES", cls: "es" },
		{ key: "TotalEHP", label: "EHP", cls: "ehp" },
	]);
</script>

<div class="strip">
	{#each cells as c (c.label)}
		<div class="cell">
			<span class="label">{c.label}</span>
			<span class="val num {c.cls}">{fmtBig(stats[c.key])}</span>
			{#if delta[c.key]}
				{@const d = delta[c.key]!}
				<span class="delta num" class:up={d > 0} class:down={d < 0}>{d > 0 ? "+" : "−"}{fmtBig(Math.abs(d))}</span>
			{/if}
		</div>
	{/each}
</div>

<style>
	.strip {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		border-top: 1px solid var(--line-0);
		border-bottom: 1px solid var(--line-0);
		background: var(--bg-1);
	}
	.cell {
		display: flex;
		flex-direction: column;
		padding: 6px 10px 7px;
		min-width: 0;
	}
	.cell + .cell {
		border-left: 1px solid var(--line-0);
	}
	.label {
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--fg-3);
	}
	.val {
		font-size: 16px;
		font-weight: 600;
	}
	.dps {
		color: var(--c-dps);
	}
	.life {
		color: var(--c-life);
	}
	.es {
		color: var(--c-es);
	}
	.delta {
		font-size: 11px;
	}
	.up {
		color: var(--ok);
	}
	.down {
		color: var(--bad);
	}
</style>
