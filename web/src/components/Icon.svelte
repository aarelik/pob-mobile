<script lang="ts">
	// Hand-drawn 24px stroke icons; one path set per name.
	let { name, size = 22 }: { name: string; size?: number } = $props();
	const P: Record<string, string> = {
		overview: "M4 13h6V4H4zM14 20h6v-9h-6zM14 4v4h6V4zM4 20h6v-4H4z",
		skills: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 3v18M4 7.5l16 9M20 7.5l-16 9",
		items: "M7 3h10l2 5-7 13L5 8zM5 8h14M10 3l-1 5 3 13 3-13-1-5",
		config: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
		stats: "M4 20V10M10 20V4M16 20v-7M22 20H2",
		notes: "M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7",
		back: "M15 5l-7 7 7 7",
		plus: "M12 5v14M5 12h14",
		more: "M5 12h.01M12 12h.01M19 12h.01",
		share: "M12 15V3M8 7l4-4 4 4M5 12v8h14v-8",
		copy: "M9 9h11v11H9zM5 15H4V4h11v1",
		trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
		star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
		close: "M6 6l12 12M18 6L6 18",
		search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4",
		chevron: "M9 6l6 6-6 6",
		import: "M12 3v12M8 11l4 4 4-4M5 21h14",
		edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
		info: "M12 8h.01M11 12h1v5h1M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z",
		warn: "M12 4l9 16H3zM12 10v4M12 17h.01",
		builds: "M4 5h16M4 12h16M4 19h10",
		tree: "M12 4a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM5 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM19 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM12 8v4M12 12l-6 4.3M12 12l6 4.3",
		undo: "M9 7H5V3M5.5 7A8 8 0 1 1 4 13",
		redo: "M15 7h4V3M18.5 7A8 8 0 1 0 20 13",
		fit: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
		paste: "M9 4h6v3H9zM7 5H5v16h14V5h-2M9 12h6M9 16h4",
		unique: "M12 3l3 6 6 .8-4.5 4.2 1.2 6.5L12 17.3 6.3 20.5l1.2-6.5L3 9.8 9 9z",
		swap: "M7 7h12l-3-3M17 17H5l3 3",
		eject: "M12 5l7 8H5zM5 18h14",
	};
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill={name === "star-fill" ? "currentColor" : "none"} stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
	<path d={P[name === "star-fill" ? "star" : name] ?? ""} />
</svg>
