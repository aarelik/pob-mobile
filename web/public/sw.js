// Offline support. The page and its hashed assets come from this cache when
// the network is gone; the engine worker caches the PoB data pack itself.
// Bump VERSION to drop old caches.
const VERSION = "v2";
const SHELL = `pob-mobile-shell-${VERSION}`;

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(SHELL)
			.then((c) => c.addAll(["./", "./index.html", "./manifest.webmanifest", "./icon.svg"]))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k.startsWith("pob-mobile-shell-") && k !== SHELL).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

async function networkFirst(req) {
	const cache = await caches.open(SHELL);
	try {
		const res = await fetch(req);
		if (res.ok) cache.put(req, res.clone());
		return res;
	} catch {
		const hit = (await cache.match(req)) || (req.mode === "navigate" ? await cache.match("./index.html") : null);
		if (hit) return hit;
		throw new Error("offline");
	}
}

async function cacheFirst(req) {
	const cache = await caches.open(SHELL);
	const hit = await cache.match(req);
	if (hit) return hit;
	const res = await fetch(req);
	if (res.ok) cache.put(req, res.clone());
	return res;
}

self.addEventListener("fetch", (event) => {
	const req = event.request;
	if (req.method !== "GET") return;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	const path = url.pathname;
	// The data pack is cached by the engine worker; on-demand PoB files are read
	// with synchronous requests from that worker and go straight to the network.
	if (/\/pob\/[^/]+\/(core-[0-9a-f]+\.pack|files\/)/.test(path)) return;
	// Hashed build output and tree art never change under the same name.
	if (/\/assets\//.test(path) || /\/pob\/[^/]+\/art\/[0-9a-f]+\.webp$/.test(path)) return event.respondWith(cacheFirst(req));
	// The page, the engine and the data manifest: fresh when online, cached when not.
	event.respondWith(networkFirst(req));
});
