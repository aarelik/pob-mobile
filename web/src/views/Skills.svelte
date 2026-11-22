<script lang="ts">
	// PoB's Skills tab: skill sets, socket groups and their gems. A group's
	// sheet holds its options (slot, active skill, part, stages, minion); a
	// gem's sheet its level and quality; "Add gem" searches PoB's gem list.
	import GemPicker from "../components/GemPicker.svelte";
	import Icon from "../components/Icon.svelte";
	import PobText from "../components/PobText.svelte";
	import SetPicker from "../components/SetPicker.svelte";
	import Sheet from "../components/Sheet.svelte";
	import TooltipView from "../components/TooltipView.svelte";
	import type { Gem, SocketGroup, Skills, Tooltip } from "../engine/types";
	import { app } from "../lib/app.svelte";
	import { stripPobText } from "../lib/pobtext";

	let skills = $state<Skills | null>(null);
	let gemOpen = $state(false);
	let groupOpen = $state(false);
	let pickerOpen = $state(false);
	let selGroup = $state<number | null>(null);
	let selGem = $state<number | null>(null);
	/** What the picker does: add to a group, or replace the selected gem. */
	let pickFor = $state<{ group: number; replace: number | null } | null>(null);
	let tooltip = $state<Tooltip | null>(null);
	let lvl = $state(20);
	let qual = $state(0);
	let label = $state("");

	const group = $derived(skills?.socketGroups.find((g) => g.index === selGroup) ?? null);
	const gem = $derived(group?.gems.find((g) => g.index === selGem) ?? null);
	const main = $derived(group?.skills.find((s) => s.index === (group?.mainActiveSkill || 1)) ?? null);

	$effect(() => {
		void app.rev;
		app.call<Skills>("get_skills").then((r) => (skills = r)).catch((e) => app.notify(e.message, "error"));
	});

	async function openGem(g: SocketGroup, gm: Gem) {
		selGroup = g.index;
		selGem = gm.index;
		lvl = gm.level;
		qual = gm.quality;
		tooltip = null;
		gemOpen = true;
		loadTip();
	}
	async function loadTip() {
		if (selGroup == null || selGem == null) return;
		tooltip = await app.call<Tooltip>("gem_tooltip", { groupIndex: selGroup, gemIndex: selGem }).catch(() => null);
	}
	async function setGem(patch: Record<string, unknown>) {
		if (selGroup == null || selGem == null) return;
		await app.mutate("set_gem", { groupIndex: selGroup, gemIndex: selGem, ...patch });
		loadTip();
	}
	async function removeGem() {
		if (selGroup == null || selGem == null) return;
		gemOpen = false;
		await app.mutate("remove_gem", { groupIndex: selGroup, gemIndex: selGem });
	}
	async function moveGem(by: number) {
		if (!group || selGem == null) return;
		const to = selGem + by;
		if (to < 1 || to > group.gems.length) return;
		await app.mutate("move_gem", { groupIndex: group.index, from: selGem, to });
		selGem = to;
	}
	function openGroup(g: SocketGroup) {
		selGroup = g.index;
		label = g.label ?? "";
		groupOpen = true;
	}
	const setGroup = (patch: Record<string, unknown>) => selGroup != null && app.mutate("set_socket_group", { index: selGroup, ...patch });
	const setOpt = (patch: Record<string, unknown>) => selGroup != null && app.mutate("set_main_skill_options", { groupIndex: selGroup, ...patch });
	const toggleGroup = (g: SocketGroup) => app.mutate("set_socket_group", { index: g.index, enabled: !g.enabled });
	const toggleFull = (g: SocketGroup) => app.mutate("set_socket_group", { index: g.index, includeInFullDPS: !g.includeInFullDPS });
	const setMain = (g: SocketGroup) => app.mutate("set_main_skill", { index: g.index });

	async function addGroup() {
		const r = await app.mutate<{ groupIndex: number }>("add_socket_group", {});
		pickFor = { group: r.groupIndex, replace: null };
		pickerOpen = true;
	}
	function addGem(g: SocketGroup) {
		pickFor = { group: g.index, replace: null };
		pickerOpen = true;
	}
	function replaceGem() {
		if (selGroup == null || selGem == null) return;
		pickFor = { group: selGroup, replace: selGem };
		gemOpen = false;
		pickerOpen = true;
	}
	async function picked(gemId: string) {
		if (!pickFor) return;
		if (pickFor.replace != null) await app.mutate("set_gem", { groupIndex: pickFor.group, gemIndex: pickFor.replace, gemId });
		else await app.mutate("add_gem", { groupIndex: pickFor.group, gemId });
	}
	async function deleteGroup() {
		if (!group) return;
		if (!confirm(`Delete ${group.label || group.displayLabel || "this group"}?`)) return;
		groupOpen = false;
		await app.mutate("remove_socket_group", { index: group.index });
		selGroup = null;
	}
	async function duplicateGroup() {
		if (!group) return;
		const { text } = await app.call<{ text: string }>("copy_socket_group", { index: group.index });
		await app.mutate("paste_socket_group", { text });
		groupOpen = false;
	}
	async function moveGroup(by: number) {
		if (!group || !skills) return;
		const to = group.index + by;
		if (to < 1 || to > skills.socketGroups.length) return;
		await app.mutate("move_socket_group", { from: group.index, to });
		selGroup = to;
	}
	async function pasteGroup() {
		const text = await navigator.clipboard?.readText().catch(() => "") ?? "";
		const input = text.trim() || prompt("Paste a socket group copied from Path of Building") || "";
		if (input.trim()) await app.mutate("paste_socket_group", { text: input });
	}
	function grantedLabel(g: SocketGroup): string | null {
		const by = g.grantedBy;
		if (!by) return null;
		return `Granted by ${stripPobText(by.item ?? by.node ?? by.source)}`;
	}
	function stripColor(c: string): string {
		const m = /\^x([0-9a-fA-F]{6})/.exec(c);
		return m ? `#${m[1]}` : "var(--fg-2)";
	}
	const num = (e: Event) => Number((e.currentTarget as HTMLInputElement | HTMLSelectElement).value);
	const str = (e: Event) => (e.currentTarget as HTMLInputElement | HTMLSelectElement).value;
</script>

<div class="page">
	<div class="top">
		<SetPicker kind="skill" />
		<span class="spacer"></span>
		<button class="icon-btn" aria-label="Paste socket group" onclick={pasteGroup}><Icon name="paste" size={20} /></button>
		<button class="btn" onclick={addGroup}><Icon name="plus" size={18} /> Group</button>
	</div>
	{#if skills}
		{#each skills.socketGroups as g (g.index)}
			<section class="group card" class:off={!g.enabled || !g.slotEnabled}>
				<header>
					<button class="star" class:main={g.isMainSkill} aria-label="Set as main skill" onclick={() => setMain(g)} disabled={!g.skills.length}>
						<Icon name={g.isMainSkill ? "star-fill" : "star"} size={20} />
					</button>
					<button class="title" onclick={() => openGroup(g)}>
						<div class="name">{g.label || g.displayLabel || "Socket group"}</div>
						<div class="meta">
							{g.slot ?? grantedLabel(g) ?? "No slot"}
							{#if g.itemSockets?.text}<span class="sockets"><PobText text={g.itemSockets.text} /></span>{/if}
							{#if g.skills.length > 1}<span>· {g.skills.find((s) => s.index === (g.mainActiveSkill || 1))?.name}</span>{/if}
						</div>
					</button>
					<button class="switch" role="switch" aria-checked={g.enabled} aria-label="Enabled" onclick={() => toggleGroup(g)}></button>
				</header>
				<div class="gems">
					{#each g.gems as gm (gm.index)}
						<button class="gem" class:disabled={!gm.enabled} onclick={() => openGem(g, gm)}>
							<span class="dot" style:background={gm.color ? stripColor(gm.color) : "var(--fg-3)"}></span>
							<span class="gname" class:support={gm.support}>{gm.name || gm.nameSpec}</span>
							<span class="num lv">{gm.level}/{gm.quality}</span>
							{#if gm.errMsg}<span class="err" title={gm.errMsg}><Icon name="warn" size={16} /></span>{/if}
						</button>
					{/each}
				</div>
				<div class="foot">
					{#if !g.source}
						<button class="add" onclick={() => addGem(g)}><Icon name="plus" size={16} /> Add gem</button>
					{/if}
					{#if g.skills.length}
						<button class="full" onclick={() => toggleFull(g)}>
							<span class="box" class:on={g.includeInFullDPS}></span> Full DPS
						</button>
					{/if}
				</div>
			</section>
		{/each}
		{#if !skills.socketGroups.length}<p class="muted center">No skills yet. Add a group, or import a build.</p>{/if}
	{/if}
</div>

<Sheet bind:open={gemOpen} title={gem?.name ?? ""}>
	{#if gem && group}
		<div class="controls">
			<label>
				<span class="eyebrow">Level</span>
				<input class="field num" type="number" inputmode="numeric" min="1" max="40" bind:value={lvl} onchange={() => setGem({ level: lvl })} />
			</label>
			<label>
				<span class="eyebrow">Quality</span>
				<input class="field num" type="number" inputmode="numeric" min="0" max="23" bind:value={qual} onchange={() => setGem({ quality: qual })} />
			</label>
			<label class="en">
				<span class="eyebrow">Enabled</span>
				<button class="switch" role="switch" aria-checked={gem.enabled} aria-label="Gem enabled" onclick={() => setGem({ enabled: !gem!.enabled })}></button>
			</label>
		</div>
		<div class="chips quick">
			<button class="chip" onclick={() => { lvl = gem!.maxLevel; setGem({ level: lvl }); }}>Level {gem.maxLevel}</button>
			<button class="chip" onclick={() => { lvl = gem!.maxLevel + 1; setGem({ level: lvl }); }}>Level {gem.maxLevel + 1}</button>
			<button class="chip" onclick={() => { qual = 20; setGem({ quality: 20 }); }}>20% quality</button>
			<button class="chip" onclick={() => { qual = 23; setGem({ quality: 23 }); }}>23%</button>
		</div>
		{#if gem.globalEffects}
			{#each gem.globalEffects as ge (ge.index)}
				<label class="check">
					<input type="checkbox" checked={ge.enabled} onchange={() => setGem({ [`enableGlobal${ge.index}`]: !ge.enabled })} />
					{ge.name} effect
				</label>
			{/each}
		{/if}
		{#if gem.errMsg}<p class="errline"><PobText text={gem.errMsg} /></p>{/if}
		{#if !group.source}
			<div class="actions">
				<button class="btn" onclick={() => moveGem(-1)} disabled={gem.index === 1} aria-label="Move up">↑</button>
				<button class="btn" onclick={() => moveGem(1)} disabled={gem.index === group.gems.length} aria-label="Move down">↓</button>
				<button class="btn" onclick={replaceGem}><Icon name="swap" size={18} /> Replace</button>
				<button class="btn danger" onclick={removeGem}><Icon name="trash" size={18} /> Remove</button>
			</div>
		{/if}
		<div class="tip">
			{#if tooltip}<TooltipView {tooltip} />{:else}<p class="muted">Loading…</p>{/if}
		</div>
	{/if}
</Sheet>

<Sheet bind:open={groupOpen} title={group ? group.label || group.displayLabel || "Socket group" : ""}>
	{#if group}
		<div class="formgrid">
			{#if !group.source}
				<label class="wide">
					<span class="eyebrow">Label</span>
					<input class="field" bind:value={label} placeholder={group.displayLabel} onchange={() => setGroup({ label })} />
				</label>
				{#if skills?.socketSlots}
					<label class="wide">
						<span class="eyebrow">Socketed in</span>
						<select class="field" value={group.slot ?? ""} onchange={(e) => setGroup({ slot: str(e) })}>
							<option value="">None</option>
							{#each skills.socketSlots as s (s.slot)}
								<option value={s.slot}>{s.label}{s.item ? ` — ${stripPobText(s.item)}` : ""}</option>
							{/each}
						</select>
					</label>
				{/if}
			{:else if group.groupCount != null}
				<label>
					<span class="eyebrow">Count</span>
					<input class="field num" type="number" min="1" value={group.groupCount} onchange={(e) => setGroup({ groupCount: num(e) })} />
				</label>
			{/if}
			{#if group.skills.length > 1}
				<label class="wide">
					<span class="eyebrow">Active skill</span>
					<select class="field" value={group.mainActiveSkill || 1} onchange={(e) => setGroup({ mainActiveSkill: num(e) })}>
						{#each group.skills as s (s.index)}<option value={s.index}>{s.name}</option>{/each}
					</select>
				</label>
			{/if}
			{#if main?.parts}
				<label class="wide">
					<span class="eyebrow">Skill part</span>
					<select class="field" value={main.part} onchange={(e) => setOpt({ part: num(e) })}>
						{#each main.parts as p, i (i)}<option value={i + 1}>{p.name}</option>{/each}
					</select>
				</label>
			{/if}
			{#if main?.statSets}
				<label class="wide">
					<span class="eyebrow">Stat set</span>
					<select class="field" value={main.statSet} onchange={(e) => setOpt({ statSet: num(e) })}>
						{#each main.statSets as s, i (i)}<option value={i + 1}>{s}</option>{/each}
					</select>
				</label>
			{/if}
			{#if main?.hasStages}
				<label>
					<span class="eyebrow">Stages</span>
					<input class="field num" type="number" min="0" value={main.stageCount} onchange={(e) => setOpt({ stageCount: num(e) })} />
				</label>
			{/if}
			{#if main?.hasMines}
				<label>
					<span class="eyebrow">Active mines</span>
					<input class="field num" type="number" min="0" value={main.mineCount ?? ""} onchange={(e) => setOpt({ mineCount: num(e) })} />
				</label>
			{/if}
			{#if main?.minions}
				<label class="wide">
					<span class="eyebrow">Minion</span>
					<select class="field" value={main.minion ?? main.minions[0]?.id} onchange={(e) => setOpt({ minionId: str(e) })}>
						{#each main.minions as m (m.id)}<option value={m.id}>{m.name}</option>{/each}
					</select>
				</label>
			{/if}
			{#if main?.minionItemSets}
				<label class="wide">
					<span class="eyebrow">Minion item set</span>
					<select class="field" value={main.minionItemSet ?? ""} onchange={(e) => setOpt({ minionItemSet: num(e) })}>
						{#each main.minionItemSets as m (m.id)}<option value={m.id}>{m.title}</option>{/each}
					</select>
				</label>
			{/if}
			{#if main?.minionSkills}
				<label class="wide">
					<span class="eyebrow">Minion skill</span>
					<select class="field" value={main.minionSkill} onchange={(e) => setOpt({ minionSkill: num(e) })}>
						{#each main.minionSkills as m, i (i)}<option value={i + 1}>{m}</option>{/each}
					</select>
				</label>
			{/if}
		</div>
		<div class="toggles">
			<label class="check"><input type="checkbox" checked={group.enabled} onchange={() => setGroup({ enabled: !group!.enabled })} /> Enabled</label>
			{#if group.skills.length}
				<label class="check"><input type="checkbox" checked={group.includeInFullDPS} onchange={() => setGroup({ includeInFullDPS: !group!.includeInFullDPS })} /> Include in Full DPS</label>
				<label class="check"><input type="checkbox" checked={group.isMainSkill} disabled={group.isMainSkill} onchange={() => setMain(group!)} /> Main skill</label>
			{/if}
		</div>
		<div class="actions">
			<button class="btn" onclick={() => moveGroup(-1)} disabled={group.index === 1} aria-label="Move group up">↑</button>
			<button class="btn" onclick={() => moveGroup(1)} disabled={group.index === skills?.socketGroups.length} aria-label="Move group down">↓</button>
			{#if !group.source}
				<button class="btn" onclick={duplicateGroup}><Icon name="copy" size={18} /> Duplicate</button>
				<button class="btn danger" onclick={deleteGroup}><Icon name="trash" size={18} /> Delete</button>
			{/if}
		</div>
	{/if}
</Sheet>

<GemPicker bind:open={pickerOpen} groupIndex={pickFor?.group ?? null} title={pickFor?.replace != null ? "Replace gem" : "Add gem"} onpick={picked} />

<style>
	.page {
		padding: 12px 14px 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.top {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.spacer {
		flex: 1;
	}
	.center {
		text-align: center;
	}
	.group.off {
		opacity: var(--fade, 0.55);
	}
	header {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px 6px 4px;
	}
	.star {
		width: var(--tap);
		height: var(--tap);
		border: 0;
		background: none;
		color: var(--fg-4);
		display: grid;
		place-items: center;
		flex: none;
	}
	.star.main {
		color: var(--c-dps);
	}
	.title {
		flex: 1;
		min-width: 0;
		border: 0;
		background: none;
		text-align: left;
		padding: 0;
		color: inherit;
	}
	.name {
		font-weight: 600;
	}
	.meta {
		font-size: 12px;
		color: var(--fg-2);
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.sockets {
		font-family: var(--mono);
		font-size: 11px;
	}
	.gems {
		display: flex;
		flex-direction: column;
		border-top: 1px solid var(--line-0);
	}
	.gem {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 42px;
		padding: 0 14px;
		background: none;
		border: 0;
		text-align: left;
	}
	.gem + .gem {
		border-top: 1px solid var(--line-0);
	}
	.gem:active {
		background: var(--bg-hover);
	}
	.gem.disabled {
		opacity: 0.45;
		text-decoration: line-through;
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		flex: none;
	}
	.gname {
		flex: 1;
		min-width: 0;
		font-size: 14px;
	}
	.gname.support {
		color: var(--fg-1);
	}
	.lv {
		font-size: 12px;
		color: var(--fg-2);
	}
	.err {
		color: var(--warn);
		display: grid;
	}
	.foot {
		display: flex;
		border-top: 1px solid var(--line-0);
	}
	.add,
	.full {
		display: flex;
		align-items: center;
		gap: 8px;
		min-height: 40px;
		padding: 0 14px;
		border: 0;
		background: none;
		font-size: 13px;
		color: var(--fg-2);
	}
	.add {
		flex: 1;
	}
	.full {
		margin-left: auto;
	}
	.box {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		border: 1px solid var(--line-2);
	}
	.box.on {
		background: var(--fg-0);
		border-color: var(--fg-0);
	}
	.controls {
		display: grid;
		grid-template-columns: 1fr 1fr auto;
		gap: 10px;
		margin-bottom: 10px;
		align-items: end;
	}
	.controls label {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}
	.en {
		align-items: center;
	}
	.en .switch {
		margin-bottom: 8px;
	}
	.quick {
		margin-bottom: 8px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 40px;
		font-size: 14px;
	}
	.check input {
		width: 18px;
		height: 18px;
		accent-color: var(--fg-0);
	}
	.toggles {
		margin-top: 8px;
	}
	.errline {
		color: var(--warn);
		font-size: 13px;
	}
	.tip {
		margin-top: 14px;
	}
</style>
