// Svelte action: fade the edge(s) of a scroll container that have hidden content.
// Applies a mask-image (no extra DOM) that adapts to both axes — a horizontal gradient
// and a vertical gradient composited together, so a fade shows on an edge only when
// there's more content past it. Recomputes on scroll, resize, and content changes.
import type { Action } from "svelte/action";

const FADE = "2rem";

// Param is a reactivity trigger (re-runs update on change). If it's an object with `alwaysLeft`,
// the left edge fades even at scrollLeft 0 — used by the tree so its "stem" always trails off.
type FadeParam = { dep?: unknown; alwaysLeft?: boolean } | unknown;

export const scrollFade: Action<HTMLElement, FadeParam> = (node, param) => {
  let alwaysLeft = false;
  const readParam = (p: FadeParam) => {
    alwaysLeft = !!(p && typeof p === "object" && "alwaysLeft" in p && p.alwaysLeft);
  };
  readParam(param);

  const update = () => {
    const fadeL = alwaysLeft || node.scrollLeft > 1;
    const fadeR = node.scrollLeft < node.scrollWidth - node.clientWidth - 1;
    const fadeT = node.scrollTop > 1;
    const fadeB = node.scrollTop < node.scrollHeight - node.clientHeight - 1;

    // Per axis: opaque across the middle, fading only on active edges. When neither edge
    // of an axis is active the layer is fully opaque (a no-op under intersect).
    const h = `linear-gradient(to right, transparent 0, #000 ${fadeL ? FADE : "0"}, #000 ${
      fadeR ? `calc(100% - ${FADE})` : "100%"
    }, transparent 100%)`;
    const v = `linear-gradient(to bottom, transparent 0, #000 ${fadeT ? FADE : "0"}, #000 ${
      fadeB ? `calc(100% - ${FADE})` : "100%"
    }, transparent 100%)`;
    const mask = `${h}, ${v}`;

    node.style.maskImage = mask;
    node.style.webkitMaskImage = mask;
    node.style.maskComposite = "intersect";
    node.style.webkitMaskComposite = "source-in";
  };

  update();
  node.addEventListener("scroll", update, { passive: true });
  const ro = new ResizeObserver(update);
  ro.observe(node);
  if (node.firstElementChild) ro.observe(node.firstElementChild);

  return {
    update(p: FadeParam) {
      readParam(p);
      update();
    },
    destroy() {
      node.removeEventListener("scroll", update);
      ro.disconnect();
    },
  };
};
