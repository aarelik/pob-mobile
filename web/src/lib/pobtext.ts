// PoB text carries colour escapes: ^0-^9 (palette) and ^xRRGGBB.
// Palette from SimpleGraphic's colour table.
const PALETTE: Record<string, string> = {
	"0": "#000000",
	"1": "#ff0000",
	"2": "#00ff00",
	"3": "#0000ff",
	"4": "#ffff00",
	"5": "#ff00ff",
	"6": "#00ffff",
	"7": "", // default text colour
	"8": "#b3b3b3",
	"9": "#666666",
};

// PoB's raw colours are tuned for its black UI; the pure white and greys map
// onto the theme's ink ramp so they follow the design tokens.
const REMAP: Record<string, string> = {
	"#ffffff": "",
	"#b3b3b3": "var(--fg-2)",
	"#7f7f7f": "var(--fg-2)",
	"#808080": "var(--fg-2)",
	"#666666": "var(--fg-3)",
	"#000000": "var(--fg-1)",
};

export type Span = { text: string; color: string };

export function parsePobText(text: string | null | undefined): Span[] {
	if (text == null || text === "") return [];
	text = String(text);
	const out: Span[] = [];
	let color = "";
	const re = /\^(x[0-9a-fA-F]{6}|[0-9])/g;
	let last = 0;
	let m: RegExpExecArray | null;
	while ((m = re.exec(text))) {
		if (m.index > last) out.push({ text: text.slice(last, m.index), color });
		const code = m[1];
		const raw = code[0] === "x" ? `#${code.slice(1).toLowerCase()}` : PALETTE[code] ?? "";
		color = REMAP[raw] ?? raw;
		last = re.lastIndex;
	}
	if (last < text.length) out.push({ text: text.slice(last), color });
	return out;
}

export function stripPobText(text: string | null | undefined): string {
	return String(text ?? "").replace(/\^(x[0-9a-fA-F]{6}|[0-9])/g, "");
}

/** The first colour a PoB string sets, for tinting a whole label. */
export function firstColor(text: string | null | undefined): string {
	return parsePobText(text).find((s) => s.color)?.color ?? "";
}
