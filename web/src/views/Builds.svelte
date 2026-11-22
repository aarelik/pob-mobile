<script lang="ts">
	import Icon from "../components/Icon.svelte";
	import Sheet from "../components/Sheet.svelte";
	import { app } from "../lib/app.svelte";
	import { fmtBig, timeAgo } from "../lib/format";
	import type { SavedBuild } from "../lib/storage";
	import { backupAll, restoreFiles } from "../lib/backup";
	import { characterJson, fetchCharacter, listCharacters, REALMS, relay, SUPPORTED_SITES, type CharacterEntry } from "../lib/net";
	import { applyTheme, currentTheme, THEMES } from "../lib/theme";
	import { checkUpstream, type UpstreamInfo } from "../lib/upstream";

	let importMode = $state<"code" | "account">("code");
	let accountName = $state(localStorage.getItem("pob-mobile:account") ?? "");
	let realm = $state("pc");
	let chars = $state<CharacterEntry[]>([]);
	let realAccount = $state("");
	let league = $state("");
	let charName = $state("");
	let passivesText = $state("");
	let itemsText = $state("");
	const leagues = $derived([...new Set(chars.map((c) => c.league))]);
	const shownChars = $derived(chars.filter((c) => !league || c.league === league));

	let settingsOpen = $state(false);
	let relayUrl = $state(relay.get());
	let savedRelay = $state(relay.get());
	const hasRelay = $derived(!!savedRelay);
	let theme = $state(currentTheme());
	let upstream = $state<UpstreamInfo | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);

	async function findCharacters() {
		importError = null;
		importing = true;
		try {
			localStorage.setItem("pob-mobile:account", accountName.trim());
			const r = await listCharacters(accountName, realm);
			chars = r.characters.sort((a, b) => b.level - a.level);
			realAccount = r.account;
			league = leagues[0] ?? "";
		} catch (e) {
			importError = e instanceof Error ? e.message : String(e);
		} finally {
			importing = false;
		}
	}
	async function importChar(c: CharacterEntry) {
		importError = null;
		importing = true;
		try {
			const data = await fetchCharacter(realAccount, c, realm);
			await app.importCharacter(data, c.name);
			importOpen = false;
		} catch (e) {
			importError = e instanceof Error ? e.message : String(e);
		} finally {
			importing = false;
		}
	}
	const pageUrl = (kind: string) =>
		`https://www.pathofexile.com/character-window/${kind}?accountName=${encodeURIComponent(accountName.trim().replace(/(.*)[#-]/, "$1#"))}&character=${encodeURIComponent(charName.trim())}&realm=${realm}`;
	async function importPasted() {
		importError = null;
		importing = true;
		try {
			const data = characterJson(passivesText, itemsText, charName.trim() ? { name: charName.trim() } : undefined);
			await app.importCharacter(data, charName.trim() || "Imported character");
			importOpen = false;
		} catch (e) {
			importError = e instanceof Error ? `Could not read that: ${e.message}` : String(e);
		} finally {
			importing = false;
		}
	}
	function openSettings() {
		settingsOpen = true;
		relayUrl = relay.get();
		if (!upstream) checkUpstream().then((u) => (upstream = u));
	}
	function saveRelay() {
		relay.set(relayUrl);
		relayUrl = relay.get();
		savedRelay = relayUrl;
		app.notify(relayUrl ? "Relay saved" : "Relay removed");
	}
	function pickTheme(id: string) {
		theme = id;
		applyTheme(id);
	}
	async function backup() {
		const n = await backupAll();
		app.notify(`Backed up ${n} build${n === 1 ? "" : "s"}`);
	}
	async function restore(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = input.files;
		if (!files?.length) return;
		try {
			const n = await restoreFiles(files);
			await app.reloadSaved();
			app.notify(`Added ${n} build${n === 1 ? "" : "s"}`);
		} catch (err) {
			app.notify(err instanceof Error ? err.message : String(err), "error");
		}
		input.value = "";
	}

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
		<div class="hdr">
			<button class="icon-btn" aria-label="Settings" onclick={openSettings}><Icon name="config" /></button>
			{#if app.build && app.currentId}
				<button class="btn ghost" onclick={() => (app.screen = "build")}>Back <Icon name="chevron" size={18} /></button>
			{/if}
		</div>
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
	<div class="seg">
		<button class:on={importMode === "code"} onclick={() => ((importMode = "code"), (importError = null))}>Code or link</button>
		<button class:on={importMode === "account"} onclick={() => ((importMode = "account"), (importError = null))}>From my account</button>
	</div>
	{#if importMode === "code"}
		<p class="muted small" style="margin-top:0">Paste a Path of Building code, build XML, or a link from {SUPPORTED_SITES}.</p>
		<textarea class="field" rows="6" bind:value={importText} placeholder="eNrtfWl3..." autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
		{#if importError}<p class="err small">{importError}</p>{/if}
		<div class="row2">
			<button class="btn" onclick={paste}>Paste</button>
			<button class="btn primary" disabled={importing || !importText.trim()} onclick={doImport}>{importing ? "Importing…" : "Import"}</button>
		</div>
	{:else}
		<div class="acct">
			<input class="field" placeholder="Account name, e.g. Name#1234" bind:value={accountName} autocapitalize="off" autocomplete="off" spellcheck="false" />
			<select class="field" bind:value={realm}>
				{#each REALMS as r (r.code)}<option value={r.code}>{r.label}</option>{/each}
			</select>
		</div>
		{#if hasRelay}
			<button class="btn primary block" disabled={importing || !accountName.trim()} onclick={findCharacters}>{importing ? "Working…" : "Find characters"}</button>
			{#if importError}<p class="err small">{importError}</p>{/if}
			{#if chars.length}
				{#if leagues.length > 1}
					<div class="chips lg">
						{#each leagues as l (l)}<button class="chip" class:on={league === l} onclick={() => (league = l)}>{l}</button>{/each}
					</div>
				{/if}
				<div class="list card">
					{#each shownChars as c (c.name)}
						<button class="menu-item" disabled={importing} onclick={() => importChar(c)}>
							<span class="grow"><b>{c.name}</b><span class="muted small block">{c.class} {c.level} · {c.league}</span></span>
							<Icon name="import" size={18} />
						</button>
					{/each}
				</div>
			{/if}
			<p class="muted small">Your profile's Characters tab must be public on pathofexile.com.</p>
		{:else}
			<p class="muted small">
				pathofexile.com doesn't let other websites read it, so without a relay (Settings) this takes three steps. Make your profile's Characters tab public, then:
			</p>
			<input class="field" placeholder="Character name" bind:value={charName} autocapitalize="off" autocomplete="off" spellcheck="false" />
			{#if accountName.trim() && charName.trim()}
				<ol class="steps small">
					<li>Open <a href={pageUrl("get-passive-skills")} target="_blank" rel="noopener">your passive tree page</a>, select all, copy, and paste below.</li>
					<li>Open <a href={pageUrl("get-items")} target="_blank" rel="noopener">your items page</a>, copy it the same way.</li>
				</ol>
				<textarea class="field" rows="3" placeholder="Passive tree page" bind:value={passivesText} autocapitalize="off" spellcheck="false"></textarea>
				<textarea class="field" rows="3" placeholder="Items page" bind:value={itemsText} autocapitalize="off" spellcheck="false"></textarea>
				{#if importError}<p class="err small">{importError}</p>{/if}
				<button class="btn primary block" disabled={importing || !passivesText.trim() || !itemsText.trim()} onclick={importPasted}>{importing ? "Importing…" : "Import character"}</button>
			{/if}
		{/if}
	{/if}
</Sheet>

<Sheet bind:open={settingsOpen} title="Settings">
	<h3 class="eyebrow">Theme</h3>
	<div class="chips">
		{#each THEMES as t (t.id)}<button class="chip" class:on={theme === t.id} onclick={() => pickTheme(t.id)}>{t.label}</button>{/each}
	</div>

	<h3 class="eyebrow">Backup</h3>
	<p class="muted small">Builds live only on this device. Back them up to a file, or add builds from a backup or from desktop Path of Building's .xml files.</p>
	<div class="row2 even">
		<button class="btn" onclick={backup}>Back up all</button>
		<button class="btn" onclick={() => fileInput?.click()}>Restore or add…</button>
	</div>
	<input bind:this={fileInput} type="file" accept=".json,.xml,application/json,application/xml,text/xml" multiple hidden onchange={restore} />

	<h3 class="eyebrow">Relay</h3>
	<p class="muted small">
		Optional. Lets the app import from your Path of Exile account and open poe.ninja, Maxroll and Mobalytics links. It is a small Cloudflare Worker you deploy yourself; see the relay folder in the app's GitHub repository.
	</p>
	<div class="row2 relay">
		<input class="field" placeholder="https://pob-relay.you.workers.dev" bind:value={relayUrl} autocapitalize="off" autocomplete="off" spellcheck="false" />
		<button class="btn" onclick={saveRelay}>Save</button>
	</div>

	<h3 class="eyebrow">About</h3>
	<p class="small">
		Path of Building {app.pobVersion} (upstream commit {app.upstreamCommit.slice(0, 10)}).
		{#if upstream?.newer}
			<br /><span class="warn">Path of Building {upstream.latest} is out.</span> The app moves to it when its repository's update workflow runs (or its pinned commit is changed in pob.json).
		{:else if upstream}
			<br /><span class="muted">That is the latest upstream release ({upstream.latest}).</span>
		{/if}
	</p>
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
	.hdr {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.seg {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 3px;
		padding: 3px;
		background: var(--bg-0);
		border-radius: var(--radius-sm);
		margin-bottom: 12px;
	}
	.seg button {
		min-height: 36px;
		border: 0;
		border-radius: 5px;
		background: none;
		color: var(--fg-2);
	}
	.seg button.on {
		background: var(--bg-3);
		color: var(--fg-0);
	}
	.acct {
		display: grid;
		grid-template-columns: 1fr 110px;
		gap: 8px;
		margin-bottom: 10px;
	}
	.acct + .btn,
	.steps + textarea,
	textarea + textarea,
	textarea + .btn,
	input + .steps {
		margin-top: 8px;
	}
	.steps {
		padding-left: 20px;
	}
	.steps a {
		color: var(--focus);
	}
	.lg {
		margin: 12px 0 8px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.block {
		display: block;
	}
	h3.eyebrow {
		margin: 18px 0 8px;
	}
	.row2.even {
		grid-template-columns: 1fr 1fr;
	}
	.row2.relay {
		grid-template-columns: 1fr auto;
	}
	.warn {
		color: var(--warn);
	}
</style>
