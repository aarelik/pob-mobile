<script lang="ts">
	// PoB's build comparison: load another build (a saved one or a code), then
	// see stats side by side, which slots and skills differ, and how the trees
	// differ. Their items and tree can be copied into this build.
	import Icon from "./Icon.svelte";
	import PobText from "./PobText.svelte";
	import Sheet from "./Sheet.svelte";
	import { app } from "../lib/app.svelte";
	import { getBuild } from "../lib/storage";
	import { stripPobText } from "../lib/pobtext";

	interface Entry {
		index: number;
		label: string;
		className: string;
		ascendClassName: string | null;
		level: number;
		active: boolean;
	}
	interface StatRow {
		label: string;
		mineText: string | null;
		theirsText: string | null;
		deltaText: string | null;
		better: boolean | null;
		same: boolean;
	}
	interface ItemRow {
		slot: string;
		label: string;
		same: boolean;
		mine: { name: string; rarity: string } | null;
		theirs: { name: string; rarity: string } | null;
	}
	interface SkillRow {
		index: number;
		same: boolean;
		mine: { label: string; gems: { name: string; level: number; quality: number; enabled: boolean }[] } | null;
		theirs: { label: string; gems: { name: string; level: number; quality: number; enabled: boolean }[] } | null;
	}
	interface TreeDiff {
		gained: number[];
		lost: number[];
		keystonesGained: string[];
		keystonesLost: string[];
		mine: { nodes: number };
		theirs: { nodes: number };
	}
	const RARITY: Record<string, string> = { UNIQUE: "var(--c-unique)", RARE: "var(--c-rare)", MAGIC: "var(--c-magic)", NORMAL: "var(--c-normal)", RELIC: "var(--c-gem)" };

	let entries = $state<Entry[]>([]);
	let view = $state<"stats" | "items" | "skills" | "tree">("stats");
	let onlyDiff = $state(true);
	let stats = $state<StatRow[]>([]);
	let items = $state<ItemRow[]>([]);
	let skills = $state<SkillRow[]>([]);
	let tree = $state<TreeDiff | null>(null);
	let addOpen = $state(false);
	let code = $state("");
	let adding = $state(false);
	const active = $derived(entries.find((e) => e.active) ?? null);

	$effect(() => {
		void app.rev;
		void view;
		void onlyDiff;
		load();
	});
	async function load() {
		const l = await app.call<{ entries: Entry[] }>("compare_list").catch(() => ({ entries: [] }));
		entries = l.entries;
		if (!entries.length) return;
		try {
			if (view === "stats") stats = (await app.call<{ rows: StatRow[] }>("compare_summary", { onlyDifferences: onlyDiff })).rows;
			else if (view === "items") items = (await app.call<{ rows: ItemRow[] }>("compare_items", { onlyDifferences: onlyDiff })).rows;
			else if (view === "skills") skills = (await app.call<{ rows: SkillRow[] }>("compare_skills", { onlyDifferences: onlyDiff })).rows;
			else tree = await app.call<TreeDiff>("compare_tree");
		} catch (e) {
			app.notify(e instanceof Error ? e.message : String(e), "error");
		}
	}
	async function add(xml: string | null, codeText: string | null, label: string) {
		adding = true;
		try {
			await app.call("compare_add", xml ? { xml, label } : { code: codeText, label });
			addOpen = false;
			code = "";
			await load();
		} catch (e) {
			app.notify(e instanceof Error ? e.message : String(e), "error");
		} finally {
			adding = false;
		}
	}
	async function addSaved(id: string) {
		const b = await getBuild(id);
		if (b) add(b.xml, null, b.name);
	}
	async function select(i: number) {
		await app.call("compare_select", { index: i });
		load();
	}
	async function remove() {
		if (!active) return;
		await app.call("compare_remove", { index: active.index });
		load();
	}
	async function copyItem(slot: string) {
		const r = await app.mutate<{ itemName: string }>("compare_copy_item", { slot });
		app.notify(`Equipped ${r.itemName}`);
	}
	async function copyTree() {
		const r = await app.mutate<{ title: string }>("compare_copy_tree");
		app.notify(`Added "${r.title}" to your trees`);
	}
</script>

{#if !entries.length}
	<div class="empty card">
		<p>Compare this build with another one: stats side by side, the items, skills and passives that differ.</p>
		<button class="btn primary" onclick={() => (addOpen = true)}><Icon name="plus" size={18} /> Choose a build</button>
	</div>
{:else}
	<div class="top">
		<select class="field" value={active?.index ?? ""} onchange={(e) => select(Number((e.currentTarget as HTMLSelectElement).value))}>
			{#each entries as e (e.index)}<option value={e.index}>{e.label} · {e.ascendClassName || e.className} {e.level}</option>{/each}
		</select>
		<button class="icon-btn" aria-label="Add a build to compare" onclick={() => (addOpen = true)}><Icon name="plus" /></button>
		<button class="icon-btn" aria-label="Remove this comparison" onclick={remove}><Icon name="trash" /></button>
	</div>
	<div class="chips seg">
		{#each [["stats", "Stats"], ["items", "Items"], ["skills", "Skills"], ["tree", "Tree"]] as [id, label] (id)}
			<button class="chip" class:on={view === id} onclick={() => (view = id as typeof view)}>{label}</button>
		{/each}
		{#if view !== "tree"}
			<label class="only"><input type="checkbox" bind:checked={onlyDiff} /> Only differences</label>
		{/if}
	</div>

	{#if view === "stats"}
		<div class="list card">
			<div class="srow head"><span></span><span>This build</span><span>{active?.label}</span></div>
			{#each stats as r, i (i)}
				<div class="srow">
					<span class="l">{r.label}</span>
					<span class="num">{r.mineText ?? "–"}</span>
					<span class="num">
						{r.theirsText ?? "–"}
						{#if r.deltaText}<span class="d" class:good={r.better === true} class:bad={r.better === false}>{r.deltaText}</span>{/if}
					</span>
				</div>
			{/each}
		</div>
		<p class="muted small">The difference shows what switching to {active?.label} would change: green is better for them, red worse.</p>
	{:else if view === "items"}
		<div class="list card">
			{#each items as r (r.slot)}
				<div class="irow">
					<div class="slot muted small">{r.label}</div>
					<div class="pair">
						<span style:color={RARITY[r.mine?.rarity ?? ""]}>{r.mine?.name ?? "—"}</span>
						<span style:color={RARITY[r.theirs?.rarity ?? ""]}>{r.theirs?.name ?? "—"}</span>
					</div>
					{#if r.theirs && !r.same}<button class="btn ghost small" onclick={() => copyItem(r.slot)}>Use theirs</button>{/if}
				</div>
			{/each}
		</div>
	{:else if view === "skills"}
		<div class="list card">
			{#each skills as r (r.index)}
				<div class="irow">
					<div class="pair">
						<span>
							<b>{stripPobText(r.mine?.label ?? "—")}</b>
							{#if r.mine}<span class="gems">{r.mine.gems.map((g) => `${g.name} ${g.level}/${g.quality}`).join(", ")}</span>{/if}
						</span>
						<span>
							<b>{stripPobText(r.theirs?.label ?? "—")}</b>
							{#if r.theirs}<span class="gems">{r.theirs.gems.map((g) => `${g.name} ${g.level}/${g.quality}`).join(", ")}</span>{/if}
						</span>
					</div>
				</div>
			{/each}
		</div>
	{:else if tree}
		<div class="card pad">
			<p>This tree has <b>{tree.mine.nodes}</b> passives, theirs <b>{tree.theirs.nodes}</b>.</p>
			<p><span class="good">{tree.gained.length} they have that you don't</span> · <span class="bad">{tree.lost.length} you have that they don't</span></p>
			{#if tree.keystonesGained.length}<p>Their keystones: <PobText text={tree.keystonesGained.join(", ")} /></p>{/if}
			{#if tree.keystonesLost.length}<p>Your keystones they skip: <PobText text={tree.keystonesLost.join(", ")} /></p>{/if}
			<button class="btn block" onclick={copyTree}>Copy their tree into this build</button>
			<p class="muted small">It is added as a new passive tree; switch trees with the Tree picker on the Tree tab.</p>
		</div>
	{/if}
{/if}

<Sheet bind:open={addOpen} title="Compare with">
	{#if app.saved.filter((b) => b.id !== app.currentId).length}
		<h3 class="eyebrow">Saved builds</h3>
		<div class="list card">
			{#each app.saved.filter((b) => b.id !== app.currentId) as b (b.id)}
				<button class="rowbtn" disabled={adding} onclick={() => addSaved(b.id)}>
					<span class="grow"><span>{b.name}</span><span class="muted small block">{b.summary.ascendancy || b.summary.className} {b.summary.level}</span></span>
				</button>
			{/each}
		</div>
	{/if}
	<h3 class="eyebrow">Or a build code</h3>
	<textarea class="field" rows="4" bind:value={code} placeholder="eNrtfWl3..." autocapitalize="off" spellcheck="false"></textarea>
	<button class="btn primary block" style="margin-top:8px" disabled={adding || !code.trim()} onclick={() => add(null, code.trim(), "Pasted build")}>Compare</button>
</Sheet>

<style>
	.empty {
		padding: 18px;
		text-align: center;
	}
	.top {
		display: flex;
		gap: 4px;
		align-items: center;
		margin-bottom: 10px;
	}
	.seg {
		margin-bottom: 10px;
		align-items: center;
	}
	.only {
		display: flex;
		gap: 6px;
		align-items: center;
		font-size: 13px;
		color: var(--fg-2);
		margin-left: auto;
	}
	.srow {
		display: grid;
		grid-template-columns: 1.3fr 1fr 1.2fr;
		gap: 8px;
		padding: 8px 12px;
		font-size: 13px;
		align-items: baseline;
	}
	.srow.head {
		font-size: 11px;
		color: var(--fg-3);
		font-weight: 600;
	}
	.srow .num {
		text-align: right;
	}
	.l {
		color: var(--fg-1);
	}
	.d {
		display: block;
		font-size: 11px;
	}
	.good {
		color: var(--ok);
	}
	.bad {
		color: var(--bad);
	}
	.irow {
		padding: 8px 12px;
	}
	.pair {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		font-size: 13px;
	}
	.gems {
		display: block;
		font-size: 11px;
		color: var(--fg-2);
	}
	.small {
		font-size: 12px;
	}
	.btn.small {
		min-height: 32px;
		margin-top: 6px;
		font-size: 13px;
	}
	.block {
		display: block;
	}
	.grow {
		flex: 1;
	}
	.pad {
		padding: 12px 14px;
	}
	h3.eyebrow {
		margin: 12px 0 8px;
	}
</style>
