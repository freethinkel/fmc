// Editor chrome: which right-hand tab is open, and the last error to show. Nothing here knows
// about the document — the panels that do import these stores and drive them with events.
import { createEvent, createStore, sample } from "effector";

// ---- stores ----
/** Right-side panel tab. Driven by the `select` event rather than derived from the selection:
 *  the selection store also changes when a simulator tweak re-selects the same layer, and
 *  deriving would flip the tab back to Properties on every input. */
export const $rightPanel = createStore<"props" | "sim">("props");
export const $err = createStore("");
/** Keep a resize proportional. One flag for both ways in: the props panel's link toggle and a
 *  corner drag on the canvas (shift inverts it there, as everywhere else). */
export const $lockAspect = createStore(true);

// ---- events ----
export const rightPanelSet = createEvent<"props" | "sim">();
export const errored = createEvent<string>();
export const lockAspectToggled = createEvent();

// ---- business logic ----
sample({
  clock: rightPanelSet,
  target: $rightPanel,
});
sample({
  clock: errored,
  target: $err,
});
sample({
  clock: lockAspectToggled,
  source: $lockAspect,
  fn: (on) => !on,
  target: $lockAspect,
});
