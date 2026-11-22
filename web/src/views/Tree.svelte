<script lang="ts">
	// The passive tree: one finger pans, two pinch, a tap selects a node and
	// shows what allocating it would do; the panel's button allocates.
	import Icon from "../components/Icon.svelte";
	import PobText from "../components/PobText.svelte";
	import SetPicker from "../components/SetPicker.svelte";
	import Sheet from "../components/Sheet.svelte";
	import { app } from "../lib/app.svelte";
	import { draw, drawArt, TreeModel, type ArtContext, type PowerMap, type TreeJewel, type Highlight, type TreeState, type View } from "../lib/tree";
	import type { ArtState } from "../lib/tree-art";
	import { treeData } from "../lib/tree-cache";
	import type { TooltipLine } from "../engine/types";

	interface Detail {
		id: number;
		name: string | null;
		type: string | null;
		stats: string[];
		reminder: string[];
		allocated: boolean;
		ascendancy: string | null;
		canAllocate: boolean;
		pathCost: number | null;
		removes: number | null;
		masteryEffects?: { effect: number; stats: string[]; takenBy: number | null }[];
		masterySelected?: number | null;
	}

	let artCtx: ArtContext | null = null;
	let canvas = $state<HTMLCanvasElement | null>(null);
	let box = $state<HTMLDivElement | null>(null);
	let model = $state<TreeModel | null>(null);
	let tstate = $state<TreeState | null>(null);
	let alloc = $state(new Set<number>());
	let view: View = { cx: 0, cy: 0, scale: 0.05 };
	let framedFor = "";
	let hl: Highlight = { path: new Set(), selected: null, search: new Set() };
	let detail = $state<Detail | null>(null);
	let diff = $state<TooltipLine[]>([]);
	let searchOpen = $state(false);
	let query = $state("");
	let hits = $state<number[]>([]);
	let hitIndex = 0;
	let choosingMastery = $state(false);
	let jewels = $state<TreeJewel[]>([]);

	// --- node power (PoB's heat map and power report) ---------------------------
	interface PowerResult extends PowerMap {
		label: string;
		report: { id: number; name: string; powerStr: string; power: number; pathDist: number | null; allocated: boolean; type: string | null }[];
	}
	let powerOpen = $state(false);
	let powerStats = $state<{ stat: string | null; label: string }[]>([]);
	let powerStat = $state<string | null>(null);
	let powerDepth = $state<number | null>(5);
	let power = $state<PowerResult | null>(null);
	let powerRev = -1;
	let powerRunning = $state(false);
	let powerProgress = $state(0);
	let powerCancel = false;
	const powerShown = $derived(!!power && powerRev === app.rev);
	// Best passives to take: PoB's power report for a single stat; for the
	// Offence/Defence view, the nodes ranked by both shares together.
	const powerList = $derived.by(() => {
		if (!power || !model) return [];
		const byId = new Map(power.report.map((r) => [r.id, r]));
		const out: { id: number; name: string; text: string; score: number; dist: number | null }[] = [];
		for (const [key, v] of Object.entries(power.nodes)) {
			const id = Number(key);
			const n = model.nodes.get(id);
			if (!n || alloc.has(id) || n.t === 5) continue;
			const rep = byId.get(id);
			if (power.stat) {
				const val = v.s ?? 0;
				if (val <= 0) continue;
				out.push({ id, name: n.n ?? rep?.name ?? String(id), text: rep?.powerStr ?? `+${fmtNum(val)}`, score: val, dist: rep?.pathDist ?? null });
			} else {
				const o = Math.max(0, v.o ?? 0), d = Math.max(0, v.d ?? 0);
				const score = (power.max.offence ? o / power.max.offence : 0) + (power.max.defence ? d / power.max.defence : 0);
				if (score <= 0) continue;
				const parts = [o > 0 ? `^xE05030+${(o * 100).toFixed(1)}% dmg` : "", d > 0 ? `^x7070FF+${(d * 100).toFixed(1)}% def` : ""].filter(Boolean);
				out.push({ id, name: n.n ?? String(id), text: parts.join("^7 · "), score, dist: rep?.pathDist ?? null });
			}
		}
		return out.sort((a, b) => b.score - a.score).slice(0, 40);
	});
	const fmtNum = (x: number) => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString() : x.toFixed(1));
	async function openPower() {
		powerOpen = true;
		if (!powerStats.length) powerStats = (await app.call<{ stats: typeof powerStats }>("power_stats")).stats;
	}
	async function runPower() {
		powerRunning = true;
		powerCancel = false;
		powerProgress = 0;
		powerOpen = false;
		try {
			let r = await app.call<{ done: boolean; progress: number }>("tree_power_start", { stat: powerStat ?? undefined, maxDepth: powerDepth ?? undefined });
			while (!r.done && !powerCancel) {
				r = await app.call<{ done: boolean; progress: number }>("tree_power_step", { budgetMs: 250 });
				powerProgress = r.progress;
			}
			if (powerCancel) return;
			power = await app.call<PowerResult>("tree_power_result");
			powerRev = app.rev;
			if (artCtx) artCtx.power = power;
			redraw();
			powerOpen = true;
		} catch (e) {
			app.notify(e instanceof Error ? e.message : String(e), "error");
		} finally {
			powerRunning = false;
		}
	}
	function hidePower() {
		power = null;
		if (artCtx) artCtx.power = null;
		redraw();
	}
	$effect(() => {
		const id = app.focusNode;
		if (id == null || !model || !w) return;
		app.focusNode = null;
		const n = model.nodes.get(id);
		if (!n) return;
		view = { cx: n.x, cy: n.y, scale: Math.max(view.scale, 0.3) };
		framedFor = `${app.build?.generation}:${tstate?.treeVersion}`;
		select(id, true);
	});
	function goTo(id: number) {
		const n = model?.nodes.get(id);
		if (!n) return;
		powerOpen = false;
		view = { cx: n.x, cy: n.y, scale: Math.max(view.scale, 0.3) };
		select(id, true);
	}
	function socketJewel(id: number) {
		app.openSlot = `Jewel ${id}`;
		app.tab = "items";
	}
	let w = 0, h = 0, dpr = 1;

	// Geometry per tree version, then the allocation state on every change.
	$effect(() => {
		void app.rev;
		(async () => {
			const st = await app.call<TreeState>("get_tree_state");
			const [entry, artState, tj] = await Promise.all([
				treeData(st.treeVersion),
				app.call<ArtState>("tree_art_state"),
				app.call<{ jewels: TreeJewel[] }>("tree_jewels").catch(() => ({ jewels: [] })),
			]);
			jewels = tj.jewels;
			entry.store.onLoad = () => redraw();
			void entry.store.preload(entry.art.images);
			model = new TreeModel(entry.geo, st.dynamicNodes);
			tstate = st;
			artCtx = { art: entry.art, store: entry.store, state: artState, jewels: tj.jewels, power: powerRev === app.rev ? power : null };
			alloc = new Set([...st.allocatedNodes, ...st.dynamicNodes.filter((d) => d.allocated).map((d) => d.id)]);
			const key = `${app.build?.generation}:${st.treeVersion}`;
			if (framedFor !== key && w) {
				framedFor = key;
				view = model.frame(alloc.size > 1 ? alloc : [], w, h);
			}
			if (detail) await select(detail.id, false);
			redraw();
		})().catch((e) => app.notify(e.message, "error"));
	});

	let raf = 0;
	let lastDrawMs = 0;
	function redraw() {
		if (raf) return;
		raf = requestAnimationFrame(() => {
			raf = 0;
			const ctx = canvas?.getContext("2d");
			if (!ctx || !model) return;
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
			const t0 = performance.now();
			if (artCtx) drawArt(ctx, model, view, w, h, alloc, hl, tstate, artCtx);
			else draw(ctx, model, view, w, h, alloc, hl, tstate);
			lastDrawMs = performance.now() - t0;
		});
	}

	function resize() {
		if (!box || !canvas) return;
		dpr = Math.min(window.devicePixelRatio || 1, 2.5);
		w = box.clientWidth;
		h = box.clientHeight;
		canvas.width = Math.round(w * dpr);
		canvas.height = Math.round(h * dpr);
		canvas.style.width = `${w}px`;
		canvas.style.height = `${h}px`;
		if (model && !framedFor) {
			framedFor = `${app.build?.generation}:${tstate?.treeVersion}`;
			view = model.frame(alloc.size > 1 ? alloc : [], w, h);
		}
		redraw();
	}
	$effect(() => {
		if (!box) return;
		const ro = new ResizeObserver(resize);
		ro.observe(box);
		return () => ro.disconnect();
	});

	// --- gestures -------------------------------------------------------------
	const pointers = new Map<number, { x: number; y: number }>();
	let downAt = { x: 0, y: 0, t: 0 };
	let moved = false;
	let pinchDist = 0;
	let lastTap = 0;

	function local(e: PointerEvent) {
		const r = canvas!.getBoundingClientRect();
		return { x: e.clientX - r.left, y: e.clientY - r.top };
	}
	function zoomAt(px: number, py: number, factor: number) {
		const wx = (px - w / 2) / view.scale + view.cx;
		const wy = (py - h / 2) / view.scale + view.cy;
		view.scale = Math.max(0.015, Math.min(1.5, view.scale * factor));
		view.cx = wx - (px - w / 2) / view.scale;
		view.cy = wy - (py - h / 2) / view.scale;
		redraw();
	}
	function down(e: PointerEvent) {
		canvas!.setPointerCapture(e.pointerId);
		const p = local(e);
		pointers.set(e.pointerId, p);
		if (pointers.size === 1) {
			downAt = { ...p, t: performance.now() };
			moved = false;
		} else if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
			moved = true;
		}
	}
	function move(e: PointerEvent) {
		const prev = pointers.get(e.pointerId);
		if (!prev) return;
		const p = local(e);
		if (pointers.size === 1) {
			if (Math.hypot(p.x - downAt.x, p.y - downAt.y) > 8) moved = true;
			if (moved) {
				view.cx -= (p.x - prev.x) / view.scale;
				view.cy -= (p.y - prev.y) / view.scale;
				redraw();
			}
		} else if (pointers.size === 2) {
			const other = [...pointers.entries()].find(([id]) => id !== e.pointerId)![1];
			const d = Math.hypot(p.x - other.x, p.y - other.y);
			const mx = (p.x + other.x) / 2, my = (p.y + other.y) / 2;
			const pmx = (prev.x + other.x) / 2, pmy = (prev.y + other.y) / 2;
			view.cx -= (mx - pmx) / view.scale;
			view.cy -= (my - pmy) / view.scale;
			if (pinchDist > 0) zoomAt(mx, my, d / pinchDist);
			pinchDist = d;
		}
		pointers.set(e.pointerId, p);
	}
	function up(e: PointerEvent) {
		const p = pointers.get(e.pointerId);
		pointers.delete(e.pointerId);
		if (pointers.size === 1) {
			const [only] = pointers.values();
			downAt = { ...only, t: performance.now() };
		}
		if (!p || moved || pointers.size > 0 || performance.now() - downAt.t > 500) return;
		const now = performance.now();
		if (now - lastTap < 280) {
			zoomAt(p.x, p.y, 2);
			lastTap = 0;
			return;
		}
		lastTap = now;
		const n = model?.hit(view, w, h, p.x, p.y);
		if (n) select(n.id, true);
		else clearSelection();
	}
	function wheel(e: WheelEvent) {
		e.preventDefault();
		const p = { x: e.offsetX, y: e.offsetY };
		zoomAt(p.x, p.y, Math.exp(-e.deltaY * 0.0015));
	}

	// --- selection ------------------------------------------------------------
	async function select(id: number, fresh: boolean) {
		if (fresh) choosingMastery = false;
		hl.selected = id;
		redraw();
		try {
			const [d, hov, cmp] = await Promise.all([
				app.call<Detail>("node_detail", { id }),
				app.call<{ path: number[] }>("node_hover", { id }),
				app.call<{ lines: TooltipLine[] }>("node_compare", { id }).catch(() => ({ lines: [] })),
			]);
			if (hl.selected !== id) return;
			detail = d;
			diff = cmp.lines ?? [];
			hl.path = new Set(hov.path ?? []);
		} catch (e) {
			app.notify(e instanceof Error ? e.message : String(e), "error");
		}
		redraw();
	}
	function clearSelection() {
		detail = null;
		diff = [];
		hl.selected = null;
		hl.path = new Set();
		choosingMastery = false;
		redraw();
	}

	type ClickResult = { needsMastery?: boolean; needsConfirm?: string; className?: string; ascendClassName?: string; blocked?: string };
	async function click(extra: Record<string, unknown> = {}) {
		if (!detail) return;
		const id = detail.id;
		if (detail.type === "Mastery" && !detail.allocated && extra.effect == null) {
			choosingMastery = true;
			return;
		}
		const r = await app.mutate<ClickResult>("tree_click", { id, ...extra });
		if (r?.blocked) app.notify(r.blocked, "error");
		if (r?.needsConfirm === "class_change") {
			const ok = confirm(`${r.ascendClassName} belongs to the ${r.className}. Switch class? Nodes that no longer connect are removed.`);
			if (ok) await app.mutate("tree_click", { id, confirm: "connect" }).catch(() => app.mutate("tree_click", { id, confirm: "reset" }));
		}
		if (r?.needsMastery) choosingMastery = true;
	}
	async function pickMastery(effect: number) {
		if (!detail) return;
		choosingMastery = false;
		await app.mutate("select_mastery", { id: detail.id, effect });
	}

	// --- search ---------------------------------------------------------------
	let searchTimer: ReturnType<typeof setTimeout>;
	function onSearch() {
		clearTimeout(searchTimer);
		searchTimer = setTimeout(async () => {
			const q = query.trim();
			if (q.length < 2) {
				hits = [];
				hl.search = new Set();
				redraw();
				return;
			}
			const r = await app.call<{ nodes: { id: number }[] }>("search_tree", { query: q, limit: 400 });
			hits = r.nodes.map((n) => n.id).filter((id) => model?.nodes.has(id));
			hl.search = new Set(hits);
			hitIndex = -1;
			redraw();
		}, 200);
	}
	function nextHit() {
		if (!hits.length || !model) return;
		hitIndex = (hitIndex + 1) % hits.length;
		const n = model.nodes.get(hits[hitIndex])!;
		view = { cx: n.x, cy: n.y, scale: Math.max(view.scale, 0.3) };
		select(n.id, true);
	}

	function reset() {
		if (confirm("Remove every allocated passive from this tree?")) app.mutate("reset_tree");
	}
	function fit() {
		if (!model) return;
		view = model.frame(alloc.size > 1 ? alloc : [], w, h);
		redraw();
	}
	// For the end-to-end test: where a node is on screen.
	(globalThis as unknown as { __pobTree: object }).__pobTree = {
		screen(id: number) {
			const n = model?.nodes.get(id);
			const r = canvas?.getBoundingClientRect();
			if (!n || !r) return null;
			return { x: r.left + (n.x - view.cx) * view.scale + w / 2, y: r.top + (n.y - view.cy) * view.scale + h / 2 };
		},
		focus(id: number, scale = 0.35) {
			const n = model?.nodes.get(id);
			if (!n) return;
			view = { cx: n.x, cy: n.y, scale };
			redraw();
		},
		allocated: () => [...alloc],
		drawMs: () => lastDrawMs,
		setScale(scale: number) {
			view.scale = scale;
			redraw();
		},
		neighbours: () => {
			const out: number[] = [];
			for (const l of model?.links ?? []) {
				if (alloc.has(l[0]) !== alloc.has(l[1])) out.push(alloc.has(l[0]) ? l[1] : l[0]);
			}
			return out.filter((id) => !model?.nodes.get(id)?.a);
		},
	};
	const kind = (d: Detail) => (d.ascendancy ? `${d.ascendancy} · ` : "") + (d.type === "Normal" ? "Passive" : d.type);
</script>

<div class="tree">
	{#if powerRunning}
		<div class="pbar" role="progressbar" aria-valuenow={powerProgress}>
			<span style:width={`${Math.round(powerProgress)}%`}></span>
			<em>Calculating node power… {Math.round(powerProgress)}%</em>
			<button class="link" onclick={() => (powerCancel = true)}>Stop</button>
		</div>
	{/if}
	<div class="bar">
		{#if tstate}
			<span class="pts num" class:over={tstate.passivePointsSpent > tstate.pointsAvailableMax}>
				{tstate.passivePointsSpent}<span class="muted">/{tstate.pointsAvailableMax}</span>
			</span>
			<span class="pts num asc">{tstate.ascendancyPointsUsed}<span class="muted">/{tstate.ascendancyPointsAvailable}</span></span>
		{/if}
		<span class="spacer"><SetPicker kind="spec" label="" /></span>
		<button class="icon-btn" class:lit={powerShown} aria-label="Node power" onclick={openPower}><Icon name="stats" size={20} /></button>
		<button class="icon-btn" aria-label="Search the tree" onclick={() => (searchOpen = !searchOpen)}><Icon name="search" size={20} /></button>
		<button class="icon-btn" aria-label="Show my tree" onclick={fit}><Icon name="fit" size={20} /></button>
		<button class="icon-btn" aria-label="Reset tree" onclick={reset}><Icon name="trash" size={20} /></button>
	</div>
	{#if searchOpen}
		<div class="search">
			<input class="field" type="search" placeholder="Search nodes and stats" bind:value={query} oninput={onSearch} />
			{#if hits.length}<button class="btn" onclick={nextHit}>{hits.length} found <Icon name="chevron" size={16} /></button>{/if}
		</div>
	{/if}
	<div class="canvas" bind:this={box}>
		<canvas bind:this={canvas} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up} onwheel={wheel}></canvas>
		{#if !model}<p class="loading muted">Loading the tree…</p>{/if}
	</div>

	{#if detail}
		{@const d = detail}
		<div class="panel scroll">
			<header>
				<div>
					<div class="name" class:keystone={d.type === "Keystone"} class:notable={d.type === "Notable"}>
						{tstate?.overrides?.[d.id]?.name ?? d.name}
					</div>
					<div class="muted small">{kind(d)}</div>
				</div>
				<button class="icon-btn" aria-label="Close" onclick={clearSelection}><Icon name="close" size={20} /></button>
			</header>
			{#if !choosingMastery}
				<div class="stats">
					{#each d.stats as s, i (i)}<div>{s}</div>{/each}
					{#each d.reminder as s, i (i)}<div class="reminder">{s}</div>{/each}
				</div>
			{/if}
			{#if choosingMastery && d.masteryEffects}
				<div class="eyebrow pick">Choose an effect</div>
				<div class="list card">
					{#each d.masteryEffects as m (m.effect)}
						<button class="effect" class:sel={d.masterySelected === m.effect} disabled={m.takenBy != null} onclick={() => pickMastery(m.effect)}>
							{#each m.stats as s, i (i)}<div>{s}</div>{/each}
							{#if m.takenBy != null}<div class="muted small">Taken by another mastery</div>{/if}
						</button>
					{/each}
				</div>
			{:else}
				{#if d.type === "Socket"}
					{@const j = jewels.find((x) => x.id === d.id)}
					<div class="jewel">
						{#if j}<span class="small">{j.item}</span>{:else}<span class="muted small">Empty socket</span>{/if}
						{#if d.allocated}<button class="btn" onclick={() => socketJewel(d.id)}>{j ? "Change jewel" : "Socket a jewel"}</button>{/if}
					</div>
				{/if}
				<div class="actions">
					{#if d.allocated}
						<button class="btn" onclick={() => click()}>Remove{d.removes ? ` (${d.removes + 1} nodes)` : ""}</button>
						{#if d.masteryEffects}<button class="btn" onclick={() => (choosingMastery = true)}>Change effect</button>{/if}
					{:else if d.canAllocate}
						<button class="btn primary" onclick={() => click()}>Allocate{d.pathCost && d.pathCost > 1 ? ` (${d.pathCost} points)` : ""}</button>
					{:else}
						<span class="muted small">Not connected to your tree.</span>
					{/if}
				</div>
				{#if diff.length}
					<div class="diff">
						{#each diff as l, i (i)}
							{#if l.text}<div class:head={(l as TooltipLine & { head?: boolean }).head}><PobText text={l.text} /></div>{/if}
						{/each}
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<Sheet bind:open={powerOpen} title="Node power">
	<p class="muted small">Path of Building works out what each passive you don't have would add, and colours the tree by it: red for damage, blue for defence.</p>
	<h3 class="eyebrow">Measure</h3>
	<select class="field" value={powerStat ?? ""} onchange={(e) => (powerStat = (e.currentTarget as HTMLSelectElement).value || null)}>
		{#each powerStats as ps (ps.label)}<option value={ps.stat ?? ""}>{ps.label}</option>{/each}
	</select>
	<h3 class="eyebrow">Up to how many points away</h3>
	<div class="chips">
		{#each [3, 5, 10, null] as d (String(d))}
			<button class="chip" class:on={powerDepth === d} onclick={() => (powerDepth = d)}>{d ?? "All"}</button>
		{/each}
	</div>
	<p class="muted small">Further takes longer: about a minute for the whole tree on a fast phone.</p>
	<div class="pact">
		<button class="btn primary" disabled={powerRunning} onclick={runPower}>{powerShown ? "Recalculate" : "Calculate"}</button>
		{#if powerShown}<button class="btn" onclick={hidePower}>Hide heat map</button>{/if}
	</div>
	{#if power && powerShown}
		<h3 class="eyebrow">Best passives for {power.label}</h3>
		<div class="list card">
			{#each powerList as r (r.id)}
				<button class="rowbtn" onclick={() => goTo(r.id)}>
					<span class="grow"><span>{r.name}</span>{#if r.dist}<span class="muted tiny">{r.dist} point{r.dist === 1 ? "" : "s"} away</span>{/if}</span>
					<span class="num pw"><PobText text={r.text} /></span>
				</button>
			{:else}
				<p class="muted small">No unallocated passive within reach adds to this.</p>
			{/each}
		</div>
	{:else if power && !powerShown}
		<p class="muted small">The build changed since the last calculation.</p>
	{/if}
</Sheet>

<style>
	.pbar {
		position: relative;
		height: 26px;
		background: var(--bg-1);
		border-bottom: 1px solid var(--line-0);
		display: flex;
		align-items: center;
		padding: 0 12px;
		font-size: 12px;
		flex: none;
	}
	.pbar span {
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		background: color-mix(in oklab, var(--c-life) 35%, transparent);
	}
	.pbar em {
		position: relative;
		font-style: normal;
		flex: 1;
	}
	.pbar .link,
	.link {
		position: relative;
		border: 0;
		background: none;
		color: var(--focus);
	}
	.lit {
		color: var(--c-life);
	}
	.pact {
		display: flex;
		gap: 8px;
		margin: 12px 0;
	}
	.pact .btn {
		flex: 1;
	}
	.tiny {
		display: block;
		font-size: 11px;
	}
	.grow {
		flex: 1;
		min-width: 0;
	}
	.pw {
		font-size: 13px;
	}
	h3.eyebrow {
		margin: 14px 0 6px;
	}
	.jewel {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin: 8px 0;
	}
	.tree {
		position: relative;
		height: 100%;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}
	.bar {
		display: flex;
		align-items: center;
		gap: 2px;
		padding: 2px 6px 2px 12px;
		border-bottom: 1px solid var(--line-0);
		background: var(--bg-0);
		flex: none;
	}
	.pts {
		font-size: 15px;
		font-weight: 600;
		margin-right: 10px;
	}
	.pts.asc {
		color: var(--c-unique);
	}
	.over {
		color: var(--bad);
	}
	.spacer {
		flex: 1;
		min-width: 0;
		display: flex;
		justify-content: center;
		padding: 0 4px;
	}
	.search {
		display: flex;
		gap: 8px;
		padding: 8px 10px;
		border-bottom: 1px solid var(--line-0);
		flex: none;
	}
	.search .btn {
		white-space: nowrap;
	}
	.canvas {
		position: relative;
		flex: 1;
		min-height: 0;
	}
	canvas {
		display: block;
		touch-action: none;
	}
	.loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		margin: 0;
	}
	.panel {
		position: absolute;
		left: 8px;
		right: 8px;
		bottom: 8px;
		max-height: 48%;
		background: var(--bg-1);
		border: 1px solid var(--line-1);
		border-radius: 14px;
		box-shadow: var(--shadow-sheet);
		padding: 6px 12px 12px;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		gap: 8px;
	}
	header > div {
		padding-top: 6px;
	}
	.name {
		font-weight: 600;
		font-size: 17px;
	}
	.name.notable {
		color: var(--c-rare);
	}
	.name.keystone {
		color: var(--c-unique);
	}
	.small {
		font-size: 12px;
	}
	.stats {
		font-size: 14px;
		color: var(--c-magic);
		margin: 6px 0 10px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.reminder {
		color: var(--fg-3);
		font-size: 12px;
	}
	.actions {
		display: flex;
		gap: 8px;
		align-items: center;
		flex-wrap: wrap;
	}
	.diff {
		margin-top: 10px;
		font-size: 13px;
		background: var(--bg-0);
		border: 1px solid var(--line-0);
		border-radius: var(--radius-sm);
		padding: 8px 10px;
	}
	.diff .head {
		font-weight: 600;
		margin-top: 4px;
	}
	.pick {
		margin: 4px 0 6px;
	}
	.effect {
		display: block;
		width: 100%;
		text-align: left;
		background: none;
		border: 0;
		padding: 10px 12px;
		font-size: 14px;
		color: var(--c-magic);
	}
	.effect.sel {
		box-shadow: inset 3px 0 0 var(--c-dps);
	}
	.effect:disabled {
		opacity: 0.45;
	}
	.effect:not(:disabled):active {
		background: var(--bg-hover);
	}
</style>
