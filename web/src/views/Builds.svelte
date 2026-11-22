<script lang="ts">
	import Icon from "../components/Icon.svelte";
	import Sheet from "../components/Sheet.svelte";
	import { app } from "../lib/app.svelte";
	import { fmtBig, timeAgo } from "../lib/format";
	import type { SavedBuild } from "../lib/storage";

	let importOpen = $state(false);
	let importText = $state("");
	let importing = $state(false);
	let importError = $state<string | null>(null);
	let menuFor = $state<SavedBuild | null>(null);
	let menuOpen = $state(false);

	async function doImport() {
		importing = true;
		importError = null;
		try {
			await app.importBuild(importText);
			importOpen = false;
			importText = "";
		} catch (e) {
			importError = e instanceof Error ? e.message : String(e);
		} finally {
			importing = false;
		}
	}

	async function paste() {
		try {
			importText = await navigator.clipboard.readText();
		} catch {
			importError = "The browser did not allow reading the clipboard; long-press the box and paste.";
		}
	}

	async function open(b: SavedBuild) {
		try {
			await app.openSaved(b.id);
		} catch (e) {
			app.notify(e instanceof Error ? e.message : String(e), "error");
		}
	}
</script>

<div class="page">
	<header>
		<div>
			<h1>Builds</h1>
			<p class="muted small">Path of Building {app.pobVersion} · Path of Exile 1</p>
		</div>
		{#if app.build && app.currentId}
			<button class="btn ghost" onclick={() => (app.screen = "build")}>Back <Icon name="chevron" size={18} /></button>
		{/if}
	</header>

	<div class="actions">
		<button class="btn primary" onclick={() => (importOpen = true)}><Icon name="import" size={20} /> Import</button>
		<button class="btn" onclick={() => app.newBuild()}><Icon name="plus" size={20} /> New build</button>
	</div>

	{#if app.saved.length === 0}
		<div class="empty card">
			<p>No builds yet.</p>
			<p class="muted small">Import a Path of Building code or a pobb.in link, or start a new build. Builds stay on this device.</p>
		</div>
	{:else}
		<div class="list card">
			{#each app.saved as b (b.id)}
				<div class="build" class:current={b.id === app.currentId}>
					<button class="main" onclick={() => open(b)}>
						<div class="name">{b.name}</div>
						<div class="meta">
							<span class="class">{b.summary.ascendancy || b.summary.className} {b.summary.level}</span>
							{#if b.summary.mainSkill}<span>· {b.summary.mainSkill}</span>{/if}
						</div>
						<div class="meta num">
							{#if b.summary.dps}<span class="dps">{fmtBig(b.summary.dps)} DPS</span>{/if}
							{#if b.summary.life}<span class="life">{fmtBig(b.summary.life)} Life</span>{/if}
							{#if b.summary.es}<span class="es">{fmtBig(b.summary.es)} ES</span>{/if}
							<span class="muted">{timeAgo(b.updatedAt)}</span>
						</div>
					</button>
					<button class="icon-btn" aria-label="Build options" onclick={() => ((menuFor = b), (menuOpen = true))}><Icon name="more" /></button>
				</div>
			{/each}
		</div>
	{/if}

	<p class="foot muted small">
		Calculations run Path of Building Community's own code ({app.upstreamCommit.slice(0, 10)}) on your phone. Not affiliated with Grinding Gear Games.
	</p>
</div>

<Sheet bind:open={importOpen} title="Import build">
	<p class="muted small" style="margin-top:0">Paste a Path of Building code, build XML, or a pobb.in link.</p>
	<textarea class="field" rows="6" bind:value={importText} placeholder="eNrtfWl3..." autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
	{#if importError}<p class="err small">{importError}</p>{/if}
	<div class="row2">
		<button class="btn" onclick={paste}>Paste</button>
		<button class="btn primary" disabled={importing || !importText.trim()} onclick={doImport}>{importing ? "Importing…" : "Import"}</button>
	</div>
</Sheet>

<Sheet bind:open={menuOpen} title={menuFor?.name ?? ""}>
	{#if menuFor}
		{@const b = menuFor}
		<div class="list card">
			<button class="menu-item" onclick={() => ((menuOpen = false), open(b))}><Icon name="chevron" /> Open</button>
			<button class="menu-item" onclick={() => ((menuOpen = false), app.duplicate(b.id))}><Icon name="copy" /> Duplicate</button>
			<button
				class="menu-item danger"
				onclick={() => {
					if (confirm(`Delete "${b.name}"? This cannot be undone.`)) {
						menuOpen = false;
						app.remove(b.id);
					}
				}}><Icon name="trash" /> Delete</button
			>
		</div>
	{/if}
</Sheet>

<style>
	.page {
		max-width: 720px;
		margin: 0 auto;
		padding: calc(var(--safe-top) + 16px) 16px calc(var(--safe-bottom) + 24px);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 16px;
	}
	h1 {
		margin: 0;
		font-size: 26px;
		font-weight: 650;
		letter-spacing: -0.02em;
	}
	.small {
		font-size: 13px;
		margin: 2px 0 0;
	}
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px;
		margin-bottom: 18px;
	}
	.empty {
		padding: 20px;
		text-align: center;
	}
	.empty p {
		margin: 4px 0;
	}
	.build {
		display: flex;
		align-items: center;
	}
	.build.current {
		box-shadow: inset 3px 0 0 var(--fg-0);
	}
	.main {
		flex: 1;
		min-width: 0;
		text-align: left;
		background: none;
		border: 0;
		padding: 12px 4px 12px 14px;
	}
	.main:active {
		background: var(--bg-hover);
	}
	.name {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.meta {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 10px;
		font-size: 13px;
		color: var(--fg-2);
		margin-top: 2px;
	}
	.class {
		color: var(--fg-1);
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
	.foot {
		margin-top: 24px;
		text-align: center;
	}
	.err {
		color: var(--bad);
	}
	.row2 {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 10px;
		margin-top: 12px;
	}
	.menu-item {
		display: flex;
		align-items: center;
		gap: 12px;
		min-height: 50px;
		padding: 0 14px;
		background: none;
		border: 0;
		text-align: left;
		width: 100%;
	}
	.menu-item:active {
		background: var(--bg-hover);
	}
	.menu-item.danger {
		color: var(--bad);
	}
</style>
