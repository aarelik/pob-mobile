<script lang="ts">
	// Items: equipment by slot. A slot opens a sheet to inspect, edit, unequip,
	// or replace its item: from the build's other items, PoB's unique and
	// template databases, or text copied from the game (Ctrl+C on an item).
	import Icon from "../components/Icon.svelte";
	import Sheet from "../components/Sheet.svelte";
	import TooltipView from "../components/TooltipView.svelte";
	import type { Slot, Tooltip } from "../engine/types";
	import { app } from "../lib/app.svelte";

	const RARITY: Record<string, string> = {
		UNIQUE: "var(--c-unique)",
		RELIC: "var(--c-gem)",
		RARE: "var(--c-rare)",
		MAGIC: "var(--c-magic)",
		NORMAL: "var(--c-normal)",
	};

	interface OwnedItem {
		id: number;
		name: string;
		rarity: string | null;
		compatibleSlots: string[];
		equippedSlot: string | null;
	}
	interface DbItem {
		name: string;
		rarity: string | null;
		type: string;
		baseName: string | null;
		variants: number;
		variantNames: string[];
	}
	type Mode = "view" | "owned" | "unique" | "rare" | "paste" | "edit";

	let slots = $state<Slot[]>([]);
	let items = $state<OwnedItem[]>([]);
	let open = $state(false);
	let sel = $state<Slot | null>(null);
	let mode = $state<Mode>("view");
	let tooltip = $state<Tooltip | null>(null);
	let preview = $state<Tooltip | null>(null);
	let previewError = $state<string | null>(null);
	let text = $state("");
	let query = $state("");
	let db = $state<DbItem[]>([]);
	let dbTotal = $state(0);
	let pick = $state<{ kind: "owned"; id: number } | { kind: "db"; db: string; item: DbItem; variant: number } | null>(null);
	let working = $state(false);
	let dbLoading = $state(false);

	$effect(() => {
		void app.rev;
		Promise.all([app.call<{ slots: Slot[] }>("list_slots"), app.call<{ items: OwnedItem[] }>("get_items")])
			.then(([s, i]) => {
				slots = s.slots;
				items = i.items;
				if (sel) sel = s.slots.find((x) => x.slot === sel!.slot) ?? sel;
			})
			.catch((e) => app.notify(e.message, "error"));
	});

	const visible = $derived(slots.filter((s) => s.shown && !(s.inactive && !s.itemId) && (s.itemId > 0 || !s.slot.includes("Abyssal"))));
	const gear = $derived(visible.filter((s) => !s.slot.startsWith("Flask") && !s.nodeId));
	const flasks = $derived(visible.filter((s) => s.slot.startsWith("Flask")));
	const jewels = $derived(visible.filter((s) => s.nodeId && s.itemId > 0));
	const owned = $derived(sel ? items.filter((i) => i.compatibleSlots.includes(sel!.slot) && i.id !== sel!.itemId) : []);

	async function loadTooltip() {
		tooltip = null;
		if (!sel?.itemId) return;
		tooltip = await app.call<Tooltip>("item_tooltip", { itemId: sel.itemId, slotName: sel.slot }).catch(() => null);
	}
	function show(s: Slot) {
		sel = s;
		mode = s.itemId ? "view" : "owned";
		pick = null;
		preview = null;
		previewError = null;
		open = true;
		loadTooltip();
		if (!s.itemId && !items.some((i) => i.compatibleSlots.includes(s.slot))) setMode("unique");
	}
	function setMode(m: Mode) {
		mode = m;
		pick = null;
		preview = null;
		previewError = null;
		if (m === "unique" || m === "rare") {
			query = "";
			searchDb();
		}
		if (m === "paste") text = "";
		if (m === "edit" && sel?.itemId) {
			text = "";
			app.call<{ raw: string }>("item_raw", { itemId: sel.itemId }).then((r) => {
				text = r.raw;
				previewText();
			});
		}
	}

	// --- previews (PoB's tooltip with "equipping this item will give you") ---
	async function previewOwned(id: number) {
		pick = { kind: "owned", id };
		preview = await app.call<Tooltip>("item_tooltip", { itemId: id, slotName: sel!.slot }).catch(() => null);
	}
	async function previewDb(dbName: string, item: DbItem, variant = 1) {
		pick = { kind: "db", db: dbName, item, variant };
		preview = null;
		try {
			const { raw } = await app.call<{ raw: string }>("item_db_variant_raw", { db: dbName, name: item.name, variant });
			if (pick?.kind === "db" && pick.item === item) preview = await app.call<Tooltip>("item_tooltip", { raw, slotName: sel!.slot });
		} catch (e) {
			app.notify(e instanceof Error ? e.message : String(e), "error");
		}
	}
	let previewTimer: ReturnType<typeof setTimeout>;
	function previewText() {
		clearTimeout(previewTimer);
		previewTimer = setTimeout(async () => {
			previewError = null;
			if (!text.trim()) {
				preview = null;
				return;
			}
			try {
				preview = await app.call<Tooltip>("item_tooltip", { raw: text, slotName: mode === "edit" ? false : sel!.slot });
			} catch (e) {
				preview = null;
				previewError = e instanceof Error ? e.message : String(e);
			}
		}, 250);
	}
	let dbTimer: ReturnType<typeof setTimeout>;
	function searchDb() {
		clearTimeout(dbTimer);
		dbTimer = setTimeout(async () => {
			dbLoading = !db.length;
			const r = await app.call<{ items: DbItem[]; total: number }>("item_db_list", { db: mode === "rare" ? "rare" : "unique", slot: sel!.slot, query, limit: 60 });
			db = r.items;
			dbTotal = r.total;
			dbLoading = false;
		}, 200);
	}
	async function pasteClipboard() {
		try {
			text = await navigator.clipboard.readText();
			previewText();
		} catch {
			app.notify("The browser did not allow reading the clipboard; long-press the box and paste", "error");
		}
	}

	// --- actions ----------------------------------------------------------------
	async function run(fn: () => Promise<unknown>, done: string) {
		working = true;
		try {
			await fn();
			app.notify(done);
			mode = "view";
			pick = null;
			preview = null;
			await loadTooltip();
		} catch {
			/* mutate already reported it */
		} finally {
			working = false;
		}
	}
	function equipPick() {
		const s = sel!.slot;
		const p = pick!;
		if (p.kind === "owned") return run(() => app.mutate("equip_item", { slot: s, itemId: p.id }), "Equipped");
		return run(() => app.mutate("item_db_equip", { db: p.db, name: p.item.name, slotName: s, variant: p.variant }), `Equipped ${p.item.name}`);
	}
	const equipText = () => run(() => app.mutate("equip_item_raw", { text, slot: sel!.slot }), "Item added and equipped");
	const saveEdit = () => run(() => app.mutate("item_edit", { itemId: sel!.itemId, text }), "Item updated");
	const unequip = () => run(() => app.mutate("unequip_item", { slot: sel!.slot }), "Unequipped");
	function remove() {
		if (!sel?.itemId || !confirm(`Delete ${sel.itemName ?? "this item"} from the build?`)) return;
		const id = sel.itemId;
		run(() => app.mutate("delete_item", { itemId: id }), "Item deleted");
	}
	const toggleFlask = (s: Slot & { active?: boolean | null }) => app.mutate("set_slot_active", { slot: s.slot, active: !s.active });

	const TABS: { id: Mode; label: string }[] = [
		{ id: "owned", label: "In build" },
		{ id: "unique", label: "Uniques" },
		{ id: "rare", label: "Templates" },
		{ id: "paste", label: "Paste" },
	];
</script>

{#snippet slotList(list: Slot[], flask = false)}
	<div class="list card">
		{#each list as s (s.slot)}
			<div class="row">
				<button class="slot" onclick={() => show(s)}>
					<span class="label">{s.label || s.slot}</span>
					{#if s.itemId}
						{@const parts = (s.itemName ?? "").split(", ")}
						<span class="item" style:color={RARITY[s.itemRarity ?? ""] ?? null}>
							<span class="iname">{parts[0]}</span>
							{#if parts[1]}<span class="base">{parts.slice(1).join(", ")}</span>{/if}
						</span>
					{:else}
						<span class="item muted add"><Icon name="plus" size={16} /> Add item</span>
					{/if}
				</button>
				{#if flask && s.itemId}
					{@const fs = s as Slot & { active?: boolean | null }}
					<button class="switch" role="switch" aria-checked={!!fs.active} aria-label="Flask active" onclick={() => toggleFlask(fs)}></button>
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

<div class="page">
	<h2 class="eyebrow">Equipment</h2>
	{@render slotList(gear)}
	{#if flasks.length}
		<h2 class="eyebrow">Flasks <span class="hint">switch = active in calculations</span></h2>
		{@render slotList(flasks, true)}
	{/if}
	{#if jewels.length}
		<h2 class="eyebrow">Tree jewels</h2>
		{@render slotList(jewels)}
	{/if}
</div>

<Sheet bind:open title={sel?.label ?? sel?.slot ?? ""}>
	{#if sel}
		{#if mode === "view"}
			<div class="acts">
				<button class="btn primary" onclick={() => setMode(owned.length ? "owned" : "unique")}><Icon name="swap" size={18} /> Change</button>
				<button class="btn" onclick={() => setMode("edit")}><Icon name="edit" size={18} /> Edit</button>
				<button class="btn" onclick={unequip} disabled={working}><Icon name="eject" size={18} /> Unequip</button>
				<button class="btn danger" onclick={remove} aria-label="Delete item" disabled={working}><Icon name="trash" size={18} /></button>
			</div>
			{#if tooltip}<TooltipView {tooltip} />{:else}<p class="muted">Loading…</p>{/if}
		{:else if mode === "edit"}
			<p class="muted small top">Edit the item as text, the way Path of Building's item editor does. The preview updates as you type.</p>
			<textarea class="field" rows="12" bind:value={text} oninput={previewText} autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
			{#if previewError}<p class="err small">{previewError}</p>{/if}
			<div class="two">
				<button class="btn" onclick={() => setMode("view")}>Cancel</button>
				<button class="btn primary" onclick={saveEdit} disabled={working || !preview}>Save changes</button>
			</div>
			{#if preview}<div class="prev"><TooltipView tooltip={preview} /></div>{/if}
		{:else}
			<div class="tabs">
				{#each TABS as t (t.id)}
					<button class:on={mode === t.id} onclick={() => setMode(t.id)}>{t.label}</button>
				{/each}
			</div>

			{#if pick && preview && mode !== "paste"}
				<div class="picked">
					<button class="btn ghost" onclick={() => ((pick = null), (preview = null))}><Icon name="back" size={18} /> Back</button>
					{#if pick.kind === "db" && pick.item.variants > 1}
						{@const p = pick}
						<select class="field" value={p.variant} onchange={(e) => previewDb(p.db, p.item, Number((e.currentTarget as HTMLSelectElement).value))}>
							{#each p.item.variantNames as v, i (i)}<option value={i + 1}>{v}</option>{/each}
						</select>
					{/if}
					<button class="btn primary" onclick={equipPick} disabled={working}>Equip in {sel.label || sel.slot}</button>
				</div>
				<TooltipView tooltip={preview} />
			{:else if mode === "owned"}
				{#if owned.length}
					<div class="list card">
						{#each owned as it (it.id)}
							<button class="pick" onclick={() => previewOwned(it.id)}>
								<span style:color={RARITY[it.rarity ?? ""] ?? null}>{it.name}</span>
								{#if it.equippedSlot}<span class="muted small">in {it.equippedSlot}</span>{/if}
							</button>
						{/each}
					</div>
				{:else}
					<p class="muted">No other item in this build fits here. Try Uniques, Templates or Paste.</p>
				{/if}
			{:else if mode === "unique" || mode === "rare"}
				<input class="field" type="search" placeholder={mode === "unique" ? "Search uniques" : "Search templates"} bind:value={query} oninput={searchDb} />
				<p class="muted small">{dbLoading ? "Loading Path of Building's item database…" : `${dbTotal} ${mode === "unique" ? "uniques" : "templates"} fit ${sel.label || sel.slot}`}</p>
				<div class="list card">
					{#each db as it (it.name)}
						<button class="pick" onclick={() => previewDb(mode === "rare" ? "rare" : "unique", it)}>
							<span style:color={RARITY[it.rarity ?? ""] ?? null}>{it.name}</span>
							<span class="muted small">{it.baseName ?? it.type}{it.variants > 1 ? ` · ${it.variants} variants` : ""}</span>
						</button>
					{/each}
				</div>
			{:else if mode === "paste"}
				<p class="muted small top">In Path of Exile, hover an item and press Ctrl+C (or copy it from the trade site), then paste it here.</p>
				<textarea class="field" rows="7" bind:value={text} oninput={previewText} placeholder={"Item Class: Rings\nRarity: Rare\n…"} autocapitalize="off" autocomplete="off" spellcheck="false"></textarea>
				{#if previewError}<p class="err small">{previewError}</p>{/if}
				<div class="two">
					<button class="btn" onclick={pasteClipboard}><Icon name="paste" size={18} /> Paste</button>
					<button class="btn primary" onclick={equipText} disabled={working || !preview}>Equip in {sel.label || sel.slot}</button>
				</div>
				{#if preview}<div class="prev"><TooltipView tooltip={preview} /></div>{/if}
			{/if}

			{#if sel.itemId && !pick}
				<button class="btn ghost block back" onclick={() => setMode("view")}><Icon name="back" size={18} /> Current item</button>
			{/if}
		{/if}
	{/if}
</Sheet>

<style>
	.page {
		padding: 6px 14px 28px;
	}
	h2 {
		margin: 16px 2px 6px;
	}
	.hint {
		text-transform: none;
		letter-spacing: 0;
		font-weight: 400;
		margin-left: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		padding-right: 12px;
	}
	.slot {
		flex: 1;
		min-width: 0;
		display: grid;
		grid-template-columns: 92px 1fr;
		gap: 10px;
		align-items: center;
		min-height: 52px;
		padding: 8px 14px;
		background: none;
		border: 0;
		text-align: left;
	}
	.slot:active {
		background: var(--bg-hover);
	}
	.label {
		font-size: 12px;
		color: var(--fg-3);
	}
	.item {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}
	.item.add {
		flex-direction: row;
		align-items: center;
		gap: 6px;
		font-size: 13px;
	}
	.iname {
		font-weight: 600;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.base {
		font-size: 12px;
		opacity: 0.75;
	}
	.acts {
		display: grid;
		grid-template-columns: 1fr 1fr 1fr auto;
		gap: 8px;
		margin-bottom: 12px;
	}
	.acts .btn {
		padding: 0 10px;
		font-size: 14px;
	}
	.danger {
		color: var(--bad);
	}
	.tabs {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		background: var(--bg-0);
		border: 1px solid var(--line-1);
		border-radius: var(--radius-sm);
		padding: 3px;
		gap: 3px;
		margin-bottom: 12px;
	}
	.tabs button {
		min-height: 36px;
		border: 0;
		border-radius: 5px;
		background: none;
		font-size: 13px;
		color: var(--fg-2);
	}
	.tabs button.on {
		background: var(--bg-3);
		color: var(--fg-0);
	}
	.pick {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1px;
		width: 100%;
		padding: 10px 12px;
		background: none;
		border: 0;
		text-align: left;
		font-weight: 600;
	}
	.pick .small {
		font-weight: 400;
	}
	.pick:active {
		background: var(--bg-hover);
	}
	.picked {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}
	.picked select {
		flex: 1 1 100%;
		order: -1;
	}
	.picked .btn.primary {
		flex: 1;
	}
	.small {
		font-size: 12px;
	}
	.top {
		margin-top: 0;
	}
	.two {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 8px;
		margin: 10px 0;
	}
	.prev {
		margin-top: 4px;
	}
	.err {
		color: var(--bad);
	}
	.back {
		margin-top: 12px;
	}
	input.field {
		margin-bottom: 4px;
	}
</style>
