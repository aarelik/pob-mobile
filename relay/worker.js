// pob-mobile relay: a Cloudflare Worker that lets the app read build-sharing
// sites and pathofexile.com character pages, which do not allow a web page on
// another site to read them (no CORS). It forwards GET and POST requests to an
// allowlisted set of hosts and adds CORS headers for your app's origin.
//
// Deploy: see relay/README.md. Set ALLOW_ORIGIN to your Pages origin, for
// example https://aarelik.github.io, so no other site can use your relay.

const HOSTS = [
	"www.pathofexile.com",
	"pathofexile.com",
	"pobb.in",
	"poe.ninja",
	"maxroll.gg",
	"api.pob.codes",
	"pastebin.com",
	"pastebinp.com",
	"rentry.co",
	"poedb.tw",
	"mobalytics.gg",
];

export default {
	async fetch(request, env) {
		const allowOrigin = env.ALLOW_ORIGIN || "*";
		const origin = request.headers.get("Origin");
		const cors = {
			"Access-Control-Allow-Origin": allowOrigin === "*" ? "*" : allowOrigin,
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Access-Control-Max-Age": "86400",
			Vary: "Origin",
		};
		if (allowOrigin !== "*" && origin && origin !== allowOrigin) {
			return new Response("origin not allowed", { status: 403, headers: cors });
		}
		if (request.method === "OPTIONS") return new Response(null, { headers: cors });
		if (request.method !== "GET" && request.method !== "POST") return new Response("method not allowed", { status: 405, headers: cors });

		const target = new URL(request.url).searchParams.get("url");
		let url;
		try {
			url = new URL(target);
		} catch {
			return new Response("missing or bad ?url=", { status: 400, headers: cors });
		}
		if (url.protocol !== "https:" || !HOSTS.includes(url.hostname)) {
			return new Response("host not allowed", { status: 403, headers: cors });
		}

		const headers = { "User-Agent": "pob-mobile relay (Path of Building for phones)", Accept: request.headers.get("Accept") || "*/*" };
		const init = { method: request.method, headers, redirect: "follow" };
		if (request.method === "POST") {
			headers["Content-Type"] = request.headers.get("Content-Type") || "application/x-www-form-urlencoded";
			init.body = await request.arrayBuffer();
		}
		if (url.hostname === "mobalytics.gg") {
			headers.Origin = "https://mobalytics.gg";
			headers.Referer = "https://mobalytics.gg/";
		}
		const res = await fetch(url.toString(), init);
		const out = new Headers(cors);
		out.set("Content-Type", res.headers.get("Content-Type") || "text/plain; charset=utf-8");
		return new Response(res.body, { status: res.status, headers: out });
	},
};
