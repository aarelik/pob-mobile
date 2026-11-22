<script lang="ts">
	// PoB's Calcs tab: the skill and buff-mode selectors, then every section
	// of the calculation grid. Wide sections scroll sideways with the row
	// labels pinned; a tap on a value opens PoB's breakdown for it.
	import BreakdownView from "./BreakdownView.svelte";
	import PobText from "./PobText.svelte";
	import Sheet from "./Sheet.svelte";
	import type { Breakdown } from "../engine/types";
	import { app } from "../lib/app.svelte";
	import { stripPobText } from "../lib/pobtext";

	interface Cell {
		index: number;
		text: string;
		hasBreakdown: boolean;
	}
	interface Row {
		index: number;
		label: string | null;
		cells: Cell[];
	}
	interface Sub {
		index: number;
		label: string;
		extra: string | null;
		rows: Row[];
	}
	interface Section {
		index: number;
		id: string;
		colour: string | null;
		enabled: boolean;
		subSections: Sub[];
	}
	interface SkillState {
		group: number | null;
		groups: { index: number; label: string }[];
		activeSkill: number | null;
		activeSkills: { index: number; label: string }[];
		hasMinion: boolean;
	}

	let sections = $state<Section[]>([]);
	let skill = $state<SkillState | null>(null);
	let mode = $state("EFFECTIVE");
	let actor = $state<"player" | "minion">("player");
	let collapsed = $state<Record<string, boolean>>({});
	let open = $state(false);
	let title = $state("");
	let breakdown = $state<Breakdown | null>(null);

	$effect(() => {
		void app.rev;
		void actor;
		load();
	});
	async function load() {
		const [s, sk, m] = await Promise.all([
			app.call<{ sections: Section[] }>("calc_sections", { actor }),
			app.call<SkillState>("calc_skill"),
			app.call<{ mode: string }>("calc_mode"),
		]).catch((e) => (app.notify(e.message, "error"), [null, null, null] as const));
		if (!s) return;
		sections = s.sections.filter((x) => x.enabled && x.subSections.some((sub) => sub.rows.length));
		skill = sk;
		mode = m!.mode;
		if (!sk?.hasMinion && actor === "minion") actor = "player";
	}
	const MODES: Record<string, string> = { UNBUFFED: "Unbuffed", BUFFED: "Buffed", COMBAT: "In combat", EFFECTIVE: "Effective DPS" };
	const val = (e: Event) => Number((e.currentTarget as HTMLSelectElement).value);

	// A row whose cells are all labels ("Physical:", "Fire:") heads the columns below it.
	const isHeader = (r: Row) => !r.label && r.cells.length > 1 && r.cells.every((c) => !c.hasBreakdown && /:\s*$/.test(stripPobText(c.text)));
	const cols = (sub: Sub) => Math.max(1, ...sub.rows.map((r) => r.cells.length));

	async function cell(sec: Section, sub: Sub, row: Row, c: Cell) {
		if (!c.hasBreakdown) return;
		title = `${stripPobText(row.label ?? sub.label)}${sub.rows.find(isHeader) ? ` · ${stripPobText(sub.rows.find(isHeader)!.cells[c.index - 1]?.text ?? "").replace(/:$/, "")}` : ""}`;
		breakdown = null;
		open = true;
		breakdown = await app
			.call<Breakdown>("calc_cell_breakdown", { section: sec.index, sub: sub.index, row: row.index, col: c.index, actor })
			.catch((e) => (app.notify(e.message, "error"), null));
	}
</script>

<div class="controls">
	{#if skill}
		<select class="field" value={skill.group ?? ""} onchange={(e) => app.mutate("calc_skill", { group: val(e) })} aria-label="Socket group">
			{#each skill.groups as g (g.index)}<option value={g.index}>{stripPobText(g.label)}</option>{/each}
		</select>
		{#if skill.activeSkills.length > 1}
			<select class="field" value={skill.activeSkill ?? ""} onchange={(e) => app.mutate("calc_skill", { activeSkill: val(e) })} aria-label="Active skill">
				{#each skill.activeSkills as s (s.index)}<option value={s.index}>{stripPobText(s.label)}</option>{/each}
			</select>
		{/if}
	{/if}
	<div class="chips">
		{#each Object.keys(MODES) as m (m)}
			<button class="chip" class:on={mode === m} onclick={() => app.mutate("calc_mode", { mode: m })}>{MODES[m]}</button>
		{/each}
		{#if skill?.hasMinion}
			<button class="chip" class:on={actor === "minion"} onclick={() => (actor = actor === "minion" ? "player" : "minion")}>Minion</button>
		{/if}
	</div>
</div>

{#each sections as sec (sec.index)}
	{#each sec.subSections.filter((s) => s.rows.length) as sub (sub.index)}
		{@const key = `${sec.id}:${sub.index}`}
		{@const header = sub.rows.find(isHeader)}
		{@const n = cols(sub)}
		<section class="card sec" style:--sec={sec.colour ?? "var(--line-2)"}>
			<button class="title" onclick={() => (collapsed = { ...collapsed, [key]: !collapsed[key] })}>
				<span><PobText text={sub.label || sec.id} /></span>
				{#if sub.extra}<span class="extra"><PobText text={sub.extra} /></span>{/if}
				<span class="chev" class:shut={collapsed[key]}>›</span>
			</button>
			{#if !collapsed[key]}
				<div class="grid-wrap">
					<table class:wide={n > 2}>
						{#if header}
							<thead>
								<tr>
									<th></th>
									{#each header.cells as c (c.index)}<th><PobText text={c.text.replace(/:\s*$/, "")} /></th>{/each}
								</tr>
							</thead>
						{/if}
						<tbody>
							{#each sub.rows.filter((r) => r !== header) as r (r.index)}
								<tr>
									<th class="lbl"><PobText text={r.label ?? ""} /></th>
									{#each r.cells as c (c.index)}
										<td class="num" class:tap={c.hasBreakdown} onclick={() => cell(sec, sub, r, c)}><PobText text={c.text} /></td>
									{/each}
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</section>
	{/each}
{/each}

<Sheet bind:open {title}>
	{#if breakdown && breakdown.sections.length}<BreakdownView {breakdown} />{:else if breakdown}<p class="muted">Nothing adds to this value.</p>{:else}<p class="muted">Loading…</p>{/if}
</Sheet>

<style>
	.controls {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 12px;
	}
	.sec {
		margin-bottom: 10px;
		overflow: hidden;
		border-left: 3px solid var(--sec);
	}
	.title {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 40px;
		padding: 6px 12px;
		border: 0;
		background: none;
		text-align: left;
		font-weight: 600;
		font-size: 14px;
		color: var(--fg-0);
	}
	.extra {
		font-weight: 400;
		font-size: 12px;
		color: var(--fg-2);
		flex: 1;
		text-align: right;
	}
	.chev {
		transform: rotate(90deg);
		color: var(--fg-3);
		transition: transform 0.15s;
		margin-left: auto;
	}
	.extra + .chev {
		margin-left: 0;
	}
	.chev.shut {
		transform: none;
	}
	.grid-wrap {
		overflow-x: auto;
		border-top: 1px solid var(--line-0);
	}
	table {
		border-collapse: collapse;
		width: 100%;
		font-size: 13px;
	}
	th,
	td {
		padding: 6px 10px;
		text-align: right;
		white-space: nowrap;
		border-bottom: 1px solid var(--line-0);
	}
	thead th {
		font-size: 11px;
		font-weight: 600;
		color: var(--fg-2);
	}
	tr:last-child th,
	tr:last-child td {
		border-bottom: 0;
	}
	.lbl {
		text-align: left;
		font-weight: 400;
		color: var(--fg-2);
		position: sticky;
		left: 0;
		background: var(--bg-1);
		white-space: normal;
		min-width: 110px;
		max-width: 150px;
	}
	table:not(.wide) .lbl {
		max-width: none;
	}
	td.tap {
		cursor: pointer;
	}
	td.tap:active {
		background: var(--bg-hover);
	}
</style>
