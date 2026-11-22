<script lang="ts">
	import { app } from "../lib/app.svelte";
	const LABEL: Record<string, string> = {
		manifest: "Checking for updates",
		data: "Downloading Path of Building data",
		engine: "Downloading the engine",
		unpack: "Unpacking",
		boot: "Starting Path of Building",
	};
	const pct = $derived(app.progress.total > 1 ? Math.min(100, (app.progress.loaded / app.progress.total) * 100) : null);
	const mb = (n: number) => (n / 1048576).toFixed(1);
</script>

<div class="boot">
	<div class="mark" aria-hidden="true">
		<svg viewBox="0 0 64 64" width="64" height="64"><path d="M32 6 54 19v26L32 58 10 45V19Z" fill="none" stroke="currentColor" stroke-width="2.5" /><circle cx="32" cy="32" r="6" fill="var(--c-unique)" /></svg>
	</div>
	<h1>PoB Mobile</h1>
	{#if app.phase === "error"}
		<p class="err">Path of Building could not start.</p>
		<pre>{app.error}</pre>
		<button class="btn" onclick={() => location.reload()}>Try again</button>
	{:else}
		<p class="muted">{LABEL[app.progress.phase] ?? "Loading"}…</p>
		<div class="bar"><span style:width={pct == null ? "35%" : `${pct}%`} class:indeterminate={pct == null}></span></div>
		{#if pct != null && app.progress.phase === "data"}
			<p class="num small muted">{mb(app.progress.loaded)} / {mb(app.progress.total)} MB · only the first time</p>
		{/if}
	{/if}
</div>

<style>
	.boot {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 10px;
		padding: 24px;
		text-align: center;
	}
	.mark {
		color: var(--fg-1);
		margin-bottom: 4px;
	}
	h1 {
		margin: 0;
		font-size: 22px;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	p {
		margin: 0;
	}
	.small {
		font-size: 12px;
	}
	.bar {
		width: min(280px, 80%);
		height: 4px;
		border-radius: 2px;
		background: var(--bg-3);
		overflow: hidden;
		margin-top: 8px;
	}
	.bar span {
		display: block;
		height: 100%;
		background: var(--fg-0);
		transition: width 0.2s;
	}
	.bar span.indeterminate {
		animation: slide 1.1s ease-in-out infinite;
	}
	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(300%);
		}
	}
	.err {
		color: var(--bad);
	}
	pre {
		max-width: 100%;
		white-space: pre-wrap;
		font-size: 12px;
		color: var(--fg-2);
		text-align: left;
	}
</style>
