/// <reference types="svelte" />
/// <reference types="vite/client" />
declare module "./core.js" {
	export function bootEngine(o: {
		createPobEngine: (opts: object) => Promise<unknown>;
		manifest: { lazy: Record<string, number> };
		core: Uint8Array;
		readLazy: (path: string) => Uint8Array;
		moduleOptions?: object;
	}): Promise<{ bootMs: number; call(method: string, params?: unknown): unknown; logs: string[] }>;
}
