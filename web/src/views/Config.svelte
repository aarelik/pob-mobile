<script lang="ts">
	// PoB's Configuration tab: the options that apply to this build (PoB's own
	// visibility rules), grouped by section, with search.
	import Icon from "../components/Icon.svelte";
	import PobText from "../components/PobText.svelte";
	import SetPicker from "../components/SetPicker.svelte";
	import CustomMods from "../components/CustomMods.svelte";
	import type { ConfigOption, ConfigState } from "../engine/types";
	import { app } from "../lib/app.svelte";
	import { stripPobText } from "../lib/pobtext";

	let options = $state<ConfigOption[]>([]);
	let visible = $state<Record<string, boolean>>({});
	let cfg = $state<ConfigState>({ config: {}, placeholder: {} });
	let query = $state("");
	$effect(() => {
		if (app.configQuery != null) {
			query = app.configQuery;
			app.configQuery = null;
		}
	});
	let showAll = $state(false);
	let help = $state<string | null>(null);

	$effect(() => {
		app.call<{ options: ConfigOption[] }>("list_config_options").then((r) => (options = r.options));
	});
	$effect(() => {
		void app.rev;
		Promise.all([app.call<{ visibility: Record<string, boolean> }>("config_visibility"), app.call<ConfigState>("get_config")])
			.then(([v, c]) => {
				visible = v.visibility;
				cfg = c;
			})
			.catch((e) => app.notify(e.message, "error"));
	});

	const q = $derived(query.trim().toLowerCase());
	const shown = $derived(
		options.filter((o) => {
			if (!o.type || o.type === "text") return false;
			if (q) return stripPobText(o.label ?? o.var).toLowerCase().includes(q) || (o.section ?? "").toLowerCase().includes(q);
			return showAll || visible[o.var] !== false;
		}),
	);
	const sections = $derived.by(() => {
		const out: { name: string; items: ConfigOption[] }[] = [];
		for (const o of shown) {
			let sec = out[out.length - 1];
			if (!sec || sec.name !== o.section) out.push((sec = { name: o.section, items: [] }));
			sec.items.push(o);
		}
		return out;
	});

	const value = (o: ConfigOption) => cfg.config[o.var];
	const isOn = (o: ConfigOption) => (value(o) ?? o.defaultState) === true;
	const set = (o: ConfigOption, v: unknown) => app.mutate("set_config", { var: o.var, value: v });

	function onNumber(o: ConfigOption, e: Event) {
		const raw = (e.currentTarget as HTMLInputElement).value.trim();
		set(o, raw === "" ? null : Number(raw));
	}
	function onList(o: ConfigOption, e: Event) {
		const i = Number((e.currentTarget as HTMLSelectElement).value);
		const v = o.list?.[i]?.val;
		set(o, v === o.defaultState ? null : v);
	}
	function listIndex(o: ConfigOption): number {
		const v = value(o) ?? o.defaultState;
		const i = o.list?.findIndex((e) => e.val === v) ?? -1;
		return i < 0 ? 0 : i;
	}
</script>

<div class="page">
	<div class="sets"><SetPicker kind="config" /></div>
	<div class="search">
		<Icon name="search" size={18} />
		<input class="field" type="search" placeholder="Search options" bind:value={query} />
	</div>
	{#if !q}
		<button class="all" onclick={() => (showAll = !showAll)}>
			<span class="box" class:on={showAll}></span> Show options that do not apply to this build
		</button>
	{/if}

	{#each sections as sec (sec.name)}
		<h2 class="eyebrow">{sec.name}</h2>
		<div class="list card">
			{#each sec.items as o (o.var)}
				<div class="opt" class:dim={visible[o.var] === false}>
					<div class="lbl">
						<PobText text={o.label ?? o.var} />
						{#if o.tooltip}<button class="info" aria-label="About this option" onclick={() => (help = help === o.var ? null : o.var)}><Icon name="info" size={16} /></button>{/if}
					</div>
					<div class="ctl">
						{#if o.type === "check"}
							<button class="switch" role="switch" aria-checked={isOn(o)} aria-label={stripPobText(o.label)} onclick={() => set(o, isOn(o) ? null : true)}></button>
						{:else if o.type === "list" && o.list}
							<select class="field sel" value={listIndex(o)} onchange={(e) => onList(o, e)}>
								{#each o.list as e, i (i)}<option value={i}>{stripPobText(e.label)}</option>{/each}
							</select>
						{:else}
							<input
								class="field numf num"
								type="number"
								inputmode="decimal"
								value={value(o) ?? ""}
								placeholder={String(cfg.placeholder[o.var] ?? o.defaultState ?? "")}
								onchange={(e) => onNumber(o, e)}
							/>
						{/if}
					</div>
					{#if help === o.var && o.tooltip}<div class="help"><PobText text={o.tooltip} /></div>{/if}
				</div>
			{/each}
		</div>
	{/each}
	{#if !sections.length && options.length}<p class="muted center">No options match.</p>{/if}
	{#if !query.trim()}<CustomMods />{/if}
</div>

<style>
	.sets {
		margin-bottom: 10px;
	}
	.page {
		padding: 12px 14px 28px;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
		color: var(--fg-3);
	}
	.search :global(svg) {
		position: absolute;
		left: 12px;
	}
	.search input {
		padding-left: 38px;
	}
	.all {
		display: flex;
		align-items: center;
		gap: 8px;
		background: none;
		border: 0;
		color: var(--fg-2);
		font-size: 13px;
		padding: 10px 2px;
		min-height: 40px;
	}
	.box {
		width: 16px;
		height: 16px;
		border-radius: 4px;
		border: 1px solid var(--line-2);
		flex: none;
	}
	.box.on {
		background: var(--fg-0);
		border-color: var(--fg-0);
	}
	h2 {
		margin: 14px 2px 6px;
	}
	.opt {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 6px 12px;
		align-items: center;
		padding: 8px 12px;
		min-height: 52px;
	}
	.opt.dim {
		opacity: 0.55;
	}
	.lbl {
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.info {
		border: 0;
		background: none;
		color: var(--fg-3);
		width: 32px;
		height: 32px;
		display: grid;
		place-items: center;
		flex: none;
	}
	.ctl {
		justify-self: end;
	}
	.sel {
		max-width: 170px;
		min-height: 38px;
		padding: 6px 8px;
		font-size: 14px;
	}
	.numf {
		width: 96px;
		min-height: 38px;
		padding: 6px 8px;
		text-align: right;
	}
	.help {
		grid-column: 1 / -1;
		font-size: 13px;
		color: var(--fg-2);
		white-space: pre-line;
	}
	.center {
		text-align: center;
	}
</style>
