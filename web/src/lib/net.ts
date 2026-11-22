// Reading other sites: build-sharing links (PoB's buildSites.websiteList),
// Mobalytics, and pathofexile.com character data. Most of these sites do not
// allow cross-origin reads, so requests fall back to the user's relay
// (relay/worker.js) when one is set in Settings.

const RELAY_KEY = "pob-mobile:relay";

export const relay = {
	get: () => localStorage.getItem(RELAY_KEY) ?? "",
	set: (url: string) => (url.trim() ? localStorage.setItem(RELAY_KEY, url.trim().replace(/\/+$/, "")) : localStorage.removeItem(RELAY_KEY)),
};

export class RelayNeeded extends Error {
	constructor(host: string) {
		super(
			`${host} doesn't let other websites read it. Set up the relay in Builds → Settings (instructions in the repo's relay folder), or copy the build code from the site and paste that.`,
		);
	}
}

/** Fetches through the relay when there is one, else directly. */
export async function fetchText(url: string, init: RequestInit = {}): Promise<{ status: number; text: string }> {
	const host = new URL(url).hostname;
	const r = relay.get();
	const target = r ? `${r}/?url=${encodeURIComponent(url)}` : url;
	let res: Response;
	try {
		res = await fetch(target, init);
	} catch {
		if (!r) throw new RelayNeeded(host);
		throw new Error(`Could not reach the relay at ${new URL(r).host}. Check its URL in Settings.`);
	}
	return { status: res.status, text: await res.text() };
}

interface Site {
	label: string;
	match: RegExp;
	download: (m: RegExpMatchArray) => string;
}

// PoB's buildSites.websiteList (Modules/BuildSiteTools.lua), PoE1 endpoints.
const SITES: Site[] = [
	{ label: "Maxroll", match: /maxroll\.gg\/poe\/pob\/([^/?#\s]+)/, download: (m) => `https://maxroll.gg/poe/api/pob/${m[1]}` },
	{ label: "pob.codes", match: /pob\.codes\/b\/([^/?#\s]+)/, download: (m) => `https://api.pob.codes/${m[1]}/raw` },
	{ label: "pobb.in", match: /pobb\.in\/([^?#\s]+)/, download: (m) => `https://pobb.in/pob/${m[1].replace(/\/raw$/, "")}` },
	{ label: "poe.ninja", match: /poe\.ninja\/(?:poe1\/)?pob\/(\w+)/, download: (m) => `https://poe.ninja/poe1/pob/raw/${m[1]}` },
	{ label: "Pastebin", match: /pastebin\.com\/(?:raw\/)?(\w+)/, download: (m) => `https://pastebin.com/raw/${m[1]}` },
	{ label: "PastebinP", match: /pastebinp\.com\/(?:raw\/)?(\w+)/, download: (m) => `https://pastebinp.com/raw/${m[1]}` },
	{ label: "Rentry", match: /rentry\.co\/(\w+)/, download: (m) => `https://rentry.co/paste/${m[1]}/raw` },
	{ label: "poedb.tw", match: /poedb\.tw\/pob\/([^/?#\s]+)/, download: (m) => `https://poedb.tw/pob/${m[1]}/raw` },
];

export const SUPPORTED_SITES = "pobb.in, poe.ninja, Maxroll, Mobalytics, pob.codes, Pastebin, Rentry, poedb.tw";

/** A share link's build code (or a pobb.in link for Mobalytics, which is then followed). */
export async function fetchBuildLink(link: string, depth = 0): Promise<string> {
	const url = link.trim();
	if (/mobalytics\.gg\/poe-2\//.test(url)) throw new Error("That is a Path of Exile 2 build. This app runs Path of Building for Path of Exile 1.");
	if (/poe\.ninja\/poe2\/|maxroll\.gg\/poe2\/|poe2db\.tw/.test(url)) throw new Error("That is a Path of Exile 2 build. This app runs Path of Building for Path of Exile 1.");
	const moba = /mobalytics\.gg\/poe\/builds\/([^/?#\s]+)/.exec(url);
	if (moba) {
		const code = await mobalytics(moba[1]);
		if (/^https?:\/\//.test(code) && depth < 2) return fetchBuildLink(code, depth + 1);
		return code;
	}
	for (const s of SITES) {
		const m = url.match(s.match);
		if (!m) continue;
		const { status, text } = await fetchText(s.download(m));
		if (status !== 200) throw new Error(`${s.label} answered HTTP ${status}. Check the link.`);
		const code = text.trim();
		if (!code) throw new Error(`${s.label} returned an empty build.`);
		return code;
	}
	throw new Error(`Not a link I know. Supported: ${SUPPORTED_SITES}. Or paste the build code itself.`);
}

const MOBA_QUERY =
	"query PobReduxDocumentBySlug($input: PoeUserGeneratedDocumentInputBySlug!) { poe { documents { userGeneratedDocumentBySlug(input: $input) { error errorMessage data { id data { pobCode } } } } } }";

/** Mobalytics keeps a PoE1 build's PoB code behind its GraphQL API (as PoB Redux reads it). */
async function mobalytics(slug: string): Promise<string> {
	const { status, text } = await fetchText("https://mobalytics.gg/api/poe/v1/graphql/query", {
		method: "POST",
		headers: { "Content-Type": "application/json", Accept: "application/json" },
		body: JSON.stringify({ operationName: "PobReduxDocumentBySlug", variables: { input: { slug, type: "builds" } }, query: MOBA_QUERY }),
	});
	if (status !== 200) throw new Error(`Mobalytics answered HTTP ${status}.`);
	const j = JSON.parse(text);
	const doc = j?.data?.poe?.documents?.userGeneratedDocumentBySlug;
	if (doc?.error) throw new Error(String(doc.error).startsWith("NOT_FOUND") ? "Mobalytics has no build with that link." : `Mobalytics: ${doc.error}`);
	const code = String(doc?.data?.data?.pobCode ?? "").trim();
	if (!code) throw new Error("That Mobalytics build has no Path of Building code.");
	return code;
}

// --- uploads (PoB's postUrl / postFields / codeOut) ---------------------------

export const UPLOADS = [
	{ label: "pobb.in", url: "https://pobb.in/pob/", fields: "", out: "https://pobb.in/" },
	{ label: "poe.ninja", url: "https://poe.ninja/poe1/pob/api/upload", fields: "code=", out: "" },
	{ label: "Maxroll", url: "https://maxroll.gg/poe/api/pob", fields: "pobCode=", out: "https://maxroll.gg/poe/pob/" },
] as const;

export async function uploadBuild(target: (typeof UPLOADS)[number], code: string): Promise<string> {
	const { status, text } = await fetchText(target.url, {
		method: "POST",
		headers: { "Content-Type": target.fields ? "application/x-www-form-urlencoded" : "text/plain" },
		body: target.fields ? target.fields + encodeURIComponent(code) : code,
	});
	if (status !== 200 || !text.trim()) throw new Error(`${target.label} answered HTTP ${status}.`);
	return target.out + text.trim();
}

// --- pathofexile.com characters (ImportTab's character-window requests) ------

export interface CharacterEntry {
	name: string;
	league: string;
	class: string;
	level: number;
	classId?: number;
	ascendancyClass?: number;
}

const POE = "https://www.pathofexile.com/";
export const REALMS = [
	{ code: "pc", label: "PC" },
	{ code: "xbox", label: "Xbox" },
	{ code: "sony", label: "PlayStation" },
];

function account(name: string, realm: string): string {
	let a = realm === "pc" ? name.replace(/\s+/g, "") : name.trim().replace(/\s/g, "+");
	a = a.replace(/(.*)[#-]/, "$1#");
	return encodeURIComponent(a);
}

/** The account's characters, and the account name as GGG spells it (later requests are case-sensitive). */
export async function listCharacters(name: string, realm = "pc"): Promise<{ account: string; characters: CharacterEntry[] }> {
	const acc = account(name, realm);
	const r = await fetchText(`${POE}character-window/get-characters?accountName=${acc}&realm=${realm}`);
	if (r.status === 401 || r.status === 403) throw new Error("That account's profile is private, or it does not exist. Make the Characters tab public on pathofexile.com.");
	if (r.status === 404) throw new Error("No account with that name. Use the full name with its #1234 tag.");
	if (r.status !== 200) throw new Error(`pathofexile.com answered HTTP ${r.status}.`);
	const characters = JSON.parse(r.text) as CharacterEntry[];
	let real = acc;
	try {
		const prof = await fetchText(`${POE}account/view-profile/${acc}`);
		const m = /\/view-profile\/([^/"]+)\/characters/.exec(prof.text);
		if (m) real = m[1];
	} catch {
		/* keep the typed name */
	}
	return { account: real, characters };
}

/** GGG's data for one character, shaped as PoB's ImportTab passes it on (the OAuth API's shape). */
export async function fetchCharacter(acc: string, char: CharacterEntry, realm = "pc"): Promise<string> {
	const q = `accountName=${acc}&character=${encodeURIComponent(char.name)}&realm=${realm}`;
	const [p, i] = await Promise.all([fetchText(`${POE}character-window/get-passive-skills?${q}`), fetchText(`${POE}character-window/get-items?${q}`)]);
	for (const r of [p, i]) {
		if (r.status !== 200 || r.text.trim() === "false") throw new Error(`pathofexile.com did not return the character (HTTP ${r.status}).`);
	}
	return characterJson(p.text, i.text, char);
}

/** Builds the character data from the two pages (also used when they are pasted by hand). */
export function characterJson(passivesText: string, itemsText: string, char?: Partial<CharacterEntry>): string {
	const passives = JSON.parse(passivesText);
	const items = JSON.parse(itemsText);
	const info = { ...(items.character ?? {}), ...(char ?? {}) };
	return JSON.stringify({ ...info, passives, jewels: passives.items ?? [], equipment: items.items ?? [] });
}
