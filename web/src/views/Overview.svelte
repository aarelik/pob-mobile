<script lang="ts">
	import Icon from "../components/Icon.svelte";
	import PobText from "../components/PobText.svelte";
	import Sheet from "../components/Sheet.svelte";
	import type { BuildSummary, ClassInfo, Sidebar, Skills } from "../engine/types";
	import { app } from "../lib/app.svelte";
	import { fmt1, fmtBig, fmtInt, fmtPct } from "../lib/format";
	import { stripPobText } from "../lib/pobtext";

	const FIELDS = [
		"FullDPS", "CombinedDPS", "TotalDPS", "TotalDot", "WithBleedDPS", "WithIgniteDPS", "WithPoisonDPS", "AverageHit", "Speed", "CritChance", "CritMultiplier", "HitChance",
		"Life", "LifeUnreserved", "EnergyShield", "Mana", "ManaUnreserved", "Ward", "TotalEHP",
		"FireResist", "ColdResist", "LightningResist", "ChaosResist", "FireResistOverCap", "ColdResistOverCap", "LightningResistOverCap", "ChaosResistOverCap",
		"PhysicalMaximumHitTaken", "FireMaximumHitTaken", "ColdMaximumHitTaken", "LightningMaximumHitTaken", "ChaosMaximumHitTaken",
		"Armour", "Evasion", "MeleeEvadeChance", "EffectiveBlockChance", "EffectiveSpellBlockChance", "EffectiveSpellSuppressionChance",
		"LifeRegenRecovery", "EffectiveMovementSpeedMod", "Str", "Dex", "Int",
	];

	let s = $state<Record<string, number>>({});
	let summary = $state<BuildSummary | null>(null);
	let skills = $state<Skills | null>(null);
	let warnings = $state<string[]>([]);
	let skillOpen = $state(false);
	let classOpen = $state(false);
	let levelOpen = $state(false);
	let classes = $state<ClassInfo[]>([]);
	let level = $state(1);

	$effect(() => {
		void app.rev;
		Promise.all([
			app.call<{ stats: Record<string, number> }>("get_stats", { fields: FIELDS }),
			app.call<BuildSummary>("build_summary"),
			app.call<Skills>("get_skills"),
			app.call<Sidebar>("get_sidebar"),
		])
			.then(([st, sum, sk, side]) => {
				s = st.stats;
				summary = sum;
				skills = sk;
				warnings = side.warnings;
			})
			.catch((e) => app.notify(String(e.message ?? e), "error"));
	});

	const mainGroup = $derived(skills?.socketGroups.find((g) => g.isMainSkill) ?? null);
	const choices = $derived(skills?.socketGroups.filter((g) => g.enabled && g.skills.length > 0) ?? []);
	const dps = $derived((s.FullDPS ?? 0) > 0 ? { label: "Full DPS", v: s.FullDPS } : { label: "Combined DPS", v: s.CombinedDPS });
	const b = $derived(app.build!);

	async function pickSkill(index: number, active?: number) {
		skillOpen = false;
		await app.mutate("set_main_skill", { index });
		if (active) await app.mutate("set_socket_group", { index, mainActiveSkill: active });
	}
	async function openClasses() {
		classOpen = true;
		classes = (await app.call<{ classes: ClassInfo[] }>("list_classes")).classes;
	}
	async function pickClass(classId: number, ascendClassId: number) {
		classOpen = false;
		await app.mutate("select_class", { classId, ascendClassId });
	}
	async function saveLevel() {
		levelOpen = false;
		await app.mutate("set_level", { level });
	}

	const resists = $derived([
		{ k: "Fire", c: "var(--c-fire)" },
		{ k: "Cold", c: "var(--c-cold)" },
		{ k: "Lightning", c: "var(--c-lightning)" },
		{ k: "Chaos", c: "var(--c-chaos)" },
	]);
</script>

<div class="page">
	<section class="hero card">
		<button class="who" onclick={openClasses}>
			<span class="eyebrow">{b.className}</span>
			<span class="asc fontin">{b.ascendClassName || "No ascendancy"}</span>
			{#if b.secondaryAscendClassName}<span class="muted small">+ {b.secondaryAscendClassName}</span>{/if}
		</button>
		<div class="facts">
			<button class="fact" onclick={() => ((level = b.level), (levelOpen = true))}>
				<span class="eyebrow">Level</span><span class="num big">{b.level}</span>
			</button>
			<div class="fact">
				<span class="eyebrow">Points</span><span class="num big" class:over={b.points.used > b.points.max}>{b.points.used}<span class="muted">/{b.points.max}</span></span>
			</div>
			<div class="fact">
				<span class="eyebrow">Asc.</span><span class="num big">{b.points.ascUsed}<span class="muted">/{b.points.ascMax}</span></span>
			</div>
		</div>
	</section>

	<button class="skill card" onclick={() => (skillOpen = true)}>
		<span class="eyebrow">Main skill</span>
		<span class="skill-name">{mainGroup ? (mainGroup.skills.find((x) => x.index === mainGroup.mainActiveSkill)?.name ?? mainGroup.displayLabel) : "None"}</span>
		<span class="muted small">{mainGroup?.slot ? `${mainGroup.slot} · ` : ""}{summary ? `${summary.mainSkillSupports ?? 0} supports` : ""}</span>
		<span class="chev"><Icon name="chevron" /></span>
	</button>

	{#if warnings.length}
		<div class="warn card">
			{#each warnings as w, i (i)}<div><Icon name="warn" size={16} /> <PobText text={w} /></div>{/each}
		</div>
	{/if}

	<h2 class="eyebrow">Offence</h2>
	<div class="grid">
		<div class="stat card wide"><span class="label">{dps.label}</span><span class="num v dps">{fmtBig(dps.v)}</span></div>
		<div class="stat card"><span class="label">Hit DPS</span><span class="num v">{fmtBig(s.TotalDPS)}</span></div>
		{#if (s.TotalDot ?? 0) > 0}<div class="stat card"><span class="label">DoT DPS</span><span class="num v">{fmtBig(s.TotalDot)}</span></div>{/if}
		<div class="stat card"><span class="label">Average hit</span><span class="num v">{fmtBig(s.AverageHit)}</span></div>
		<div class="stat card"><span class="label">Speed</span><span class="num v">{fmt1(s.Speed)}<small>/s</small></span></div>
		<div class="stat card"><span class="label">Crit</span><span class="num v">{fmtPct(s.CritChance)}</span></div>
		<div class="stat card"><span class="label">Crit multi</span><span class="num v">{fmtPct((s.CritMultiplier ?? 0) * 100)}</span></div>
		<div class="stat card"><span class="label">Hit chance</span><span class="num v">{fmtPct(s.HitChance)}</span></div>
	</div>

	<h2 class="eyebrow">Defence</h2>
	<div class="grid">
		<div class="stat card"><span class="label">Life</span><span class="num v life">{fmtInt(s.Life)}</span>{#if s.LifeUnreserved !== s.Life}<span class="sub num">{fmtInt(s.LifeUnreserved)} unreserved</span>{/if}</div>
		<div class="stat card"><span class="label">Energy shield</span><span class="num v es">{fmtInt(s.EnergyShield)}</span></div>
		<div class="stat card"><span class="label">Mana</span><span class="num v mana">{fmtInt(s.Mana)}</span><span class="sub num">{fmtInt(s.ManaUnreserved)} unreserved</span></div>
		<div class="stat card"><span class="label">Effective HP</span><span class="num v">{fmtBig(s.TotalEHP)}</span></div>
		<div class="stat card"><span class="label">Armour</span><span class="num v">{fmtInt(s.Armour)}</span></div>
		<div class="stat card"><span class="label">Evasion</span><span class="num v">{fmtInt(s.Evasion)}</span></div>
		<div class="stat card"><span class="label">Block / Spell</span><span class="num v">{fmtPct(s.EffectiveBlockChance)} <small>/ {fmtPct(s.EffectiveSpellBlockChance)}</small></span></div>
		<div class="stat card"><span class="label">Suppression</span><span class="num v">{fmtPct(s.EffectiveSpellSuppressionChance)}</span></div>
	</div>

	<div class="res card">
		{#each resists as r (r.k)}
			{@const v = s[`${r.k}Resist`]}
			{@const over = s[`${r.k}ResistOverCap`]}
			<div class="r">
				<span class="label" style:color={r.c}>{r.k}</span>
				<span class="num v" class:low={r.k !== "Chaos" ? (v ?? 0) < 75 : (v ?? 0) < 0}>{fmtInt(v)}%</span>
				{#if over}<span class="sub num">+{fmtInt(over)} over</span>{/if}
				<span class="sub num">max hit {fmtBig(s[`${r.k}MaximumHitTaken`])}</span>
			</div>
		{/each}
	</div>
	<div class="grid">
		<div class="stat card"><span class="label">Physical max hit</span><span class="num v">{fmtBig(s.PhysicalMaximumHitTaken)}</span></div>
		<div class="stat card"><span class="label">Movement speed</span><span class="num v">{fmtPct(((s.EffectiveMovementSpeedMod ?? 1) - 1) * 100)}</span></div>
	</div>

	<h2 class="eyebrow">Attributes</h2>
	<div class="attrs card">
		{#each [["Str", "var(--c-str)"], ["Dex", "var(--c-dex)"], ["Int", "var(--c-int)"]] as [k, c] (k)}
			{@const req = summary?.requirements?.[k.toLowerCase()]}
			<div class="a">
				<span class="label" style:color={c}>{k}</span>
				<span class="num v">{fmtInt(s[k])}</span>
				{#if req}<span class="sub" class:bad={!req.met}>needs {req.need}</span>{/if}
			</div>
		{/each}
	</div>

	<button class="notes card" onclick={() => (app.tab = "notes")}>
		<Icon name="notes" size={20} /><span>Build notes</span><span class="chev2"><Icon name="chevron" size={18} /></span>
	</button>

	{#if summary?.keystones?.length}
		<h2 class="eyebrow">Keystones</h2>
		<div class="chips">{#each summary.keystones as k (k)}<span class="chip">{k}</span>{/each}</div>
	{/if}
</div>

<Sheet bind:open={skillOpen} title="Main skill">
	<div class="list card">
		{#each choices as g (g.index)}
			{#each g.skills as sk (sk.index)}
				<button class="opt" class:sel={g.isMainSkill && g.mainActiveSkill === sk.index} onclick={() => pickSkill(g.index, g.skills.length > 1 ? sk.index : undefined)}>
					<span>{sk.name}</span>
					<span class="muted small">{g.slot ?? stripPobText(g.grantedBy?.item ?? g.grantedBy?.node ?? "")}</span>
				</button>
			{/each}
		{/each}
	</div>
</Sheet>

<Sheet bind:open={classOpen} title="Class and ascendancy">
	{#each classes as c (c.id)}
		<h3 class="eyebrow cls">{c.name}</h3>
		<div class="chips">
			<button class="chip btnchip" class:sel={b.classId === c.id && !b.ascendClassId} onclick={() => pickClass(c.id, 0)}>{c.name}</button>
			{#each c.ascendancies as a (a.id)}
				<button class="chip btnchip" class:sel={b.classId === c.id && b.ascendClassId === a.id} onclick={() => pickClass(c.id, a.id)}>{a.name}</button>
			{/each}
		</div>
	{/each}
	<p class="muted small">Changing class keeps the tree only where it still connects, as in Path of Building.</p>
</Sheet>

<Sheet bind:open={levelOpen} title="Character level">
	<div class="lvl">
		<button class="btn" onclick={() => (level = Math.max(1, level - 1))}>−</button>
		<input class="field num" type="number" inputmode="numeric" min="1" max="100" bind:value={level} />
		<button class="btn" onclick={() => (level = Math.min(100, level + 1))}>+</button>
	</div>
	<input type="range" min="1" max="100" bind:value={level} style="width:100%;margin:14px 0" />
	<button class="btn primary block" onclick={saveLevel}>Set level {level}</button>
</Sheet>

<style>
	.page {
		padding: 14px 14px 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	h2 {
		margin: 12px 2px 0;
	}
	.small {
		font-size: 13px;
	}
	.hero {
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 14px;
	}
	.who {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		background: none;
		border: 0;
		padding: 0;
		text-align: left;
	}
	.asc {
		font-size: 24px;
		font-weight: 600;
		color: var(--c-unique);
	}
	.facts {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}
	.fact {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		background: var(--bg-2);
		border: 1px solid var(--line-0);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
	}
	button.fact:active {
		background: var(--bg-active);
	}
	.big {
		font-size: 19px;
		font-weight: 600;
	}
	.over {
		color: var(--bad);
	}
	.skill {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		padding: 12px 44px 12px 14px;
		text-align: left;
	}
	.skill:active {
		background: var(--bg-hover);
	}
	.skill-name {
		font-size: 18px;
		font-weight: 600;
		color: var(--c-gem);
	}
	.chev {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
		color: var(--fg-3);
	}
	.warn {
		padding: 10px 12px;
		border-color: color-mix(in oklch, var(--warn) 40%, var(--line-0));
		color: var(--warn);
		font-size: 13px;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 8px;
	}
	@media (min-width: 560px) {
		.grid {
			grid-template-columns: repeat(4, 1fr);
		}
	}
	.stat {
		display: flex;
		flex-direction: column;
		padding: 10px 12px;
		min-width: 0;
	}
	.stat.wide {
		grid-column: 1 / -1;
	}
	.label {
		font-size: 12px;
		color: var(--fg-2);
	}
	.v {
		font-size: 19px;
		font-weight: 600;
	}
	.wide .v {
		font-size: 30px;
	}
	.v small {
		font-size: 13px;
		color: var(--fg-2);
		font-weight: 500;
	}
	.sub {
		font-size: 11px;
		color: var(--fg-3);
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
	.mana {
		color: var(--c-mana);
	}
	.res,
	.attrs {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
	}
	.attrs {
		grid-template-columns: repeat(3, 1fr);
	}
	.r,
	.a {
		display: flex;
		flex-direction: column;
		padding: 10px 10px;
		min-width: 0;
	}
	.r + .r,
	.a + .a {
		border-left: 1px solid var(--line-0);
	}
	.low,
	.bad {
		color: var(--bad);
	}
	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.chip {
		padding: 6px 10px;
		border-radius: 16px;
		border: 1px solid var(--line-1);
		background: var(--bg-1);
		font-size: 13px;
	}
	.btnchip {
		min-height: 38px;
	}
	.chip.sel {
		background: var(--fg-0);
		color: var(--bg-0);
		border-color: var(--fg-0);
	}
	.cls {
		margin: 14px 0 6px;
	}
	.opt {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		padding: 11px 14px;
		background: none;
		border: 0;
		text-align: left;
		width: 100%;
	}
	.opt.sel {
		box-shadow: inset 3px 0 0 var(--c-gem);
		background: var(--bg-2);
	}
	.opt:active {
		background: var(--bg-hover);
	}
	.notes {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 50px;
		padding: 0 14px;
		margin-top: 8px;
		color: var(--fg-1);
		text-align: left;
	}
	.notes:active {
		background: var(--bg-hover);
	}
	.chev2 {
		margin-left: auto;
		color: var(--fg-3);
	}
	.lvl {
		display: grid;
		grid-template-columns: 56px 1fr 56px;
		gap: 8px;
	}
	.lvl input {
		text-align: center;
		font-size: 20px;
	}
</style>
