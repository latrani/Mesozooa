import { mount } from "svelte";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/arsenal/700.css";
import "@fontsource/architects-daughter"; // handwritten hand for the specimen curator slips
import "./lib/styles/tokens.css";
import "./lib/styles/base.css";
import App from "./App.svelte";

export default mount(App, { target: document.getElementById("app")! });
