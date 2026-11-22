// Colour themes (PoB Redux's palettes): stored per device.
export const THEMES = [
	{ id: "dark", label: "Dark" },
	{ id: "wraeclast", label: "Wraeclast" },
	{ id: "abyss", label: "Abyss" },
	{ id: "breach", label: "Breach" },
	{ id: "ritual", label: "Ritual" },
	{ id: "light", label: "Light" },
	{ id: "delirium", label: "Delirium" },
] as const;

const KEY = "pob-mobile:theme";

export function currentTheme(): string {
	return localStorage.getItem(KEY) ?? "dark";
}

export function applyTheme(id = currentTheme()) {
	const root = document.documentElement;
	if (id === "dark") delete root.dataset.theme;
	else root.dataset.theme = id;
	localStorage.setItem(KEY, id);
	const bg = getComputedStyle(root).getPropertyValue("--bg-0").trim();
	document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg || "#111");
}
