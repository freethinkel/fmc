// What is selected, and which screen is being edited. Layers are referenced by id, never by
// object: the document is immutable, so every edit hands back fresh layer objects and a stored
// reference would go stale on the next keystroke.
import { combine, createEvent, createStore, sample } from "effector";
import { findLayer } from "../core/document/edits";
import type { Layer, NodeId, Screen } from "../core/document/doc";
import { $doc } from "./doc.model";
import { $rightPanel } from "./ui.model";

// ---- stores ----
/** The primary selection — everything single-layer (props panel, resize handles) reads this. */
export const $sel = createStore<NodeId | null>(null);
/** Extra layers selected on top of `$sel`. */
export const $more = createStore<readonly NodeId[]>([]);
export const $screen = createStore<Screen["kind"]>("main");

/** The whole selection as layers, primary first — the shape most components want. */
export const $selected = combine($doc, $sel, $more, (doc, sel, more): Layer[] => {
  if (!doc || !sel) return [];
  return [sel, ...more].map((id) => findLayer(doc, id)).filter((l): l is Layer => Boolean(l));
});

// ---- events ----
export const select = createEvent<NodeId | null>(); // replaces the selection
export const selectToggled = createEvent<NodeId>(); // ctrl/cmd/shift-click: add or remove one
export const screenSet = createEvent<Screen["kind"]>();
/** The whole selection at once, primary first — the one place $sel and $more are written. */
export const selectionSet = createEvent<readonly NodeId[]>();

// ---- business logic ----
sample({
  clock: selectionSet,
  fn: (ids) => ids[0] ?? null,
  target: $sel,
});
sample({
  clock: selectionSet,
  fn: (ids) => ids.slice(1),
  target: $more,
});
sample({
  clock: select,
  fn: (id) => (id ? [id] : []),
  target: selectionSet,
});
sample({
  clock: selectToggled,
  source: { sel: $sel, more: $more },
  // already in the selection: drop it and promote whatever is left; otherwise it becomes primary
  fn: ({ sel, more }, id) => {
    const all = sel ? [sel, ...more] : [];

    return all.includes(id) ? all.filter((n) => n !== id) : [id, ...all];
  },
  target: selectionSet,
});
sample({
  clock: screenSet,
  target: $screen,
});
// opening a layer's properties is what the user means by clicking it
sample({
  clock: [select, selectToggled],
  filter: Boolean,
  fn: () => "props" as const,
  target: $rightPanel,
});
// an edit can delete what was selected — drop ids the document no longer holds rather than
// leaving the props panel pointed at a layer that is gone
sample({
  clock: $doc,
  source: { sel: $sel, more: $more },
  filter: ({ sel, more }, doc) =>
    Boolean(
      (sel && !(doc && findLayer(doc, sel))) || more.some((id) => !doc || !findLayer(doc, id)),
    ),
  fn: ({ sel, more }, doc) => {
    const live = (id: NodeId) => Boolean(doc && findLayer(doc, id));

    return [...(sel && live(sel) ? [sel] : []), ...more.filter(live)];
  },
  target: selectionSet,
});
