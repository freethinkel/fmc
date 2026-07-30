// The document itself, and the history around it. `Doc` is immutable: every edit is a function
// from the old document to a new one, which is what makes undo a stack of references rather than
// a stack of serialized trees — the untouched parts are shared, so a checkpoint costs a pointer.
//
// History is a store, not module state, and every transition computes the next document AND the
// next stacks in ONE fn: splitting them across two samples would let one read a store the other
// had already moved, which is exactly how an undo ends up off by one entry.
import { createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import { patchLayer } from "../core/document/edits";
import { withName } from "../core/document/factory";
import type { Doc, ImageCache, ImageId, Layer, NodeId } from "../core/document/doc";

interface History {
  readonly undo: readonly Doc[];
  readonly redo: readonly Doc[];
  /** When the last entry was pushed, for coalescing a drag into one entry. */
  readonly lastCp: number;
}

const EMPTY: History = { undo: [], redo: [], lastCp: 0 };
const LIMIT = 100;

const pushed = (h: History, doc: Doc, at: number): History => ({
  undo: [...h.undo, doc].slice(-LIMIT),
  redo: [],
  lastCp: at,
});

// ---- stores ----
export const $doc = createStore<Doc | null>(null);
export const $history = createStore<History>(EMPTY);
/** Edited since it was loaded — drives the "unsaved" affordances and preview regeneration. */
export const $dirty = createStore(false);
export const $fileLabel = createStore("");
export const $undoN = $history.map((h) => h.undo.length);
export const $redoN = $history.map((h) => h.redo.length);

// ---- events ----
/** Checkpoint, then edit — what every user-visible action fires. */
export const committed = createEvent<{ edit: (doc: Doc) => Doc; coalesce?: number }>();
/** Change one layer's fields. Pair it with `checkpoint` when the change should be undoable —
 *  a props-panel input checkpoints on first keystroke and then patches on every one. */
export const layerPatched = createEvent<{ id: NodeId; patch: Partial<Layer> }>();
/** Payload: coalesce window in ms (default 600) — a slider drag makes one history entry. */
export const checkpoint = createEvent<number | void>();
export const undo = createEvent();
export const redo = createEvent();
export const renameFace = createEvent<string>();
/** A freshly opened or created document, replacing whatever was loaded. `cache` carries the
 *  decoded pixels, so the document and something to draw arrive in the same update. */
export const docLoaded = createEvent<{
  doc: Doc;
  label: string;
  dirty?: boolean;
  cache?: ReadonlyMap<ImageId, ImageCache>;
}>();

/** Both halves of a transition, so the document and the stacks always move together. `changed`
 *  is false when the edit was a no-op — a rejected move, a patch that changed nothing. Those
 *  must not spend a history entry, or undo silently does nothing the first time it is pressed. */
const stepped = createEvent<{ doc: Doc; history: History; changed: boolean }>();
const changed = ({ changed }: { changed: boolean }) => changed;

// ---- business logic ----
sample({
  clock: stepped,
  filter: changed,
  fn: ({ doc }) => doc,
  target: $doc,
});
sample({
  clock: stepped,
  filter: changed,
  fn: ({ history }) => history,
  target: $history,
});
sample({
  clock: stepped,
  filter: changed,
  fn: () => true,
  target: $dirty,
});

sample({
  clock: committed,
  source: { doc: $doc, h: $history },
  filter: ({ doc }) => Boolean(doc),
  fn: ({ doc, h }, { edit, coalesce = 0 }) => {
    const next = edit(doc!);

    // the pure edits return the document unchanged (by reference) when they reject the request
    if (next === doc) return { doc: doc!, history: h, changed: false };
    const now = Date.now();

    return {
      doc: next,
      history: now - h.lastCp >= coalesce ? pushed(h, doc!, now) : h,
      changed: true,
    };
  },
  target: stepped,
});
sample({
  clock: layerPatched,
  source: $doc,
  filter: Boolean,
  fn: (doc, { id, patch }) => patchLayer(doc, id, patch),
  target: $doc,
});
sample({
  clock: layerPatched,
  fn: () => true,
  target: $dirty,
});
sample({
  clock: renameFace,
  source: $doc,
  filter: (doc, name) => Boolean(doc && doc.name !== name),
  fn: (doc, name) => withName(doc!, name),
  target: $doc,
});

// ---- history ----
sample({
  clock: checkpoint,
  source: { doc: $doc, h: $history },
  filter: ({ doc, h }, coalesce) =>
    Boolean(doc) && Date.now() - h.lastCp >= ((coalesce as number | undefined) ?? 600),
  fn: ({ doc, h }) => pushed(h, doc!, Date.now()),
  target: $history,
});
sample({
  clock: undo,
  source: { doc: $doc, h: $history },
  filter: ({ doc, h }) => Boolean(doc) && h.undo.length > 0,
  fn: ({ doc, h }) => ({
    doc: h.undo[h.undo.length - 1],
    // lastCp 0: the next edit opens its own entry instead of coalescing into the restored one
    history: { undo: h.undo.slice(0, -1), redo: [...h.redo, doc!], lastCp: 0 },
    changed: true,
  }),
  target: stepped,
});
sample({
  clock: redo,
  source: { doc: $doc, h: $history },
  filter: ({ doc, h }) => Boolean(doc) && h.redo.length > 0,
  fn: ({ doc, h }) => ({
    doc: h.redo[h.redo.length - 1],
    history: { undo: [...h.undo, doc!], redo: h.redo.slice(0, -1), lastCp: 0 },
    changed: true,
  }),
  target: stepped,
});

// ---- loading ----
sample({
  clock: docLoaded,
  fn: ({ doc }) => doc,
  target: $doc,
});
sample({
  clock: docLoaded,
  fn: ({ label }) => label,
  target: $fileLabel,
});
sample({
  clock: docLoaded,
  fn: ({ dirty = false }) => dirty,
  target: $dirty,
});
reset({ clock: docLoaded, target: $history });
