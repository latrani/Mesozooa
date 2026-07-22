import { mount } from "svelte";
import { registerSW } from "virtual:pwa-register";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/arsenal/700.css";
import "@fontsource/architects-daughter"; // handwritten hand for the specimen curator slips
import "./lib/styles/tokens.css";
import "./lib/styles/base.css";
import App from "./App.svelte";

// autoUpdate registers a new service worker on deploy but does NOT repaint open tabs on its own
// ("automatic reload is not automatic page reload"). immediate: true reloads the tab once the new
// SW takes control, so a returning visitor sees the fresh build without a manual hard-reload. Safe
// because both game modes persist to localStorage and restore across the reload.
registerSW({ immediate: true });

export default mount(App, { target: document.getElementById("app")! });
