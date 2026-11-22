<script lang="ts">
	// PoB's Party tab: buffs from support players. Paste a support build's code
	// (exported with "Export support" on), or edit each list by hand.
	import Icon from "./Icon.svelte";
	import PobText from "./PobText.svelte";
	import { app } from "../lib/app.svelte";

	type Kind = "auras" | "curses" | "warcries" | "links" | "partyMemberStats" | "enemyConditions" | "enemyMods";
	interface Party {
		enableExportBuffs: boolean;
		[k: string]: { text: string; summary: string } | boolean | unknown;
	}
	const KINDS: { id: Kind; label: string }[] = [
		{ id: "auras", label: "Auras" },
		{ id: "curses", label: "Curses" },
		{ id: "warcries", label: "Warcries" },
		{ id: "links", label: "Link skills" },
		{ id: "partyMemberStats", label: "Party member stats" },
		{ id: "enemyConditions", label: "Enemy conditions" },
		{ id: "enemyMods", label: "Enemy modifiers" },
	];

	let party = $state<Party | null>(null);
	let code = $state("");
	let append = $state(false);
	let editing = $state<Kind | null>(null);
	let draft = $state("");

	$effect(() => {
		void app.rev;
		app.call<Party>("get_party").then((p) => (party = p)).catch(() => {});
	});
	const entry = (k: Kind) => party?.[k] as { text: string; summary: string } | undefined;
	async function importCode() {
		await app.mutate("party_import", { code: code.trim(), append });
		code = "";
		app.notify("Party buffs imported");
	}
	function edit(k: Kind) {
		editing = k;
		draft = entry(k)?.text ?? "";
	}
	async function saveEdit() {
		if (!editing) return;
		await app.mutate("set_party_text", { kind: editing, text: draft });
		editing = null;
	}
	const any = $derived(KINDS.some((k) => entry(k.id)?.text.trim()));
</script>

<div class="card pad">
	<h3 class="eyebrow">Import a support build</h3>
	<p class="muted small">In the support player's Path of Building, turn on <b>Export support</b> (Party tab), then share its build code and paste it here.</p>
	<textarea class="field" rows="3" bind:value={code} placeholder="Support build code" autocapitalize="off" spellcheck="false"></textarea>
	<div class="row">
		<label class="check"><input type="checkbox" bind:checked={append} /> Add to what's here</label>
		<button class="btn primary" disabled={!code.trim()} onclick={importCode}>Import</button>
	</div>
</div>

{#if party}
	<label class="check exp">
		<input type="checkbox" checked={party.enableExportBuffs} onchange={() => app.mutate("party_set_export", { enabled: !party!.enableExportBuffs })} />
		Export support: include this build's buffs in its share code
	</label>
	{#each KINDS as k (k.id)}
		{@const e = entry(k.id)}
		<section class="card kind">
			<header>
				<span class="eyebrow">{k.label}</span>
				<button class="icon-btn" aria-label={`Edit ${k.label}`} onclick={() => edit(k.id)}><Icon name="edit" size={18} /></button>
			</header>
			{#if editing === k.id}
				<textarea class="field mono" rows="6" bind:value={draft} autocapitalize="off" spellcheck="false"></textarea>
				<div class="row">
					<button class="btn" onclick={() => (editing = null)}>Cancel</button>
					<button class="btn primary" onclick={saveEdit}>Save</button>
				</div>
			{:else if e?.summary?.replace(/\^7|-|\s/g, "")}
				<div class="sum small"><PobText text={e.summary} /></div>
			{:else if e?.text.trim()}
				<pre class="sum small">{e.text}</pre>
			{:else}
				<p class="muted small none">None</p>
			{/if}
		</section>
	{/each}
	{#if any}
		<div class="row">
			<button class="btn" onclick={() => app.mutate("party_disable")}>Turn effects off</button>
			<button class="btn" onclick={() => app.mutate("party_rebuild")}>Turn back on</button>
			<button class="btn danger" onclick={() => confirm("Clear all party buffs?") && app.mutate("party_clear")}>Clear</button>
		</div>
	{/if}
{/if}

<style>
	.pad {
		padding: 12px 14px;
		margin-bottom: 12px;
	}
	.row {
		display: flex;
		gap: 8px;
		align-items: center;
		justify-content: space-between;
		margin-top: 8px;
		flex-wrap: wrap;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
	}
	.exp {
		margin: 0 2px 12px;
	}
	.kind {
		padding: 4px 12px 10px;
		margin-bottom: 8px;
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.sum {
		white-space: pre-wrap;
		font-family: inherit;
		margin: 0;
	}
	.small {
		font-size: 13px;
	}
	.none {
		margin: 0;
	}
	.mono {
		font-family: var(--mono);
		font-size: 12px;
	}
	h3.eyebrow {
		margin: 0 0 6px;
	}
</style>
