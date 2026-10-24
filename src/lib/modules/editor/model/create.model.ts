// Everything that adds something the face didn't have: a widget made from scratch (number, image,
// progress line, slot, group, procedural ring), the art a widget's frames are generated or first
// loaded from, a slot's metric icons, the AOD screen. Split out of edit.model, which keeps the
// actions on what already exists; both hand their `Doc -> Doc` edits to the same `committed`.
import { attach, combine, createEvent, sample } from "effector";
import { TAG } from "../core/format";
import { PREVIEW, SCREEN } from "../core/render/screen";
import {
  blankFrame,
  opaqueBlack,
  progressLineColor,
  progressLineFrame,
  progressLineStored,
  resourceFromFile,
} from "../core/render/pixels";
import { glyphSprites, type GlyphSpec } from "../core/render/glyphs";
import {
  addLayer,
  assetsOf,
  cloneLayer,
  findLayer,
  patchLayer,
  repointFrames,
} from "../core/document/edits";
import {
  LINE_SOURCES,
  SLOT_METRICS,
  SLOT_SIZE,
  blankScreen,
  newGroup,
  newHand,
  newImage,
  newNumber,
  newProgressLine,
  progressLineOf,
  newRing,
  newSlot,
  type LineSource,
} from "../core/document/factory";
import {
  newImageId,
  type Doc,
  type ImageAsset,
  type ImageCache,
  type ImageId,
  type Layer,
  type NodeId,
} from "../core/document/doc";
import { $doc, committed } from "./doc.model";
import { $screen, $selected, screenSet, select } from "./selection.model";
import { $cache, cachePatched, glyphSpecRemembered } from "./assets.model";
import { errored } from "./ui.model";
import { selectAdded, withAssets } from "./edit.model";

/** The widgets that are created FROM files. A number isn't one of them — its ten frames start
 *  blank and are filled from a font (see numberAdded / glyphsRequested). */
export type WidgetKind = "image" | "hand";

// ---- events ----
export const nodeAdded = createEvent<"group" | "ring">();
export const widgetAdded = createEvent<{ kind: WidgetKind; files: File[] }>();
/** Rasterize a set of labels into the target widget's frames: the ten digits of a number, the
 *  labels of a value-indexed set. Replaces what the layer draws — the layer itself stays. */
export type GlyphRequest = GlyphSpec & { target: NodeId };
export const glyphsRequested = createEvent<GlyphRequest>();
/** A number widget. Always created empty — ten blank frames, filled from a font afterwards; the
 *  ten-PNG picker this used to open is what the font generator replaces. */
export const numberAdded = createEvent();
/** An image widget with no art yet: one transparent frame, replaced later by a dropped file or
 *  the font generator — for when the picture doesn't exist at add time. */
export const imageAdded = createEvent();
export const slotAdded = createEvent();
/** A progress line: one pre-drawn frame per step of its source (see LINE_SOURCES). */
export const progressLineAdded = createEvent<{ dir: "horizontal" | "vertical"; on: LineSource }>();
/** Redraw a progress line's frames in another colour — the frames are the only place it lives. */
export const progressLineColored = createEvent<{ id: NodeId; color: string }>();
/** Give the face an always-on screen. A new document starts with the main screen only, and until
 *  this runs the AOD tab has nothing to show. */
export const aodAdded = createEvent();
/** Drop it again — deleting the AOD root row in the tree. The main screen has no such option:
 *  a face without one has nothing to draw. */
export const aodRemoved = createEvent();
/** The metrics a slot offers the wearer — its own 0x5f list, which the companion app shows as a
 *  menu. Adding one needs an icon frame, so it goes through an effect; removing one is a plain
 *  edit (slotMetricRemoved, in edit.model). See SLOT_METRIC_CHOICES for what the corpus uses. */
export const slotMetricAdded = createEvent<{ id: NodeId; metric: number }>();
/** Give a procedural ring (0x5a, no art) a bitmap: from there it draws clipped to the filled
 *  sector, like every 0x5b ring — the corpus has 0x5a rings with an image, so the spec tag
 *  doesn't have to change. Replacing that art afterwards is the usual frame thumbnail. */
export const ringImageAdded = createEvent<{ id: NodeId; file: File }>();

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

// One transparent frame: an image widget whose art comes later, same deal as the number below.
const addImageFx = attach({
  source: $screen,
  async effect(screen) {
    const r = await blankFrame(96, 96);
    const id = newImageId();

    return {
      screen,
      assets: new Map<ImageId, ImageAsset>([[id, { id, cf: r.cf, w: r.w, h: r.h, data: r.data }]]),
      cache: new Map<ImageId, ImageCache>([[id, { bitmap: r.bitmap }]]),
      layer: newImage([id]),
    };
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

// A progress line's frames are drawn here, not dropped in: one per step of its source, so the art
// can't drift out of step with the value that picks it.
async function progressLineAssets(
  w: number,
  h: number,
  vertical: boolean,
  on: LineSource,
  color?: string,
) {
  const { frames: steps, full } = LINE_SOURCES[on];
  const frames = await Promise.all(
    Array.from({ length: steps }, (_, i) =>
      progressLineFrame(w, h, (i * 100) / full, vertical, color),
    ),
  );
  const assets = new Map<ImageId, ImageAsset>();
  const cache = new Map<ImageId, ImageCache>();

  for (const r of frames) {
    const id = newImageId();

    assets.set(id, { id, cf: r.cf, w: r.w, h: r.h, data: r.data });
    cache.set(id, { bitmap: r.bitmap });
  }
  return { assets, cache };
}

const addProgressLineFx = attach({
  source: $screen,
  async effect(screen, { dir, on }: { dir: "horizontal" | "vertical"; on: LineSource }) {
    const vertical = dir === "vertical";
    const [w, h] = vertical ? [12, 200] : [200, 12];
    const { assets, cache } = await progressLineAssets(w, h, vertical, on);

    return { screen, assets, cache, layer: newProgressLine([...assets.keys()], w, h, on) };
  },
});

const recolorProgressLineFx = attach({
  source: { doc: $doc, cache: $cache },
  async effect({ doc, cache }, { id, color }: { id: NodeId; color: string }) {
    const l = doc ? findLayer(doc, id) : null;
    const line = doc && l && !l.locked ? progressLineOf(doc, l) : null;

    // the same colour again (or one cf 5 rounds to it) would only spend an undo step
    if (
      !line ||
      progressLineStored(color) === progressLineColor(line.full, cache.get(line.full.id))
    )
      return null;
    const { assets, cache: drawn } = await progressLineAssets(
      line.full.w,
      line.full.h,
      line.vertical,
      line.on,
      color,
    );

    return { id, full: line.full, ids: [...assets.keys()], assets, cache: drawn };
  },
});

/** The selected progress line and the colour it is drawn in, for the inspector — null for
 *  anything else. */
export const $progressLine = combine($doc, $selected, $cache, (doc, [l], cache) => {
  const line = doc && l ? progressLineOf(doc, l) : null;

  return line && { id: l.id, color: progressLineColor(line.full, cache.get(line.full.id)) };
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
// it on save — sharing main's would overwrite one with the other), and the copied layers get
// fresh ids AND copied assets, same as paste: editing the AOD art must not reach back into the
// main screen's.
const addAodFx = attach({
  source: { doc: $doc, cache: $cache },
  async effect({ doc, cache: docCache }) {
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
    const src = (doc.screens.find((s) => s.kind === "main")?.layers ?? []).filter(
      (l) => !(l.kind === "raw" && l.tag === TAG.preview),
    );
    const remap = new Map<ImageId, ImageId>();

    for (const l of src)
      for (const old of assetsOf(l)) {
        const a = doc.images.get(old);

        if (remap.has(old) || !a) continue;
        const fresh = newImageId();

        remap.set(old, fresh);
        assets.set(fresh, { ...a, id: fresh });
        const c = docCache.get(old);

        if (c) cache.set(fresh, c);
      }
    const dial = src.map((l) => repointFrames(cloneLayer(l), remap));
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

// The first bitmap a procedural ring gets. meta.w/h follow the art, because that is the circle
// drawSector pivots the filled sector around — a ring whose meta says a different diameter draws
// its sector off-centre.
const addRingImageFx = attach({
  source: $doc,
  async effect(doc, { id, file }: { id: NodeId; file: File }) {
    const l = doc ? findLayer(doc, id) : null;

    if (!doc || l?.kind !== "ring" || l.locked || l.frames.length) return null;
    const r = await resourceFromFile(file, 5);
    const image = newImageId();

    return {
      id,
      image,
      assets: new Map<ImageId, ImageAsset>([
        [image, { id: image, cf: r.cf, w: r.w, h: r.h, data: r.data }],
      ]),
      cache: new Map<ImageId, ImageCache>([[image, { bitmap: r.bitmap }]]),
    };
  },
});

// ---- business logic ----
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
  clock: widgetAdded,
  target: addWidgetFx,
});
sample({
  clock: numberAdded,
  target: addNumberFx,
});
sample({
  clock: imageAdded,
  target: addImageFx,
});
sample({
  clock: slotAdded,
  target: addSlotFx,
});
sample({
  clock: progressLineAdded,
  target: addProgressLineFx,
});
sample({
  clock: [
    addWidgetFx.doneData,
    addImageFx.doneData,
    addNumberFx.doneData,
    addSlotFx.doneData,
    addProgressLineFx.doneData,
  ],
  filter: Boolean,
  fn: ({ screen, assets, layer }) => ({
    edit: (doc: Doc) => addLayer(withAssets(doc, assets), screen, layer),
  }),
  target: committed,
});
sample({
  clock: [
    addWidgetFx.doneData,
    addImageFx.doneData,
    addNumberFx.doneData,
    addSlotFx.doneData,
    addProgressLineFx.doneData,
  ],
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
sample({
  clock: [
    addWidgetFx.doneData,
    addImageFx.doneData,
    addNumberFx.doneData,
    addSlotFx.doneData,
    addProgressLineFx.doneData,
  ],
  filter: Boolean,
  fn: ({ layer }) => layer.id,
  target: select,
});

sample({
  clock: progressLineColored,
  target: recolorProgressLineFx,
});
sample({
  clock: recolorProgressLineFx.doneData,
  filter: Boolean,
  fn: ({ id, full, ids, assets }) => ({
    edit: (doc: Doc) => {
      const l = findLayer(doc, id);

      // redrawn off `full`: if the line was deleted, resized or turned meanwhile, these frames
      // are for a line that no longer exists
      if (!l || progressLineOf(doc, l)?.full !== full) return doc;
      return patchLayer(withAssets(doc, assets), id, { frames: ids } as Partial<Layer>);
    },
  }),
  target: committed,
});
sample({
  clock: recolorProgressLineFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
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
  clock: ringImageAdded,
  target: addRingImageFx,
});
sample({
  clock: addRingImageFx.doneData,
  filter: Boolean,
  fn: ({ id, image, assets }) => ({
    edit: (doc: Doc) => {
      const l = findLayer(doc, id);
      const a = assets.get(image)!;

      if (l?.kind !== "ring") return doc;
      // the art IS the ring's circle now: meta and the spec's own radius both take it, or the .bin
      // would carry a diameter the widget no longer has. `auto` keeps its 0x8000 sentinel.
      return patchLayer(withAssets(doc, assets), id, {
        frames: [image],
        spec: { ...l.spec, radius: Math.round(a.w / 2) },
        ...(l.meta.auto ? {} : { meta: { ...l.meta, w: a.w, h: a.h } }),
      } as Partial<Layer>);
    },
  }),
  target: committed,
});
sample({
  clock: addRingImageFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
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

sample({
  clock: [
    addWidgetFx.failData,
    addImageFx.failData,
    addNumberFx.failData,
    glyphsFx.failData,
    addSlotFx.failData,
    addSlotMetricFx.failData,
    addRingImageFx.failData,
    addAodFx.failData,
    addProgressLineFx.failData,
    recolorProgressLineFx.failData,
  ],
  fn: (e: Error) => e.message,
  target: errored,
});
