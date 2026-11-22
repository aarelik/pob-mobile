import { svelte } from "@sveltejs/vite-plugin-svelte";
import { defineConfig } from "vite";

export default defineConfig({
	base: "./",
	plugins: [svelte()],
	worker: { format: "es" },
	build: { target: "es2022" },
	server: { host: true },
});
