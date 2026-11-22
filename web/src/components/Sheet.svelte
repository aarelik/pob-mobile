<script lang="ts">
	// Bottom sheet: the phone's popup. Drag the handle down or tap outside to close.
	import type { Snippet } from "svelte";
	import Icon from "./Icon.svelte";
	let { open = $bindable(false), title = "", children }: { open?: boolean; title?: string; children: Snippet } = $props();
	let startY = 0;
	let dy = $state(0);
	function down(e: PointerEvent) {
		startY = e.clientY;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (startY) dy = Math.max(0, e.clientY - startY);
	}
	function up() {
		if (dy > 90) open = false;
		startY = 0;
		dy = 0;
	}
	$effect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => e.key === "Escape" && (open = false);
		addEventListener("keydown", onKey);
		return () => removeEventListener("keydown", onKey);
	});
</script>

{#if open}
	<div class="backdrop" role="presentation" onclick={() => (open = false)}></div>
	<div class="sheet" role="dialog" aria-modal="true" aria-label={title} style:transform={dy ? `translateY(${dy}px)` : null}>
		<div class="grip" role="presentation" onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}>
			<span></span>
		</div>
		{#if title}
			<header>
				<h2>{title}</h2>
				<button class="icon-btn" aria-label="Close" onclick={() => (open = false)}><Icon name="close" /></button>
			</header>
		{/if}
		<div class="body scroll">{@render children()}</div>
	</div>
{/if}

<style>
	.backdrop {
		position: fixed;
		inset: 0;
		background: var(--backdrop);
		z-index: 40;
		animation: fade 0.15s ease-out;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		max-height: calc(100dvh - var(--safe-top) - 24px);
		display: flex;
		flex-direction: column;
		background: var(--bg-1);
		border-top: 1px solid var(--line-1);
		border-radius: 16px 16px 0 0;
		box-shadow: var(--shadow-sheet);
		z-index: 41;
		padding-bottom: var(--safe-bottom);
		animation: rise 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
		max-width: 720px;
		margin: 0 auto;
	}
	.grip {
		display: grid;
		place-items: center;
		height: 22px;
		touch-action: none;
		flex: none;
	}
	.grip span {
		width: 38px;
		height: 4px;
		border-radius: 2px;
		background: var(--line-2);
	}
	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 8px 4px 18px;
		flex: none;
	}
	h2 {
		margin: 0;
		font-size: 17px;
		font-weight: 600;
	}
	.body {
		padding: 4px 18px 20px;
		min-height: 0;
	}
	@keyframes rise {
		from {
			transform: translateY(40px);
			opacity: 0.4;
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>
