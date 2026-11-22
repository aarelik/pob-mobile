<script lang="ts">
	import PobText from "../components/PobText.svelte";
	import { app } from "../lib/app.svelte";

	let text = $state("");
	let editing = $state(false);
	let draft = $state("");

	$effect(() => {
		void app.build?.generation;
		app.call<{ text: string }>("get_notes").then((r) => (text = r.text)).catch(() => {});
	});

	async function save() {
		await app.mutate("set_notes", { text: draft });
		text = draft;
		editing = false;
	}
</script>

<div class="page">
	<div class="bar">
		<h2 class="eyebrow">Notes</h2>
		{#if editing}
			<button class="btn ghost" onclick={() => (editing = false)}>Cancel</button>
			<button class="btn primary" onclick={save}>Save</button>
		{:else}
			<button class="btn" onclick={() => ((draft = text), (editing = true))}>Edit</button>
		{/if}
	</div>
	{#if editing}
		<textarea class="field" rows="18" bind:value={draft}></textarea>
		<p class="muted small">PoB colour codes like ^xFF7700 work here, as in Path of Building.</p>
	{:else if text.trim()}
		<div class="notes card">{#each text.split("\n") as line, i (i)}<div><PobText text={line || " "} /></div>{/each}</div>
	{:else}
		<p class="muted">This build has no notes.</p>
	{/if}
</div>

<style>
	.page {
		padding: 12px 14px 28px;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 10px;
	}
	.bar h2 {
		flex: 1;
		margin: 0;
	}
	.notes {
		padding: 12px 14px;
		font-size: 14px;
		white-space: pre-wrap;
		word-break: break-word;
	}
	.small {
		font-size: 12px;
	}
</style>
