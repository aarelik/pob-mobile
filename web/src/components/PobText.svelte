<script lang="ts">
	import { parsePobText } from "../lib/pobtext";
	let { text }: { text: string | null | undefined } = $props();
	const spans = $derived(parsePobText(text));
</script>

{#each spans as s, i (i)}<span style:color={s.color || null}>{s.text}</span>{/each}
