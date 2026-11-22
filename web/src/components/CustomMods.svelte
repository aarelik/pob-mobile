<script lang="ts">
	// PoB's custom modifiers (Config tab): groups of mod lines added to the
	// build, each line checked against PoB's mod parser as you type. The
	// browser lists every line PoB understands, from the tree and item mods.
	import Icon from "./Icon.svelte";
	import Sheet from "./Sheet.svelte";
	import { app } from "../lib/app.svelte";

	interface Block {
		index: number;
		title: string | null;
		enabled: boolean;
		text: string;
		lines: { text: string; status: "ok" | "partial" | "none" | "empty" }[];
	}
	let blocks = $state<Block[]>([]);
	let drafts = $state<Record<number, string>>({});
	let browseFor = $state<number | null>(null);
	let browseOpen = $state(false);
	let mods = $state<{ text: string; sources: string[] }[]>([]);
	let q = $state("");

	$effect(() => {
		void app.rev;
		app.call<{ blocks: Block[] }>("get_custom_mods").then((r) => {
			blocks = r.blocks;
			drafts = Object.fromEntries(r.blocks.map((b) => [b.index, b.text]));
		});
	});
	const set = (b: Block, patch: Record<string, unknown>) => app.mutate("set_custom_mod_block", { index: b.index, ...patch });
	async function browse(b: Block) {
		browseFor = b.index;
		browseOpen = true;
		if (!mods.length) mods = (await app.call<{ mods: typeof mods }>("custom_mod_browser")).mods;
	}
	const hits = $derived.by(() => {
		const words = q.toLowerCase().split(/\s+/).filter(Boolean);
		if (!words.length) return mods.slice(0, 60);
		return mods.filter((m) => words.every((w) => m.text.toLowerCase().includes(w))).slice(0, 80);
	});
	function addLine(text: string) {
		const b = blocks.find((x) => x.index === browseFor);
		if (!b) return;
		const cur = (drafts[b.index] ?? "").replace(/\s+$/, "");
		set(b, { text: cur ? `${cur}\n${text}` : text });
		browseOpen = false;
	}
	const STATUS = { ok: "Understood", partial: "Partly understood", none: "Not understood", empty: "" };
</script>

<h2 class="eyebrow cm">Custom modifiers</h2>
<p class="muted small">Lines here are added to the build as if they came from an item, e.g. <i>+500 to maximum Life</i>.</p>
{#each blocks as b (b.index)}
	<section class="card blk" class:off={!b.enabled}>
		<header>
			<input class="field ttl" value={b.title ?? ""} placeholder="Group" onchange={(e) => set(b, { title: (e.currentTarget as HTMLInputElement).value })} />
			<button class="switch" role="switch" aria-checked={b.enabled} aria-label="Group enabled" onclick={() => set(b, { enabled: !b.enabled })}></button>
			{#if blocks.length > 1}
				<button class="icon-btn" aria-label="Delete group" onclick={() => confirm("Delete this group of modifiers?") && app.mutate("delete_custom_mod_block", { index: b.index })}><Icon name="trash" size={18} /></button>
			{/if}
		</header>
		<textarea
			class="field mono"
			rows={Math.max(3, (drafts[b.index] ?? "").split("\n").length + 1)}
			bind:value={drafts[b.index]}
			onchange={() => set(b, { text: drafts[b.index] })}
			placeholder="One modifier per line"
			autocapitalize="off"
			spellcheck="false"
		></textarea>
		{#if b.lines.some((l) => l.status === "none" || l.status === "partial")}
			<ul class="bad">
				{#each b.lines.filter((l) => l.status === "none" || l.status === "partial") as l, i (i)}
					<li><span class:part={l.status === "partial"}>{STATUS[l.status]}:</span> {l.text}</li>
				{/each}
			</ul>
		{/if}
		<button class="btn ghost" onclick={() => browse(b)}><Icon name="search" size={16} /> Browse modifiers</button>
	</section>
{/each}
<button class="btn block" onclick={() => app.mutate("add_custom_mod_block", {})}><Icon name="plus" size={18} /> New group</button>

<Sheet bind:open={browseOpen} title="Modifiers PoB understands">
	<input class="field" type="search" placeholder="Search, e.g. life regen" bind:value={q} />
	{#if !mods.length}<p class="muted">Loading…</p>{/if}
	{#each hits as m (m.text)}
		<button class="rowbtn" onclick={() => addLine(m.text)}>
			<span class="grow"><span>{m.text}</span><span class="muted tiny">{m.sources.join(", ")}</span></span>
		</button>
	{/each}
</Sheet>

<style>
	.cm {
		margin: 22px 2px 4px;
	}
	.small {
		font-size: 13px;
		margin: 0 2px 10px;
	}
	.blk {
		padding: 8px 10px 6px;
		margin-bottom: 10px;
	}
	.blk.off {
		opacity: var(--fade-off, 0.55);
	}
	header {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}
	.ttl {
		flex: 1;
		min-height: 36px;
		padding: 6px 10px;
	}
	.mono {
		font-family: var(--mono);
		font-size: 12.5px;
	}
	.bad {
		margin: 6px 0;
		padding-left: 18px;
		font-size: 12px;
		color: var(--fg-2);
	}
	.bad span {
		color: var(--bad);
	}
	.bad span.part {
		color: var(--warn);
	}
	.block {
		display: flex;
		width: 100%;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.tiny {
		display: block;
		font-size: 11px;
	}
</style>
