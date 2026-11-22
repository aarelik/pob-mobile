<script lang="ts">
	import Icon from "../components/Icon.svelte";
	import PobText from "../components/PobText.svelte";
	import Sheet from "../components/Sheet.svelte";
	import TooltipView from "../components/TooltipView.svelte";
	import type { Gem, SocketGroup, Skills, Tooltip } from "../engine/types";
	import { app } from "../lib/app.svelte";
	import { stripPobText } from "../lib/pobtext";

	let skills = $state<Skills | null>(null);
	let gemOpen = $state(false);
	let sel = $state<{ group: SocketGroup; gem: Gem } | null>(null);
	let tooltip = $state<Tooltip | null>(null);
	let lvl = $state(20);
	let qual = $state(0);

	$effect(() => {
		void app.rev;
		app.call<Skills>("get_skills").then((r) => (skills = r)).catch((e) => app.notify(e.message, "error"));
	});

	async function openGem(group: SocketGroup, gem: Gem) {
		sel = { group, gem };
		lvl = gem.level;
		qual = gem.quality;
		tooltip = null;
		gemOpen = true;
		tooltip = await app.call<Tooltip>("gem_tooltip", { groupIndex: group.index, gemIndex: gem.index }).catch(() => null);
	}
	async function setGem(patch: Record<string, unknown>) {
		if (!sel) return;
		await app.mutate("set_gem", { groupIndex: sel.group.index, gemIndex: sel.gem.index, ...patch });
		const g = skills?.socketGroups.find((x) => x.index === sel!.group.index);
		const gem = g?.gems.find((x) => x.index === sel!.gem.index);
		if (g && gem) await openGem(g, gem);
	}
	const toggleGroup = (g: SocketGroup) => app.mutate("set_socket_group", { index: g.index, enabled: !g.enabled });
	const toggleFull = (g: SocketGroup) => app.mutate("set_socket_group", { index: g.index, includeInFullDPS: !g.includeInFullDPS });
	const setMain = (g: SocketGroup) => app.mutate("set_main_skill", { index: g.index });
	function grantedLabel(g: SocketGroup): string | null {
		const by = g.grantedBy;
		if (!by) return null;
		return `Granted by ${stripPobText(by.item ?? by.node ?? by.source)}`;
	}
	function stripColor(c: string): string {
		const m = /\^x([0-9a-fA-F]{6})/.exec(c);
		return m ? `#${m[1]}` : "var(--fg-2)";
	}
</script>

<div class="page">
	{#if skills}
		{#each skills.socketGroups as g (g.index)}
			<section class="group card" class:off={!g.enabled || !g.slotEnabled}>
				<header>
					<button class="star" class:main={g.isMainSkill} aria-label="Set as main skill" onclick={() => setMain(g)} disabled={!g.skills.length}>
						<Icon name={g.isMainSkill ? "star-fill" : "star"} size={20} />
					</button>
					<div class="title">
						<div class="name">{g.label || g.displayLabel || "Socket group"}</div>
						<div class="meta">
							{g.slot ?? grantedLabel(g) ?? "No slot"}
							{#if g.itemSockets?.text}<span class="sockets"><PobText text={g.itemSockets.text} /></span>{/if}
						</div>
					</div>
					<button class="switch" role="switch" aria-checked={g.enabled} aria-label="Enabled" onclick={() => toggleGroup(g)}></button>
				</header>
				<div class="gems">
					{#each g.gems as gem (gem.index)}
						<button class="gem" class:disabled={!gem.enabled} onclick={() => openGem(g, gem)}>
							<span class="dot" style:background={gem.color ? stripColor(gem.color) : "var(--fg-3)"}></span>
							<span class="gname" class:support={gem.support}>{gem.name || gem.nameSpec}</span>
							<span class="num lv">{gem.level}/{gem.quality}</span>
							{#if gem.errMsg}<span class="err" title={gem.errMsg}><Icon name="warn" size={16} /></span>{/if}
						</button>
					{/each}
				</div>
				{#if g.skills.length}
					<button class="full" onclick={() => toggleFull(g)}>
						<span class="box" class:on={g.includeInFullDPS}></span> Include in Full DPS
					</button>
				{/if}
			</section>
		{/each}
		{#if !skills.socketGroups.length}<p class="muted center">No skills yet. Import a build to see its gems.</p>{/if}
	{/if}
</div>

<Sheet bind:open={gemOpen} title={sel?.gem.name ?? ""}>
	{#if sel}
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
				<button class="switch" role="switch" aria-checked={sel.gem.enabled} aria-label="Gem enabled" onclick={() => setGem({ enabled: !sel!.gem.enabled })}></button>
			</label>
		</div>
		{#if sel.gem.errMsg}<p class="errline"><PobText text={sel.gem.errMsg} /></p>{/if}
		{#if tooltip}<TooltipView {tooltip} />{:else}<p class="muted">Loading…</p>{/if}
	{/if}
</Sheet>

<style>
	.page {
		padding: 14px 14px 28px;
		display: flex;
		flex-direction: column;
		gap: 10px;
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
	.full {
		display: flex;
		align-items: center;
		gap: 8px;
		width: 100%;
		min-height: 40px;
		padding: 0 14px;
		border: 0;
		border-top: 1px solid var(--line-0);
		background: none;
		font-size: 13px;
		color: var(--fg-2);
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
		margin-bottom: 12px;
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
	.errline {
		color: var(--warn);
		font-size: 13px;
	}
</style>
