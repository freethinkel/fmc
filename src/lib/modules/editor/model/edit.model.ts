// Everything the user can do to the layer tree. Each action is an event a component fires plus a
// pure `Doc -> Doc` edit handed to `committed`, so the history and the "what changed" logic stay
// in one place — this file only decides which edit runs and what ends up selected.
import { attach, createEffect, createEvent, createStore, sample } from "effector";
import { TAG } from "../core/format";
import { PREVIEW, SCREEN } from "../core/render/screen";
import { renderDoc } from "../core/render/render";
import { blankFrame, opaqueBlack, resourceFromFile } from "../core/render/pixels";
import { glyphSprites, type GlyphSpec } from "../core/render/glyphs";
import {
  addLayer,
  assetsOf,
  cloneLayer,
  containerOrigin,
  findLayer,
  insertAfter,
  moveLayer,
  parentOf,
  patchLayer,
  removeLayer,
  repointFrames,
  setSlotBinding,
  shiftLayer,
  siblingsOf,
  ungroup,
  wrapInGroup,
} from "../core/document/edits";
import {
  SLOT_METRICS,
  SLOT_SIZE,
  blankScreen,
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
import { $screen, $sel, $selected, screenSet, select, selectionSet } from "./selection.model";
import { $cache, cachePatched, glyphSpecRemembered } from "./assets.model";
import { $sim } from "./sim.model";
import { errored } from "./ui.model";

/** Figma-style alignment direction. */
export type AlignDir = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";
/** The widgets that are created FROM files. A number isn't one of them — its ten frames start
 *  blank and are filled from a font (see numberAdded / glyphsRequested). */
export type WidgetKind = "image" | "hand";

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
/** Rasterize a set of labels into the target widget's frames: the ten digits of a number, the
 *  labels of a value-indexed set. Replaces what the layer draws — the layer itself stays. */
export type GlyphRequest = GlyphSpec & { target: NodeId };
export const glyphsRequested = createEvent<GlyphRequest>();
/** A number widget. Always created empty — ten blank frames, filled from a font afterwards; the
 *  ten-PNG picker this used to open is what the font generator replaces. */
export const numberAdded = createEvent();
export const slotAdded = createEvent();
/** Give the face an always-on screen. A new document starts with the main screen only, and until
 *  this runs the AOD tab has nothing to show. */
export const aodAdded = createEvent();
/** Drop it again — deleting the AOD root row in the tree. The main screen has no such option:
 *  a face without one has nothing to draw. */
export const aodRemoved = createEvent();
/** The editor-only per-layer fields. One event for all of them: they behave identically — a patch
 *  over whatever is selected, or over one layer when the tree's own buttons fire it. `name` is a
 *  label the tree shows instead of the derived one; like the flags it never reaches the file. */
export const layerFlagsSet = createEvent<{
  ids: readonly NodeId[];
  patch: { hidden?: boolean; locked?: boolean; name?: string };
}>();
export const duplicateRequested = createEvent();
export const copyRequested = createEvent();
export const cutRequested = createEvent();
export const pasteRequested = createEvent();
export const groupRequested = createEvent();
export const ungroupRequested = createEvent();
export const moveRequested = createEvent<{
  id: NodeId;
  target: NodeId;
  after: boolean;
  into?: boolean;
}>();
/** ⌘] / ⌘[ — one step up or down the draw order, among the primary selection's own siblings.
 *  `moveRequested` is the tree's drag-and-drop, which needs an explicit target; this doesn't. */
export const orderMoved = createEvent<1 | -1>();
export const conditionToggled = createEvent<NodeId>();
export const slotBindSet = createEvent<{ id: NodeId; slot: number | null; metric?: number }>();
/** The metrics a slot offers the wearer — its own 0x5f list, which the companion app shows as a
 *  menu. Adding one needs an icon frame, so it goes through an effect; removing one is a plain
 *  edit. See SLOT_METRIC_CHOICES for what the corpus uses. */
export const slotMetricAdded = createEvent<{ id: NodeId; metric: number }>();
export const slotMetricRemoved = createEvent<{ id: NodeId; metric: number }>();
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

    return { screen, assets, cache, layer: kind === "image" ? newImage(ids) : newHand(ids, first) };
  },
});

// The font generator: one sprite per label, all sharing the widest cell so the value can't shift
// as it changes — that is the whole point of generating a digit set rather than drawing ten PNGs
// by hand (drawDigits packs the glyphs edge to edge, so unequal widths make the number jitter).
const glyphsFx = attach({
  source: $doc,
  async effect(doc, spec: GlyphRequest) {
    const target = doc ? findLayer(doc, spec.target) : null;

    if (!doc || !spec.labels.some((s) => s.length) || !target) return null;
    if (target.kind === "group" || target.kind === "raw" || target.locked) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cache = new Map<ImageId, ImageCache>();

    for (const { resource: r, bitmap } of await glyphSprites(spec)) {
      const id = newImageId();

      assets.set(id, { id, cf: r.cf, w: r.w, h: r.h, data: r.data });
      cache.set(id, { bitmap });
    }
    return { spec, ids: [...assets.keys()], assets, cache };
  },
});

// Ten transparent frames, one per digit: a number widget whose art comes later, from a font or
// from PNGs dropped on the frames one at a time. The size is a placeholder — both paths bring
// their own (replaceImageFx takes the file's, the generator the font cell's).
const addNumberFx = attach({
  source: $screen,
  async effect(screen) {
    const assets = new Map<ImageId, ImageAsset>();
    const cache = new Map<ImageId, ImageCache>();

    for (let i = 0; i < 10; i++) {
      const r = await blankFrame(32, 48);
      const id = newImageId();

      assets.set(id, { id, cf: r.cf, w: r.w, h: r.h, data: r.data });
      cache.set(id, { bitmap: r.bitmap });
    }
    return { screen, assets, cache, layer: newNumber([...assets.keys()]) };
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

// The AOD screen starts as a copy of the main dial, so dimming the face is editing down, not
// rebuilding from black. It still gets its own preview thumbnail (regenPreviewAssets refreshes
// it on save — sharing main's would overwrite one with the other); the copied layers get fresh
// ids but share the dial's assets, same as duplicating a layer.
const addAodFx = attach({
  source: $doc,
  async effect(doc) {
    if (!doc || doc.screens.some((s) => s.kind === "aod")) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cache = new Map<ImageId, ImageCache>();
    const add = async (r: Awaited<ReturnType<typeof opaqueBlack>>) => {
      const id = newImageId();

      assets.set(id, { id, cf: r.cf, w: r.w, h: r.h, data: r.data });
      cache.set(id, { bitmap: r.bitmap });
      return id;
    };
    const preview = await add(await opaqueBlack(PREVIEW, PREVIEW));
    const dial = (doc.screens.find((s) => s.kind === "main")?.layers ?? [])
      .filter((l) => !(l.kind === "raw" && l.tag === TAG.preview))
      .map(cloneLayer);
    // a copied dial brings its own background, so the corpus-shape black one (and its asset) is
    // only built for a face with nothing to copy — the bg id is a dummy when the layer is dropped
    let screen = blankScreen(
      "aod",
      preview,
      dial.length ? preview : await add(await opaqueBlack(SCREEN, SCREEN)),
    );

    if (dial.length) screen = { ...screen, layers: [screen.layers[0], ...dial] };
    return { assets, cache, screen };
  },
});

// A metric's icon is the frame beside it, so adding one means encoding a blank tile for the
// companion app's picker to show until the user drops art on it.
const addSlotMetricFx = attach({
  source: $doc,
  async effect(doc, { id, metric }: { id: NodeId; metric: number }) {
    const l = doc ? findLayer(doc, id) : null;

    if (!doc || l?.kind !== "slot" || l.locked || l.metrics.includes(metric)) return null;
    const r = await blankFrame(SLOT_SIZE, SLOT_SIZE);
    const frame = newImageId();

    return {
      id,
      metric,
      frame,
      assets: new Map<ImageId, ImageAsset>([
        [frame, { id: frame, cf: r.cf, w: r.w, h: r.h, data: r.data }],
      ]),
      cache: new Map<ImageId, ImageCache>([[frame, { bitmap: r.bitmap }]]),
    };
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
  effect({ doc, cache, sim, screen, selected: picked }, dir: AlignDir) {
    const selected = picked.filter((l) => !l.locked); // a locked layer holds its position

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
  clock: numberAdded,
  target: addNumberFx,
});
sample({
  clock: slotAdded,
  target: addSlotFx,
});
sample({
  clock: [addWidgetFx.doneData, addNumberFx.doneData, addSlotFx.doneData],
  filter: Boolean,
  fn: ({ screen, assets, layer }) => ({
    edit: (doc: Doc) => addLayer(withAssets(doc, assets), screen, layer),
  }),
  target: committed,
});
sample({
  clock: [addWidgetFx.doneData, addNumberFx.doneData, addSlotFx.doneData],
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
sample({
  clock: [addWidgetFx.doneData, addNumberFx.doneData, addSlotFx.doneData],
  filter: Boolean,
  fn: ({ layer }) => layer.id,
  target: select,
});

sample({
  clock: glyphsRequested,
  target: glyphsFx,
});
sample({
  clock: glyphsFx.doneData,
  filter: Boolean,
  fn: ({ spec, ids, assets }) => ({
    edit: (doc: Doc) => {
      const l = findLayer(doc, spec.target);

      if (!l || l.kind === "group" || l.kind === "raw") return doc;
      // frames only: meta (source, accent flag, digit count) is the inspector's, and a
      // regeneration must not reach over and change it
      return patchLayer(
        withAssets(doc, assets),
        l.id,
        (l.kind === "number" ? { glyphs: ids } : { frames: ids }) as Partial<Layer>,
      );
    },
  }),
  target: committed,
});
sample({
  clock: glyphsFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
/** Hand the recipe to the resize, which re-renders rather than rescaling these frames. */
sample({
  clock: glyphsFx.doneData,
  filter: Boolean,
  fn: ({ spec }) => ({ layer: spec.target, spec }),
  target: glyphSpecRemembered,
});

sample({
  clock: slotMetricAdded,
  target: addSlotMetricFx,
});
sample({
  clock: addSlotMetricFx.doneData,
  filter: Boolean,
  fn: ({ id, metric, frame, assets }) => ({
    edit: (doc: Doc) => {
      const l = findLayer(doc, id);

      if (l?.kind !== "slot") return doc;
      // frames[0] is the on-watch placeholder, so a metric's icon appends after the rest
      return patchLayer(withAssets(doc, assets), id, {
        metrics: [...l.metrics, metric],
        frames: [...l.frames, frame],
      });
    },
  }),
  target: committed,
});
sample({
  clock: addSlotMetricFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
sample({
  clock: slotMetricRemoved,
  source: $doc,
  filter: (doc, { id, metric }) => {
    const l = doc ? findLayer(doc, id) : null;

    // the last one can't go: a slot with no metrics has nothing to offer
    return l?.kind === "slot" && !l.locked && l.metrics.includes(metric) && l.metrics.length > 1;
  },
  fn: (_doc, { id, metric }) => ({
    edit: (doc: Doc) => {
      const l = findLayer(doc, id);

      if (l?.kind !== "slot") return doc;
      const at = l.metrics.indexOf(metric);

      return patchLayer(doc, id, {
        metrics: l.metrics.filter((_, i) => i !== at),
        frames: l.frames.filter((_, i) => i !== at + 1), // its icon goes with it
        active: Math.min(l.active, l.metrics.length - 2),
      });
    },
  }),
  target: committed,
});

sample({
  clock: aodAdded,
  target: addAodFx,
});
sample({
  clock: addAodFx.doneData,
  filter: Boolean,
  fn: ({ assets, screen }) => ({
    edit: (doc: Doc) => ({ ...withAssets(doc, assets), screens: [...doc.screens, screen] }),
  }),
  target: committed,
});
sample({
  clock: addAodFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
// adding it is only ever a step towards editing it
sample({
  clock: addAodFx.doneData,
  filter: Boolean,
  fn: () => "aod" as const,
  target: screenSet,
});
sample({
  clock: layerFlagsSet,
  filter: ({ ids }) => ids.length > 0,
  fn: ({ ids, patch }) => ({
    edit: (doc: Doc) => ids.reduce((d, id) => patchLayer(d, id, patch), doc),
  }),
  target: committed,
});

sample({
  clock: aodRemoved,
  source: $doc,
  filter: (doc) => Boolean(doc?.screens.some((s) => s.kind === "aod")),
  // ponytail: its assets stay in the document — same as a deleted layer's, and toLegacy's walk
  // drops anything nothing points at when the file is built
  fn: () => ({
    edit: (doc: Doc) => ({ ...doc, screens: doc.screens.filter((s) => s.kind !== "aod") }),
  }),
  target: committed,
});
sample({
  clock: aodRemoved,
  fn: () => "main" as const,
  target: screenSet,
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

// ---- clipboard ----
// The copy carries the assets it references, not just the layers: asset ids are per-document, so
// pasting into another watchface has to bring the pixels along or it lands on someone else's art.
interface Clip {
  readonly layers: readonly Layer[];
  readonly images: ReadonlyMap<ImageId, ImageAsset>;
  readonly cache: ReadonlyMap<ImageId, ImageCache>;
}

export const $clipboard = createStore<Clip | null>(null);
/** The paste, resolved: fresh layer ids, and the assets this document is missing. */
const pasted = createEvent<{
  layers: Layer[];
  images: Map<ImageId, ImageAsset>;
  cache: Map<ImageId, ImageCache>;
}>();

interface ClipSource {
  selected: Layer[];
  doc: Doc | null;
  cache: ReadonlyMap<ImageId, ImageCache>;
}

const clipOf = ({ selected, doc, cache }: ClipSource): Clip => {
  const images = new Map<ImageId, ImageAsset>();
  const cached = new Map<ImageId, ImageCache>();

  for (const l of selected)
    for (const id of assetsOf(l)) {
      const a = doc!.images.get(id);
      const c = cache.get(id);

      if (a) images.set(id, a);
      if (c) cached.set(id, c);
    }
  return { layers: selected, images, cache: cached };
};
const hasSelection = ({ selected, doc }: ClipSource) => selected.length > 0 && Boolean(doc);

sample({
  clock: copyRequested,
  source: { selected: $selected, doc: $doc, cache: $cache },
  filter: hasSelection,
  fn: clipOf,
  target: $clipboard,
});
// Cut fills the clipboard and removes the layers. Both halves are computed from the SAME
// snapshot and handed on together: firing copy and delete as two events left the order to
// effector, and the delete won — clearing the selection copy was about to read.
const cut = createEvent<{ clip: Clip; layers: Layer[] }>();

sample({
  clock: cutRequested,
  source: { selected: $selected, doc: $doc, cache: $cache },
  filter: hasSelection,
  fn: (s) => ({ clip: clipOf(s), layers: s.selected }),
  target: cut,
});
sample({
  clock: cut,
  fn: ({ clip }) => clip,
  target: $clipboard,
});
sample({
  clock: cut,
  fn: ({ layers }) => ({
    edit: (doc: Doc) => layers.reduce((d, l) => removeLayer(d, l.id), doc),
  }),
  target: committed,
});
sample({
  clock: pasteRequested,
  source: { clip: $clipboard, doc: $doc },
  filter: ({ clip, doc }) => Boolean(clip?.layers.length && doc),
  fn: ({ clip, doc }) => {
    // An id already in this document is the same picture only when it's the very same object —
    // the counters restart per document, so everything else gets a fresh id and a copied asset.
    const remap = new Map<ImageId, ImageId>();
    const images = new Map<ImageId, ImageAsset>();
    const cache = new Map<ImageId, ImageCache>();

    for (const [id, a] of clip!.images) {
      if (doc!.images.get(id) === a) continue;
      const fresh = newImageId();
      const c = clip!.cache.get(id);

      remap.set(id, fresh);
      images.set(fresh, { ...a, id: fresh });
      if (c) cache.set(fresh, c);
    }
    return { layers: clip!.layers.map((l) => repointFrames(cloneLayer(l), remap)), images, cache };
  },
  target: pasted,
});
sample({
  clock: pasted,
  source: $screen,
  fn: (screen, { layers, images }) => ({
    edit: (doc: Doc) => layers.reduce((d, l) => addLayer(d, screen, l), withAssets(doc, images)),
  }),
  target: committed,
});
sample({
  clock: pasted,
  filter: ({ cache }) => cache.size > 0,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
sample({
  clock: pasted,
  fn: ({ layers }) => layers.map((l) => l.id),
  target: selectionSet,
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

// One step along the row, staying inside the same container. At either end there is nowhere to
// go and the edit hands the document straight back, so `committed` drops it and no undo is spent.
sample({
  clock: orderMoved,
  source: $sel,
  filter: Boolean,
  fn: (id, dir) => ({
    edit: (d: Doc) => {
      const row = siblingsOf(d, id);
      const i = row.findIndex((l) => l.id === id);
      const j = i + dir;

      return i < 0 || j < 0 || j >= row.length ? d : moveLayer(d, id, row[j].id, dir > 0);
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
  clock: [
    addWidgetFx.failData,
    addNumberFx.failData,
    glyphsFx.failData,
    addSlotFx.failData,
    addSlotMetricFx.failData,
    addAodFx.failData,
    sourceIdFx.failData,
    alignFx.failData,
  ],
  fn: (e: Error) => e.message,
  target: errored,
});
