// Everything the user can do to the layer tree. Each action is an event a component fires plus a
// pure `Doc -> Doc` edit handed to `committed`, so the history and the "what changed" logic stay
// in one place — this file only decides which edit runs and what ends up selected.
import { attach, createEffect, createEvent, sample } from "effector";
import { SCREEN } from "../core/render/screen";
import { renderDoc } from "../core/render/render";
import { blankFrame, resourceFromFile } from "../core/render/pixels";
import {
  addLayer,
  cloneLayer,
  containerOrigin,
  findLayer,
  insertAfter,
  moveLayer,
  parentOf,
  patchLayer,
  removeLayer,
  setSlotBinding,
  shiftLayer,
  ungroup,
  wrapInGroup,
} from "../core/document/edits";
import {
  SLOT_METRICS,
  SLOT_SIZE,
  newCondition,
  newGroup,
  newHand,
  newImage,
  newNumber,
  newRing,
  newSlot,
} from "../core/document/factory";
import { FRAME_LABELS } from "../core/document/sources";
import {
  framesOf,
  newImageId,
  type Doc,
  type ImageAsset,
  type ImageCache,
  type ImageId,
  type Layer,
  type NodeId,
} from "../core/document/doc";
import { $doc, committed, docLoaded } from "./doc.model";
import { $screen, $sel, $selected, select } from "./selection.model";
import { $cache, cachePatched } from "./assets.model";
import { $sim } from "./sim.model";
import { errored } from "./ui.model";

/** Figma-style alignment direction. */
export type AlignDir = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
export type WidgetKind = "image" | "number" | "hand";

/** Frames dropped by a shrinking source change, keyed by layer. Switching month (12 frames) to
 *  weekday (7) trims the run but keeps the originals here, so switching back restores the art
 *  instead of 7 blanks. Cleared when the selection moves on — that's when the trim is permanent. */
let frameStash = new Map<NodeId, readonly ImageId[]>();

const withAssets = (doc: Doc, added: ReadonlyMap<ImageId, ImageAsset>): Doc => ({
  ...doc,
  images: new Map([...doc.images, ...added]),
});

// ---- events ----
export const deleteRequested = createEvent();
export const nodeAdded = createEvent<"group" | "ring">();
export const widgetAdded = createEvent<{ kind: WidgetKind; files: File[] }>();
export const slotAdded = createEvent();
export const duplicateRequested = createEvent();
export const groupRequested = createEvent();
export const ungroupRequested = createEvent();
export const moveRequested = createEvent<{
  id: NodeId;
  target: NodeId;
  after: boolean;
  into?: boolean;
}>();
export const conditionToggled = createEvent<NodeId>();
export const slotBindSet = createEvent<{ id: NodeId; slot: number | null; metric?: number }>();
export const frameMoved = createEvent<{ id: NodeId; from: number; to: number }>();
export const alignRequested = createEvent<AlignDir>();
/** meta.source — the data a widget reads. Not a plain patch: value-indexed sources also fix the
 *  widget's frame count. */
export const sourceIdSet = createEvent<{ id: NodeId; source: number }>();
/** A layer that was just created and should become the selection. */
const selectAdded = createEvent<{ added: NodeId }>();

// ---- effects ----
// A widget needs its images read and encoded before there is a layer to add, so unlike the
// group/ring it can't be a plain synchronous edit.
const addWidgetFx = attach({
  source: $screen,
  async effect(screen, { kind, files }: { kind: WidgetKind; files: File[] }) {
    if (!files.length) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cache = new Map<ImageId, ImageCache>();

    for (const file of files) {
      const r = await resourceFromFile(file, 5);
      const id = newImageId();

      assets.set(id, { id, cf: r.cf, w: r.w, h: r.h, data: r.data });
      cache.set(id, { bitmap: r.bitmap });
    }
    const ids = [...assets.keys()];
    const first = assets.get(ids[0])!;
    const layer =
      kind === "image" ? newImage(ids) : kind === "number" ? newNumber(ids) : newHand(ids, first);

    return { screen, assets, cache, layer };
  },
});

// A slot needs one placeholder plus one icon per metric, all blank frames to be encoded first.
const addSlotFx = attach({
  source: { doc: $doc, screen: $screen },
  async effect({ doc, screen }) {
    if (!doc) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cache = new Map<ImageId, ImageCache>();

    for (let i = 0; i <= SLOT_METRICS.length; i++) {
      const r = await blankFrame(SLOT_SIZE, SLOT_SIZE);
      const id = newImageId();

      assets.set(id, { id, cf: r.cf, w: r.w, h: r.h, data: r.data });
      cache.set(id, { bitmap: r.bitmap });
    }
    // the slot index is its position among the screen's existing slots — that's what the
    // 0x79 + index condition on its sibling groups is keyed to (no exceptions in the corpus)
    let slots = 0;
    const tally = (ls: readonly Layer[]) => {
      for (const l of ls) {
        if (l.kind === "slot") slots++;
        if (l.kind === "group") tally(l.children);
        if (l.kind === "raw" && l.children) tally(l.children);
      }
    };

    tally(doc.screens.find((s) => s.kind === screen)?.layers ?? []);
    return { screen, assets, cache, layer: newSlot(slots, [...assets.keys()]) };
  },
});

// A value-indexed frame set (AM/PM, weekday, month) has a length the format fixes: the widget
// draws frames[value % count], so a 7-frame set bound to `month` shows the wrong art for five
// months of the year. Picking one of those sources resizes the run to match — missing slots
// become transparent placeholders to drop art on, extra ones are trimmed (and stashed).
const sourceIdFx = attach({
  source: $doc,
  async effect(doc, { id, source }: { id: NodeId; source: number }) {
    const l = doc ? findLayer(doc, id) : null;

    if (!doc || !l || l.kind === "group" || l.kind === "raw") return null;
    const need = FRAME_LABELS[source]?.length;
    const have = frameStash.get(id) ?? framesOf(l);
    const assets = new Map<ImageId, ImageAsset>();
    const cache = new Map<ImageId, ImageCache>();
    let frames = have.length && need ? have.slice(0, need) : null;

    if (have.length && need && need > have.length) {
      const first = doc.images.get(have[0]);

      frames = [...have];
      for (let i = have.length; i < need && first; i++) {
        const r = await blankFrame(first.w, first.h);
        const fresh = newImageId();

        assets.set(fresh, { id: fresh, cf: r.cf, w: r.w, h: r.h, data: r.data });
        cache.set(fresh, { bitmap: r.bitmap });
        frames.push(fresh);
      }
    }
    return { id, source, frames, assets, cache, kind: l.kind, stash: have };
  },
});

// Figma-style alignment: nudge the selected layer so its RENDERED bounding box lands on the
// container's edge or centre. Delta-based off the render hits, so it works uniformly for groups
// (frame x/y), widgets (own x/y) and group children whose drawn position differs from their raw
// coordinates. Runs two passes: patching can change a coordinate's meaning mid-flight (a packed
// number's y=0 draws frame-centred, any nonzero y is literal), so the first delta may land off
// target and a second measure-and-nudge converges.
// ponytail: AUTO children (meta.auto) ignore x/y entirely, so they don't move. Aligning to the
// selection's shared bounding box (Figma's multi-select behaviour) is a different feature.
const alignFx = attach({
  source: { doc: $doc, cache: $cache, sim: $sim, screen: $screen, selected: $selected },
  effect({ doc, cache, sim, screen, selected }, dir: AlignDir) {
    if (!doc || !selected.length) return null;
    const c = document.createElement("canvas");

    c.width = c.height = SCREEN;
    const ctx = c.getContext("2d")!;
    let next = doc;

    const alignOne = (id: NodeId) => {
      for (let pass = 0; pass < 2; pass++) {
        const hits = renderDoc(ctx, next, { assets: next.images, cache }, screen, sim);
        const h = hits.findLast((x) => x.layer.id === id);
        const l = findLayer(next, id);

        if (!h || !l) return;
        const parent = parentOf(next, id);
        let cont = { x: 0, y: 0, w: SCREEN, h: SCREEN };

        if (parent) {
          const ph = hits.findLast((x) => x.layer.id === parent.id);

          // auto-sized frames report w/h 0 — fall back to the screen for those
          if (ph) cont = { x: ph.x, y: ph.y, w: ph.w || SCREEN, h: ph.h || SCREEN };
        }
        let dx =
          dir === "left"
            ? cont.x - h.x
            : dir === "hcenter"
              ? Math.round(cont.x + (cont.w - h.w) / 2 - h.x)
              : dir === "right"
                ? cont.x + cont.w - h.w - h.x
                : 0;
        let dy =
          dir === "top"
            ? cont.y - h.y
            : dir === "vcenter"
              ? Math.round(cont.y + (cont.h - h.h) / 2 - h.y)
              : dir === "bottom"
                ? cont.y + cont.h - h.h - h.y
                : 0;

        // a hand's bbox rotates with the live angle — centring means "pivot on the container
        // centre", not "AABB centred", which would drift with the current second
        if (l.kind === "hand") {
          if (dir === "hcenter") dx = Math.round(cont.x + cont.w / 2) - l.pivotX - l.x;
          if (dir === "vcenter") dy = Math.round(cont.y + cont.h / 2) - l.pivotY - l.y;
        }
        if (!dx && !dy) return;
        next = patchLayer(next, id, shiftLayer(l, dx, dy) as Partial<Layer>);
      }
    };

    selected.forEach((l) => alignOne(l.id));
    return next === doc ? null : next;
  },
});

// ---- business logic ----
sample({
  clock: deleteRequested,
  source: $selected,
  filter: (selected) => selected.length > 0,
  fn: (selected) => ({
    // ponytail: orphaned assets stay in the file — harmless to the watch, and toLegacy's layout
    // walk drops anything nothing points at anyway
    edit: (doc: Doc) => selected.reduce((d, l) => removeLayer(d, l.id), doc),
  }),
  target: committed,
});

/** Layers that need no bitmap at all: an empty group, or a procedural progress ring. */
sample({
  clock: nodeAdded,
  source: $screen,
  fn: (screen, kind) => {
    const layer = kind === "group" ? newGroup() : newRing();

    return { edit: (doc: Doc) => addLayer(doc, screen, layer), added: layer.id };
  },
  target: [committed, selectAdded],
});
sample({
  clock: selectAdded,
  fn: ({ added }) => added,
  target: select,
});

sample({
  clock: widgetAdded,
  target: addWidgetFx,
});
sample({
  clock: slotAdded,
  target: addSlotFx,
});
sample({
  clock: [addWidgetFx.doneData, addSlotFx.doneData],
  filter: Boolean,
  fn: ({ screen, assets, layer }) => ({
    edit: (doc: Doc) => addLayer(withAssets(doc, assets), screen, layer),
  }),
  target: committed,
});
sample({
  clock: [addWidgetFx.doneData, addSlotFx.doneData],
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
sample({
  clock: [addWidgetFx.doneData, addSlotFx.doneData],
  filter: Boolean,
  fn: ({ layer }) => layer.id,
  target: select,
});

// ponytail: the copy shares its assets with the original, so resize/adjust/invert on one hits
// both. Splitting them means cloning every frame — do it if that ever surprises anyone.
sample({
  clock: duplicateRequested,
  source: $selected,
  filter: (selected) => selected.length > 0,
  // cloned here rather than inside the edit so the new ids are known now and the selection can
  // move to the copy, the way duplicating in any editor behaves
  fn: (selected) => {
    const copies = selected.map(cloneLayer);

    return {
      edit: (doc: Doc) => selected.reduce((d, l, i) => insertAfter(d, l.id, copies[i]), doc),
      added: copies[0].id,
    };
  },
  target: [committed, selectAdded],
});

/** Wrap the selection in a new group, in place. ponytail: screen-level only — a group nested in
 *  another group is laid out by the parent's flex rules (x=0 means "centre me"), so the wrapper
 *  couldn't keep its child where it was without solving that layout first. */
sample({
  clock: groupRequested,
  source: { doc: $doc, selected: $selected },
  filter: ({ doc, selected }) =>
    Boolean(doc) &&
    selected.length > 0 &&
    // one parent at a time, and only straight off a screen
    selected.every((l) => parentOf(doc!, l.id) === null),
  fn: ({ selected }) => {
    const group = newGroup();

    return {
      edit: (doc: Doc) => {
        // draw order is layer order: the group takes the bottom-most member's slot, keeping order
        const first = selected[0];
        let next = wrapInGroup(doc, first.id, group);

        for (const l of selected.slice(1)) {
          next = moveLayer(next, l.id, group.id, false, true);
        }
        return next;
      },
      added: group.id,
    };
  },
  target: [committed, selectAdded],
});

sample({
  clock: ungroupRequested,
  source: { doc: $doc, sel: $sel },
  filter: ({ doc, sel }) => Boolean(doc && sel && findLayer(doc, sel)?.kind === "group"),
  fn: ({ sel }) => ({ edit: (doc: Doc) => ungroup(doc, sel!) }),
  target: committed,
});

// Drop a layer next to `target` (layer order is draw order, so within one parent this is
// z-ordering), or INTO it when `into` — that's how a layer gets into a group. A child's x/y is
// measured from its container's frame, so a cross-parent move shifts it by the difference of the
// two origins and it stays visually put.
sample({
  clock: moveRequested,
  source: $doc,
  filter: Boolean,
  fn: (doc, { id, target, after, into = false }) => ({
    edit: (d: Doc) => {
      const from = parentOf(d, id)?.id ?? null;
      const to = into ? target : (parentOf(d, target)?.id ?? null);
      const moved = moveLayer(d, id, target, after, into);

      if (from === to) return moved;
      const a = containerOrigin(d, from),
        b = containerOrigin(d, to);
      const l = findLayer(moved, id);

      return l
        ? patchLayer(moved, id, shiftLayer(l, a.x - b.x, a.y - b.y) as Partial<Layer>)
        : moved;
    },
  }),
  target: committed,
});

/** Add or remove the selected layer's visibility condition. */
sample({
  clock: conditionToggled,
  source: $doc,
  filter: (doc, id) => Boolean(doc && findLayer(doc, id)),
  fn: (doc, id) => ({
    edit: (d: Doc) => {
      const l = findLayer(d, id)!;

      return patchLayer(d, id, {
        conditions: l.conditions.length ? [] : [newCondition()],
      } as Partial<Layer>);
    },
  }),
  target: committed,
});

sample({
  clock: slotBindSet,
  fn: ({ id, slot, metric }) => ({
    edit: (doc: Doc) => setSlotBinding(doc, id, slot, metric),
  }),
  target: committed,
});

// Reorder a widget's frames — for value-indexed sets (weekday, month, AM/PM) the index IS the
// value, so this is how a set imported in the wrong order gets fixed. Unlike the legacy tree,
// where frames were a base offset plus a count and the resources themselves had to be swapped,
// a Doc layer holds a plain list of asset ids: reordering it is the whole edit, and toLegacy
// lays the run out again on the way to bytes.
sample({
  clock: frameMoved,
  source: $doc,
  filter: (doc, { id, from, to }) => {
    const l = doc ? findLayer(doc, id) : null;
    const frames = l ? framesOf(l) : [];

    return (
      Boolean(l) &&
      from !== to &&
      from >= 0 &&
      from < frames.length &&
      to >= 0 &&
      to < frames.length
    );
  },
  fn: (doc, { id, from, to }) => ({
    edit: (d: Doc) => {
      const l = findLayer(d, id)!;
      const frames = [...framesOf(l)];
      const [moved] = frames.splice(from, 1);

      frames.splice(to, 0, moved);
      return patchLayer(
        d,
        id,
        (l.kind === "number" ? { glyphs: frames } : { frames }) as Partial<Layer>,
      );
    },
  }),
  target: committed,
});

sample({
  clock: sourceIdSet,
  target: sourceIdFx,
});
sample({
  clock: sourceIdFx.doneData,
  filter: Boolean,
  fn: ({ id, source, frames, assets, kind }) => ({
    edit: (doc: Doc) => {
      const l = findLayer(doc, id);

      if (!l || l.kind === "group" || l.kind === "raw") return doc;
      const framesPatch = frames ? (kind === "number" ? { glyphs: frames } : { frames }) : {};

      return patchLayer(withAssets(doc, assets), id, {
        meta: { ...l.meta, source },
        ...framesPatch,
      } as Partial<Layer>);
    },
  }),
  target: committed,
});
sample({
  clock: sourceIdFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});

sample({
  clock: alignRequested,
  target: alignFx,
});
sample({
  clock: alignFx.doneData,
  filter: Boolean,
  fn: (doc) => ({ edit: () => doc }),
  target: committed,
});

// The stash is module state keyed by layer, so writing it is a side effect. Trimmed frames are
// kept until the selection moves off the layer — that's the point where the trim is permanent.
const stashFramesFx = createEffect(({ id, frames }: { id: NodeId; frames: readonly ImageId[] }) => {
  frameStash.set(id, frames);
});
const clearStashFx = createEffect(() => {
  frameStash = new Map();
});

sample({
  clock: sourceIdFx.doneData,
  filter: Boolean,
  fn: ({ id, stash, frames }) => ({
    id,
    // keep whichever list is longer: that's the one holding art the other would drop
    frames: frames && frames.length > stash.length ? frames : stash,
  }),
  target: stashFramesFx,
});
sample({
  clock: [select, docLoaded],
  target: clearStashFx,
});

sample({
  clock: [addWidgetFx.failData, addSlotFx.failData, sourceIdFx.failData, alignFx.failData],
  fn: (e: Error) => e.message,
  target: errored,
});
