import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { app } from "./lib/app.svelte";
import { applyTheme } from "./lib/theme";

applyTheme();

mount(App, { target: document.getElementById("app")! });
app.start();

// Offline support and home-screen install (needs HTTPS, as on GitHub Pages).
if ("serviceWorker" in navigator && import.meta.env.PROD) {
	addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
