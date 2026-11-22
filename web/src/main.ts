import { mount } from "svelte";
import "./app.css";
import App from "./App.svelte";
import { app } from "./lib/app.svelte";

mount(App, { target: document.getElementById("app")! });
app.start();
