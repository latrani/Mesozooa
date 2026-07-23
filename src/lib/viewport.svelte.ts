// One source of truth for "are we on the phone layout". Components that only need to LOOK
// different use a CSS media query; this is for the cases where BEHAVIOR differs (which chips
// get selected, whether the plaque is a sheet, whether the tree opens zoomed out).
//
// Module singleton: the listener lives for the app's lifetime by design, so there is nothing
// to tear down and every consumer observes the same boolean.
const QUERY = "(max-width: 640px)";

function createViewport() {
  // SSR/test-safe default: no matchMedia means treat it as desktop, matching BoardLayout's
  // previous behavior.
  let isPhone = $state(typeof matchMedia !== "undefined" && matchMedia(QUERY).matches);

  if (typeof matchMedia !== "undefined") {
    const mq = matchMedia(QUERY);
    mq.addEventListener("change", () => (isPhone = mq.matches));
  }

  return {
    get isPhone() {
      return isPhone;
    },
  };
}

export const viewport = createViewport();
