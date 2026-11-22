<script lang="ts">
	// PoB's item crafting panel for one item in the build: affixes by tier and
	// roll, quality, item level, influence, sockets, variants, catalysts,
	// enchants, anoints, corruption and extra modifiers. Every change goes
	// through the engine's item_customize, so the item is always PoB's own.
	import Icon from "./Icon.svelte";
	import PobText from "./PobText.svelte";
	import Sheet from "./Sheet.svelte";
	import TooltipView from "./TooltipView.svelte";
	import type { Tooltip } from "../engine/types";
	import { app } from "../lib/app.svelte";

	interface Series {
		id: string;
		label: string;
		modIds: string[];
	}
	interface Tier {
		modId: string;
		tier: number;
		flipped: boolean;
		steps: { position: number; range: number; value: string }[];
	}
	interface AffixSlot {
		index: number;
		modId: string;
		range: number;
		label: string | null;
		value: string | null;
		options: Series[];
		rolls: { seriesId: string; tiers: Tier[] } | null;
	}
	interface Custom {
		raw: string;
		quality: number;
		canQuality: boolean;
		itemLevel: number;
		corrupted: boolean;
		affixes: { crafted: boolean; affixLimit?: number; prefixes: AffixSlot[]; suffixes: AffixSlot[] };
		variants: { names: string[]; picks: number[] };
		catalyst: { usable: boolean; names: string[]; catalyst: number; quality: number };
		modifiers: { section: string; index: number; text: string; disabled: boolean; range: number | null; parsed: boolean }[];
		shape: {
			canBeInfluenced: boolean;
			influences: { key: string; name: string; on: boolean }[];
			sockets: { colour: string; group: number }[];
			socketLimit: number;
			cluster: { skills: { id: string; name: string }[]; skill: string | null; nodeCount: number; minNodes: number; maxNodes: number } | null;
		};
		anoints: { anointable: boolean; current: string[]; slots: number };
		corruptions: { corrupted: boolean; corruptible: boolean; enchantNum: number; mods: { id: string; label: string; group: string | null }[]; specialMods: { id: string; label: string }[] };
		enchantable: boolean;
		modifierSources: { id: string; label: string }[];
	}
	interface Enchants {
		available: boolean;
		bySkill: boolean;
		skills: string[];
		skill: string | null;
		sources: string[];
		source: string | null;
		lines: string[];
		current: string[];
	}

	let { open = $bindable(false), itemId, slotName = null }: { open?: boolean; itemId: number | null; slotName?: string | null } = $props();

	let c = $state<Custom | null>(null);
	let tip = $state<Tooltip | null>(null);
	let section = $state<"craft" | "extra" | "text">("craft");
	let enchants = $state<Enchants | null>(null);
	let anointNodes = $state<{ id: number; name: string; stats: string[]; allocated: boolean }[]>([]);
	let anointQuery = $state("");
	let modSource = $state("MASTER");
	let modQuery = $state("");
	let modOptions = $state<{ id: string; label: string; level: number | null }[]>([]);
	let customText = $state("");
	let rawText = $state("");
	let drag = $state<Record<string, number>>({});
	let corruptPick = $state<string[]>([]);

	$effect(() => {
		if (open && itemId) {
			section = "craft";
			load();
		}
	});

	async function load() {
		if (!itemId) return;
		c = await app.call<Custom>("item_customization", { itemId }).catch((e) => (app.notify(e.message, "error"), null));
		if (c) rawText = c.raw;
		loadTip();
	}
	async function loadTip() {
		if (!itemId) return;
		tip = await app.call<Tooltip>("item_tooltip", { itemId, slotName: slotName ?? undefined }).catch(() => null);
	}
	async function op(operation: string, params: Record<string, unknown> = {}) {
		if (!itemId) return;
		try {
			c = await app.mutate<Custom>("item_customize", { itemId, operation, ...params });
			rawText = c.raw;
			drag = {};
			loadTip();
		} catch {
			/* reported */
		}
	}

	// --- affixes -------------------------------------------------------------
	function position(s: AffixSlot): number {
		const tiers = s.rolls?.tiers;
		if (!tiers?.length) return 1;
		const i = tiers.findIndex((t) => t.modId === s.modId);
		if (i < 0) return 1;
		const r = tiers[i].flipped ? 1 - s.range : s.range;
		return Math.min(1, Math.max(0, (i + r) / tiers.length));
	}
	function preview(s: AffixSlot, pos: number): { tier: number; value: string } {
		const tiers = s.rolls!.tiers;
		const n = tiers.length;
		const idx = Math.min(n, Math.max(1, Math.ceil(pos * n)));
		const t = tiers[idx - 1];
		// The slider runs low to high within a tier; a "flipped" tier stores its roll reversed.
		const p = (pos * n - idx + 1) * 100;
		let hit = t.steps[0];
		for (const st of t.steps) {
			const at = (t.flipped ? 1 - st.range : st.range) * 100;
			if (at <= p + 1e-6) hit = st;
		}
		return { tier: t.tier, value: hit.value };
	}
	const key = (table: string, s: AffixSlot) => `${table}:${s.index}`;
	function setSeries(table: string, s: AffixSlot, seriesId: string) {
		if (!seriesId) return op("affix", { table, index: s.index, modId: "None" });
		return op("affix", { table, index: s.index, seriesId, relativePosition: 1 });
	}
	function setRoll(table: string, s: AffixSlot, pos: number) {
		if (!s.rolls) return;
		return op("affix", { table, index: s.index, seriesId: s.rolls.seriesId, relativePosition: pos });
	}
	function seriesOf(s: AffixSlot): string {
		if (s.modId === "None") return "";
		return s.rolls?.seriesId ?? s.options.find((o) => o.modIds.includes(s.modId))?.id ?? "";
	}

	// --- extras --------------------------------------------------------------
	async function loadEnchants(params: Record<string, unknown> = {}) {
		if (!itemId) return;
		enchants = await app.call<Enchants>("item_enchants", { itemId, ...params }).catch(() => null);
	}
	async function loadAnoints() {
		if (!itemId || anointNodes.length) return;
		const r = await app.call<{ nodes: typeof anointNodes }>("item_anoints", { itemId, withNodes: true }).catch(() => ({ nodes: [] }));
		anointNodes = r.nodes;
	}
	const anointHits = $derived.by(() => {
		const q = anointQuery.trim().toLowerCase();
		if (q.length < 2) return [];
		return anointNodes.filter((n) => n.name.toLowerCase().includes(q) || n.stats.some((s) => s.toLowerCase().includes(q))).slice(0, 30);
	});
	let modTimer: ReturnType<typeof setTimeout>;
	function searchMods() {
		clearTimeout(modTimer);
		modTimer = setTimeout(async () => {
			if (!itemId) return;
			const r = await app.call<{ options: typeof modOptions }>("item_modifier_options", { itemId, source: modSource, query: modQuery }).catch(() => ({ options: [] }));
			modOptions = r.options;
		}, 200);
	}
	function openExtra() {
		section = "extra";
		loadEnchants();
		if (c?.anoints.anointable) loadAnoints();
		if (c?.modifierSources.length) {
			if (!c.modifierSources.some((s) => s.id === modSource)) modSource = c.modifierSources[0].id;
			searchMods();
		}
		corruptPick = [];
	}
	function toggleInfluence(k: string) {
		if (!c) return;
		const on = c.shape.influences.filter((i) => i.on).map((i) => i.key);
		const next = on.includes(k) ? on.filter((x) => x !== k) : [...on, k].slice(-2);
		op("shape", { influences: next });
	}
	// Sockets: a string like "R-G-B B" — dashes link, spaces split groups.
	const socketText = $derived(
		c ? c.shape.sockets.map((s, i) => (i === 0 ? "" : s.group === c!.shape.sockets[i - 1].group ? "-" : " ") + s.colour).join("") : "",
	);
	function setSockets(text: string) {
		const out: { colour: string; group: number }[] = [];
		let group = 0;
		const t = text.toUpperCase().replace(/[^RGBWA\- ]/g, "");
		for (let i = 0; i < t.length; i++) {
			const ch = t[i];
			if (ch === " ") {
				if (out.length) group++;
				continue;
			}
			if (ch === "-") continue;
			if (i > 0 && t[i - 1] !== "-" && t[i - 1] !== " " && out.length) group++;
			out.push({ colour: ch, group });
		}
		op("shape", { sockets: out });
	}
	/** The first "(min-max)" in a line: what its roll runs between. */
	function rangeOf(text: string): [number, number] | null {
		const m = /\((-?[\d.]+)-(-?[\d.]+)\)/.exec(text);
		if (!m) return null;
		const a = Number(m[1]), b = Number(m[2]);
		return b > a ? [a, b] : null;
	}
	const num = (e: Event) => Number((e.currentTarget as HTMLInputElement).value);
	const val = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value;
	async function saveText() {
		if (!itemId) return;
		await app.mutate("item_edit", { itemId, text: rawText }).catch(() => {});
		load();
	}
</script>

{#snippet affixRow(table: string, s: AffixSlot)}
	{@const k = key(table, s)}
	{@const pos = drag[k] ?? position(s)}
	<div class="affix">
		<select class="field" value={seriesOf(s)} onchange={(e) => setSeries(table, s, val(e))}>
			<option value="">{table === "prefixes" ? "Prefix" : "Suffix"} {s.index}: none</option>
			{#each s.options as o (o.id)}<option value={o.id}>{o.label}</option>{/each}
		</select>
		{#if s.rolls && s.modId !== "None"}
			{@const pv = drag[k] != null ? preview(s, pos) : null}
			<div class="roll">
				<input
					type="range"
					min="0"
					max="1"
					step="0.001"
					value={pos}
					aria-label="Tier and roll"
					oninput={(e) => (drag = { ...drag, [k]: num(e) })}
					onchange={(e) => setRoll(table, s, num(e))}
				/>
				<span class="tier num">T{pv?.tier ?? s.rolls.tiers.find((t) => t.modId === s.modId)?.tier ?? "?"}</span>
			</div>
			<div class="value">{pv?.value ?? s.value}</div>
		{/if}
	</div>
{/snippet}

<Sheet bind:open title="Craft item">
	{#if c}
		<div class="tabs">
			<button class:on={section === "craft"} onclick={() => (section = "craft")}>Mods</button>
			<button class:on={section === "extra"} onclick={openExtra}>More</button>
			<button class:on={section === "text"} onclick={() => ((section = "text"), (rawText = c!.raw))}>Text</button>
		</div>

		{#if section === "craft"}
			<div class="formgrid">
				{#if c.canQuality}
					<label>
						<span class="eyebrow">Quality</span>
						<input class="field num" type="number" min="0" max="30" value={c.quality} onchange={(e) => op("props", { quality: num(e) })} />
					</label>
				{/if}
				<label>
					<span class="eyebrow">Item level</span>
					<input class="field num" type="number" min="1" max="100" value={c.itemLevel} onchange={(e) => op("props", { itemLevel: num(e) })} />
				</label>
			</div>

			{#if c.variants.names.length}
				<h3 class="eyebrow">Variant</h3>
				{#each c.variants.picks as pick, i (i)}
					<select class="field gap" value={pick} onchange={(e) => op("variant", { picks: c!.variants.picks.map((p, j) => (j === i ? Number(val(e)) : p)) })}>
						{#each c.variants.names as n, vi (vi)}<option value={vi + 1}>{n}</option>{/each}
					</select>
				{/each}
			{/if}

			{#if c.shape.cluster}
				{@const cl = c.shape.cluster}
				<h3 class="eyebrow">Cluster jewel</h3>
				<div class="formgrid">
					<label class="wide">
						<span class="eyebrow">Skill</span>
						<select class="field" value={cl.skill ?? ""} onchange={(e) => op("shape", { clusterSkill: val(e) })}>
							{#each cl.skills as s (s.id)}<option value={s.id}>{s.name}</option>{/each}
						</select>
					</label>
					<label>
						<span class="eyebrow">Passives</span>
						<input class="field num" type="number" min={cl.minNodes} max={cl.maxNodes} value={cl.nodeCount} onchange={(e) => op("shape", { clusterNodeCount: num(e) })} />
					</label>
				</div>
			{/if}

			{#if c.affixes.crafted}
				<h3 class="eyebrow">Prefixes</h3>
				{#each c.affixes.prefixes as s (s.index)}{@render affixRow("prefixes", s)}{/each}
				<h3 class="eyebrow">Suffixes</h3>
				{#each c.affixes.suffixes as s (s.index)}{@render affixRow("suffixes", s)}{/each}
				<p class="muted small">Slide right for higher tiers and better rolls; the far right is the best tier, perfectly rolled.</p>
			{/if}

			{#if c.modifiers.length}
				<h3 class="eyebrow">Other modifiers</h3>
				<div class="list card">
					{#each c.modifiers as m (m.section + m.index)}
						{@const rr = rangeOf(m.text)}
						<div class="mod" class:off={m.disabled}>
							<span class="grow small"><PobText text={m.text} />{#if !m.parsed}<span class="unparsed"> · not understood by PoB</span>{/if}</span>
							{#if m.range != null && rr}
								<input
									class="field num roll-in"
									type="number"
									min={rr[0]}
									max={rr[1]}
									value={Math.round(rr[0] + (rr[1] - rr[0]) * m.range)}
									aria-label="Roll"
									onchange={(e) => op("modifier", { section: m.section, index: m.index, range: Math.min(1, Math.max(0, (num(e) - rr[0]) / (rr[1] - rr[0]))) })}
								/>
							{/if}
							<button class="icon-btn" aria-label="Remove modifier" onclick={() => op("modifier", { section: m.section, index: m.index, remove: true })}><Icon name="trash" size={16} /></button>
						</div>
					{/each}
				</div>
			{/if}
		{:else if section === "extra"}
			{#if c.shape.canBeInfluenced}
				<h3 class="eyebrow">Influence</h3>
				<div class="chips">
					{#each c.shape.influences as inf (inf.key)}
						<button class="chip" class:on={inf.on} onclick={() => toggleInfluence(inf.key)}>{inf.name}</button>
					{/each}
				</div>
			{/if}
			{#if c.shape.socketLimit > 0}
				<h3 class="eyebrow">Sockets</h3>
				<input class="field mono" value={socketText} placeholder="R-G-B-B" onchange={(e) => setSockets(val(e))} autocapitalize="characters" />
				<p class="muted small">R, G, B, W (white) or A (abyssal); a dash links two sockets, a space starts a new group. Up to {c.shape.socketLimit}.</p>
			{/if}
			{#if c.catalyst.usable}
				<h3 class="eyebrow">Catalyst</h3>
				<div class="formgrid">
					<select class="field" value={c.catalyst.catalyst} onchange={(e) => op("props", { catalyst: Number(val(e)) })}>
						<option value={0}>None</option>
						{#each c.catalyst.names as n, i (i)}<option value={i + 1}>{n}</option>{/each}
					</select>
					<input class="field num" type="number" min="0" max="100" value={c.catalyst.quality} aria-label="Catalyst quality" onchange={(e) => op("props", { catalystQuality: num(e) })} />
				</div>
			{/if}
			{#if enchants?.available}
				<h3 class="eyebrow">Enchant</h3>
				{#if enchants.current.length}<p class="small"><PobText text={enchants.current.join(" / ")} /></p>{/if}
				{#if enchants.bySkill}
					<select class="field gap" value={enchants.skill ?? ""} onchange={(e) => loadEnchants({ skill: val(e) })}>
						{#each enchants.skills as s (s)}<option value={s}>{s}</option>{/each}
					</select>
				{/if}
				{#if enchants.sources.length > 1}
					<div class="chips gap">
						{#each enchants.sources as s (s)}
							<button class="chip" class:on={enchants.source === s} onclick={() => loadEnchants({ skill: enchants!.skill, source: s })}>{s}</button>
						{/each}
					</div>
				{/if}
				<select class="field gap" value="" onchange={(e) => val(e) && op("enchant", { line: val(e) }).then(() => loadEnchants({ skill: enchants?.skill, source: enchants?.source }))}>
					<option value="">Choose an enchant…</option>
					{#each enchants.lines as l (l)}<option value={l}>{l}</option>{/each}
				</select>
				{#if enchants.current.length}<button class="btn ghost" onclick={() => op("enchant", { remove: true }).then(() => loadEnchants())}>Remove enchant</button>{/if}
			{/if}
			{#if c.anoints.anointable}
				<h3 class="eyebrow">Anoint</h3>
				{#if c.anoints.current.length}<p class="small">Allocates <b>{c.anoints.current.join(", ")}</b> <button class="link" onclick={() => op("anoint", { nodeId: null })}>remove</button></p>{/if}
				<input class="field" type="search" placeholder="Search notables" bind:value={anointQuery} />
				{#each anointHits as n (n.id)}
					<button class="rowbtn" onclick={() => ((anointQuery = ""), op("anoint", { nodeId: n.id }))}>
						<span class="grow"><span>{n.name}</span><span class="muted small block">{n.stats.join(" · ")}</span></span>
						{#if n.allocated}<span class="muted small">on tree</span>{/if}
					</button>
				{/each}
			{/if}
			{#if c.corruptions.corruptible || c.corruptions.corrupted}
				<h3 class="eyebrow">Corruption</h3>
				<label class="check"><input type="checkbox" checked={c.corrupted} onchange={() => op("props", { corrupted: !c!.corrupted })} /> Corrupted</label>
				{#if c.corruptions.mods.length && c.corruptions.enchantNum > 0}
					{#each Array(c.corruptions.enchantNum) as _, i (i)}
						<select class="field gap" value={corruptPick[i] ?? ""} onchange={(e) => (corruptPick = Object.assign([...corruptPick], { [i]: val(e) }))}>
							<option value="">Corrupted implicit {i + 1}: none</option>
							{#each c.corruptions.mods as m (m.id)}<option value={m.id}>{m.label}</option>{/each}
						</select>
					{/each}
					<button class="btn block" disabled={!corruptPick.some(Boolean)} onclick={() => op("corruption", { modIds: corruptPick.filter(Boolean) })}>Corrupt with these implicits</button>
				{/if}
			{/if}
			{#if c.modifierSources.length}
				<h3 class="eyebrow">Add modifier</h3>
				<div class="chips gap">
					{#each c.modifierSources as s (s.id)}
						<button class="chip" class:on={modSource === s.id} onclick={() => ((modSource = s.id), searchMods())}>{s.label}</button>
					{/each}
				</div>
				<input class="field" type="search" placeholder="Filter" bind:value={modQuery} oninput={searchMods} />
				<div class="modlist">
					{#each modOptions as m (m.id)}
						<button class="rowbtn small" onclick={() => op("add_modifier", { source: modSource, modId: m.id, label: m.label }).then(searchMods)}>
							<span class="grow">{m.label}</span>
							{#if m.level}<span class="muted num">{m.level}</span>{/if}
						</button>
					{/each}
				</div>
			{/if}
			<h3 class="eyebrow">Custom modifier</h3>
			<div class="formgrid">
				<input class="field wide" placeholder="+50 to maximum Life" bind:value={customText} />
				<button class="btn wide" disabled={!customText.trim()} onclick={() => op("add_modifier", { text: customText }).then(() => (customText = ""))}>Add line</button>
			</div>
		{:else}
			<textarea class="field mono" rows="14" bind:value={rawText} autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
			<button class="btn primary block gap" onclick={saveText}>Save text</button>
		{/if}

		<div class="tip">
			{#if tip}<TooltipView tooltip={tip} />{/if}
		</div>
	{:else}
		<p class="muted">Loading…</p>
	{/if}
</Sheet>

<style>
	.tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 12px;
		padding: 3px;
		background: var(--bg-0);
		border-radius: var(--radius-sm);
	}
	.tabs button {
		flex: 1;
		min-height: 36px;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--fg-2);
		font-size: 14px;
	}
	.tabs button.on {
		background: var(--bg-3);
		color: var(--fg-0);
	}
	h3.eyebrow {
		margin: 16px 0 8px;
	}
	.affix {
		margin-bottom: 10px;
	}
	.roll {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 4px;
	}
	.roll input {
		flex: 1;
		accent-color: var(--c-rare);
		height: 32px;
	}
	.tier {
		width: 34px;
		text-align: right;
		font-size: 13px;
		color: var(--fg-1);
	}
	.value {
		font-size: 13px;
		color: var(--c-magic);
		padding: 0 2px;
	}
	.mod {
		display: flex;
		align-items: center;
		padding-left: 12px;
	}
	.roll-in {
		width: 86px;
		min-height: 36px;
		padding: 4px 8px;
	}
	.mod.off {
		opacity: 0.5;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.unparsed {
		color: var(--warn);
	}
	.small {
		font-size: 13px;
	}
	.block {
		display: block;
	}
	.gap {
		margin-bottom: 8px;
	}
	.mono {
		font-family: var(--mono);
		font-size: 13px;
	}
	.modlist {
		max-height: 300px;
		overflow: auto;
		margin-top: 6px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
	}
	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--fg-0);
	}
	.link {
		border: 0;
		background: none;
		color: var(--focus);
		padding: 0;
		font-size: 13px;
	}
	.tip {
		margin-top: 16px;
	}
</style>
