# Relay (optional)

A web page can only read another site if that site allows it (CORS).
pathofexile.com and most build-sharing sites don't, so the app can't
import a character from your account, or open poe.ninja, Maxroll,
Mobalytics and similar links, on its own. Pasting a build code always
works without a relay.

`worker.js` is a small Cloudflare Worker that forwards those requests. It
only talks to the sites listed at the top of the file, and only answers
your app.

## Deploy (free, about 5 minutes)

1. Sign in at <https://dash.cloudflare.com> (a free account is enough).
2. Go to **Workers & Pages → Create → Create Worker**, name it, for example
   `pob-relay`, and deploy the starter.
3. Click **Edit code**, replace everything with the contents of
   `worker.js`, and click **Deploy**.
4. In the worker's **Settings → Variables and secrets**, add a plain text
   variable `ALLOW_ORIGIN` with your app's origin, for example
   `https://aarelik.github.io`.
5. Copy the worker's URL (like `https://pob-relay.<you>.workers.dev`).
6. In the app, open **Builds → Settings** and paste it into **Relay URL**.

Or with Wrangler: `npx wrangler deploy relay/worker.js --name pob-relay`.
