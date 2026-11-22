<script lang="ts">
	import Icon from "./components/Icon.svelte";
	import Sheet from "./components/Sheet.svelte";
	import StatStrip from "./components/StatStrip.svelte";
	import { app, type Tab } from "./lib/app.svelte";
	import Boot from "./views/Boot.svelte";
	import Builds from "./views/Builds.svelte";
	import Config from "./views/Config.svelte";
	import Items from "./views/Items.svelte";
	import Notes from "./views/Notes.svelte";
	import Overview from "./views/Overview.svelte";
	import Skills from "./views/Skills.svelte";
	import Stats from "./views/Stats.svelte";

	const TABS: { id: Tab; label: string; icon: string }[] = [
		{ id: "overview", label: "Overview", icon: "overview" },
		{ id: "skills", label: "Skills", icon: "skills" },
		{ id: "items", label: "Items", icon: "items" },
		{ id: "config", label: "Config", icon: "config" },
		{ id: "stats", label: "Calcs", icon: "stats" },
	];

	let shareOpen = $state(false);
	let code = $state("");
	let renameOpen = $state(false);
	let newName = $state("");
	let scroller = $state<HTMLElement | null>(null);

	async function openShare() {
		shareOpen = true;
		code = "";
		code = await app.exportCode();
	}
	async function copyCode() {
		try {
			await navigator.clipboard.writeText(code);
			app.notify("Build code copied");
		} catch {
			app.notify("Copy failed; select the code and copy it", "error");
		}
	}
	async function shareCode() {
		try {
			await navigator.share({ title: app.build?.name, text: code });
		} catch {
			/* dismissed */
		}
	}
	async function rename() {
		const name = newName.trim();
		if (!name) return;
		await app.mutate("set_build_name", { name });
		renameOpen = false;
	}
	function go(tab: Tab) {
		if (app.tab === tab) scroller?.scrollTo({ top: 0, behavior: "smooth" });
		app.tab = tab;
	}
	$effect(() => {
		void app.tab;
		scroller?.scrollTo({ top: 0 });
	});
</script>

{#if app.phase !== "ready"}
	<Boot />
{:else if app.screen === "builds" || !app.build}
	<div class="scroll fill"><Builds /></div>
{:else}
	{@const b = app.build}
	<div class="shell">
		<header>
			<button class="icon-btn" aria-label="All builds" onclick={() => app.closeBuild()}><Icon name="back" /></button>
			<button class="title" onclick={() => ((newName = b.name), (renameOpen = true))}>
				<span class="name">{b.name}</span>
				<span class="sub">{b.ascendClassName || b.className} · Level {b.level}{app.saving ? " · saving…" : ""}</span>
			</button>
			<button class="icon-btn" aria-label="Share build code" onclick={openShare}><Icon name="share" /></button>
		</header>
		<StatStrip />
		<main class="scroll" bind:this={scroller}>
			{#if app.tab === "overview"}<Overview />
			{:else if app.tab === "skills"}<Skills />
			{:else if app.tab === "items"}<Items />
			{:else if app.tab === "config"}<Config />
			{:else if app.tab === "stats"}<Stats />
			{:else if app.tab === "notes"}<Notes />{/if}
		</main>
		<nav>
			{#each TABS as t (t.id)}
				<button class:active={app.tab === t.id} onclick={() => go(t.id)} aria-current={app.tab === t.id ? "page" : undefined}>
					<Icon name={t.icon} size={22} />
					<span>{t.label}</span>
				</button>
			{/each}
		</nav>
	</div>
{/if}

{#if app.busy > 0 || app.lazyLoading}
	<div class="busy" aria-live="polite">{app.lazyLoading ? "Loading tree data…" : "Calculating…"}</div>
{/if}
{#if app.toast}
	<div class="toast" class:error={app.toast.kind === "error"} role="status">{app.toast.text}</div>
{/if}

<Sheet bind:open={shareOpen} title="Share build">
	<p class="muted" style="margin-top:0;font-size:13px">A Path of Building code. Paste it into Path of Building, pobb.in or PoB Mobile.</p>
	<textarea class="field" rows="5" readonly value={code || "Encoding…"}></textarea>
	<div class="row2">
		<button class="btn" onclick={copyCode} disabled={!code}><Icon name="copy" size={18} /> Copy</button>
		{#if "share" in navigator}<button class="btn primary" onclick={shareCode} disabled={!code}><Icon name="share" size={18} /> Share</button>{/if}
	</div>
</Sheet>

<Sheet bind:open={renameOpen} title="Rename build">
	<input class="field" bind:value={newName} onkeydown={(e) => e.key === "Enter" && rename()} />
	<div class="row2">
		<button class="btn" onclick={() => ((renameOpen = false), (app.tab = "notes"))}><Icon name="notes" size={18} /> Notes</button>
		<button class="btn primary" onclick={rename}>Save name</button>
	</div>
</Sheet>

<style>
	.fill {
		height: 100%;
	}
	.shell {
		height: 100%;
		display: grid;
		grid-template-rows: auto auto 1fr auto;
		max-width: 900px;
		margin: 0 auto;
	}
	header {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: calc(var(--safe-top) + 4px) 4px 4px;
		background: var(--bg-0);
	}
	.title {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		background: none;
		border: 0;
		padding: 2px 6px;
		text-align: left;
	}
	.name {
		font-weight: 600;
		font-size: 16px;
		max-width: 100%;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}
	.sub {
		font-size: 12px;
		color: var(--fg-2);
	}
	main {
		min-height: 0;
	}
	nav {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		border-top: 1px solid var(--line-0);
		background: var(--bg-1);
		padding-bottom: var(--safe-bottom);
	}
	nav button {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		height: var(--nav-h);
		border: 0;
		background: none;
		color: var(--fg-3);
		font-size: 11px;
		font-weight: 500;
	}
	nav button.active {
		color: var(--fg-0);
	}
	.busy {
		position: fixed;
		top: calc(var(--safe-top) + 8px);
		left: 50%;
		transform: translateX(-50%);
		padding: 6px 12px;
		border-radius: 20px;
		background: var(--bg-3);
		border: 1px solid var(--line-1);
		font-size: 12px;
		color: var(--fg-1);
		z-index: 30;
		pointer-events: none;
		animation: show 0.3s 0.25s both;
	}
	@keyframes show {
		from {
			opacity: 0;
		}
	}
	.toast {
		position: fixed;
		left: 16px;
		right: 16px;
		bottom: calc(var(--nav-h) + var(--safe-bottom) + 12px);
		max-width: 480px;
		margin: 0 auto;
		padding: 12px 14px;
		border-radius: var(--radius);
		background: var(--fg-0);
		color: var(--bg-0);
		font-size: 14px;
		z-index: 50;
		box-shadow: var(--shadow-sheet);
	}
	.toast.error {
		background: var(--bad);
		color: #1a0b0b;
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-top: 12px;
	}
</style>
