import { mount } from "svelte";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/arsenal/700.css";
import "../lib/styles/tokens.css";
import "../lib/styles/base.css";
import Gallery from "./Gallery.svelte";
import Frame from "./Frame.svelte";

// ?frame=<stateKey>&mode=<daily|practice> renders a SINGLE board state at the
// document width — used inside the responsive <iframe>s embedded by Gallery.
const params = new URLSearchParams(location.search);
const frame = params.get("frame");

const target = document.getElementById("gallery")!;
if (frame) {
  mount(Frame, { target, props: { stateKey: frame, mode: params.get("mode") ?? "practice" } });
} else {
  mount(Gallery, { target });
}
