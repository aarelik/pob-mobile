const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });
const one = new Intl.NumberFormat("en", { maximumFractionDigits: 1 });

/** Large numbers short (1.25M), small ones exact. */
export function fmtBig(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "–";
	return Math.abs(n) >= 100_000 ? compact.format(n) : whole.format(n);
}

export function fmtInt(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "–";
	return whole.format(n);
}

export function fmt1(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "–";
	return one.format(n);
}

export function fmtPct(n: number | null | undefined): string {
	if (n == null || !Number.isFinite(n)) return "–";
	return `${one.format(n)}%`;
}

export function timeAgo(ms: number): string {
	const s = (Date.now() - ms) / 1000;
	if (s < 60) return "just now";
	if (s < 3600) return `${Math.floor(s / 60)} min ago`;
	if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
	return new Date(ms).toLocaleDateString();
}
