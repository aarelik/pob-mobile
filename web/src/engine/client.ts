// Main-thread side of the engine worker: a promise per bridge call.
import EngineWorker from "./worker.ts?worker";

export type Progress = { phase: string; loaded: number; total: number };
export type Ready = { bootMs: number; version: Record<string, unknown>; upstream: { commit: string; version: string } };

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; method: string };

export class EngineClient {
	private worker: Worker;
	private nextId = 1;
	private pending = new Map<number, Pending>();
	ready: Promise<Ready>;
	onProgress: (p: Progress) => void = () => {};
	onLazy: (path: string) => void = () => {};

	constructor() {
		this.worker = new EngineWorker();
		let resolveReady!: (r: Ready) => void, rejectReady!: (e: Error) => void;
		this.ready = new Promise((res, rej) => ((resolveReady = res), (rejectReady = rej)));
		this.worker.onmessage = (ev) => {
			const m = ev.data;
			if (m.type === "progress") return this.onProgress(m);
			if (m.type === "lazy") return this.onLazy(m.path);
			if (m.type === "ready") return resolveReady(m);
			if (m.type === "fatal") return rejectReady(new Error(m.error));
			const p = this.pending.get(m.id);
			if (!p) return;
			this.pending.delete(m.id);
			if (m.error !== undefined) p.reject(new Error(cleanError(m.error)));
			else p.resolve(m.result);
		};
		this.worker.onerror = (e) => rejectReady(new Error(e.message || "the engine worker failed to start"));
		this.worker.postMessage({ type: "init", root: new URL(".", document.baseURI).href });
	}

	call<T = unknown>(method: string, params?: unknown): Promise<T> {
		const id = this.nextId++;
		return new Promise<T>((resolve, reject) => {
			this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, method });
			this.worker.postMessage({ id, method, params });
		});
	}
}

/** Bridge errors carry a Lua traceback; the first line is the message. */
export function cleanError(msg: string): string {
	return msg.split("\nstack traceback:")[0].replace(/^[^:]*\.lua:\d+: /, "").trim();
}
