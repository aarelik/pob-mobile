// Shapes returned by the bridge (engine/lua/bridge.lua). Only the fields the UI reads.

export interface BuildInfo {
	name: string;
	level: number;
	levelAuto: boolean;
	classId: number;
	className: string;
	ascendClassId: number;
	ascendClassName: string | null;
	secondaryAscendClassName: string | null;
	mainSocketGroup: number;
	treeVersion: string;
	rev: number;
	generation: number;
	unsaved: boolean;
	points: { used: number; max: number; ascUsed: number; ascMax: number; requiredLevelText: string | null; act: string | null };
}

export interface SidebarRow {
	h: number;
	lhs: string | null;
	rhs: string | null;
	hasBreakdown: boolean;
	stat: string | null;
	actor: string | null;
}

export interface Sidebar {
	rows: SidebarRow[];
	warnings: string[];
	notCounted: { count: number; items: { name: string; slot: string; lines: string[] }[]; nodes: { name: string; lines: string[]; id: number }[] };
	rev: number;
}

export type BreakdownSection =
	| { type: "text"; lines: string[]; size?: number }
	| { type: "table"; label?: string; cols: { key: string; label: string; right: boolean }[]; rows: Record<string, string>[]; footer?: string | null };

export interface Breakdown {
	sections: BreakdownSection[];
}

export interface Gem {
	index: number;
	name: string;
	nameSpec: string;
	level: number;
	quality: number;
	enabled: boolean;
	support: boolean;
	color: string | null;
	errMsg: string | null;
	granted: unknown;
	count: number;
}

export interface SocketGroup {
	index: number;
	label: string | null;
	displayLabel: string;
	slot: string | null;
	enabled: boolean;
	slotEnabled: boolean;
	includeInFullDPS: boolean;
	isMainSkill: boolean;
	mainActiveSkill: number;
	skills: { name: string; index: number }[];
	grantedBy: { kind: string; item: string | null; node: string | null; source: string } | null;
	source: string | null;
	itemSockets: { text: string | null } | null;
	gems: Gem[];
}

export interface Skills {
	mainSocketGroup: number;
	socketGroups: SocketGroup[];
	skillSets: { id: number; title: string | null; active?: boolean }[];
	activeSkillSet: number;
}

export interface Slot {
	slot: string;
	label: string | null;
	itemId: number;
	itemName: string | null;
	itemRarity: string | null;
	shown: boolean;
	inactive: boolean;
	weaponSet: number | null;
	nodeId: number | null;
}

export interface TooltipLine {
	text: string;
	size: number;
	sep: boolean;
	center: boolean;
	font: string | null;
}

export interface Tooltip {
	lines: TooltipLine[];
	rarity?: string | null;
}

export interface ConfigOption {
	var: string;
	label: string | null;
	type: string | null;
	section: string;
	tooltip: string | null;
	defaultState: string | number | boolean | null;
	list?: { val: string | number | boolean | null; label: string }[];
}

export interface ConfigState {
	config: Record<string, string | number | boolean>;
	placeholder: Record<string, string | number | boolean>;
}

export interface ClassInfo {
	id: number;
	name: string;
	ascendancies: { id: number; name: string }[];
}

export interface BuildSummary {
	mainSkill: string | null;
	mainSkillSupports?: number;
	totalDPS: number | null;
	minionDPS: number | null;
	life: number;
	energyShield: number;
	mana: number;
	keystones: string[];
	requirements: Record<string, { need: number; have: number; met: boolean; from: string | null }>;
}
