/** Open state for the header's stats modal, lifted to a module singleton so anything else on
 *  screen can raise the same sheet — the end-state board offers a Stats button rather than
 *  inlining a second copy of StatsContent into the cluster or the placard (#63). */
export const statsModal = $state({ open: false });
