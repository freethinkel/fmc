// Editor chrome: which right-hand tab is open, whether the glyph generator is showing, and the
// last error. Nothing here reads the document — the panels that do import these stores and drive
// them with events; the one NodeId below is a dialog argument, not document state.
import { createEvent, createStore, sample } from "effector";
import type { NodeId } from "../core/document/doc";

// ---- stores ----
/** Right-side panel tab. Driven by the `select` event rather than derived from the selection:
 *  the selection store also changes when a simulator tweak re-selects the same layer, and
 *  deriving would flip the tab back to Properties on every input. */
export const $rightPanel = createStore<"props" | "sim">("props");
export const $err = createStore("");
/** Keep a resize proportional. One flag for both ways in: the props panel's link toggle and a
 *  corner drag on the canvas (shift inverts it there, as everywhere else). */
export const $lockAspect = createStore(true);
/** The "sprites from a font" dialog: null when closed, otherwise the layer whose frames it will
 *  replace. Opened from that layer's own inspector. */
export const $glyphDialog = createStore<NodeId | null>(null);

// ---- events ----
export const rightPanelSet = createEvent<"props" | "sim">();
export const errored = createEvent<string>();
export const lockAspectToggled = createEvent();
export const glyphDialogOpened = createEvent<NodeId>();
export const glyphDialogClosed = createEvent();

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
sample({
  clock: glyphDialogOpened,
  target: $glyphDialog,
});
sample({
  clock: glyphDialogClosed,
  fn: () => null,
  target: $glyphDialog,
});
