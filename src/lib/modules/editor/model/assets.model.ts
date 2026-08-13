// Image assets and their decoded pixels. Two things live side by side here:
//
//  * `doc.images` — what lands in the file (bytes, size, adjust), owned by the document and part
//    of the undo history;
//  * `$cache` — decoded ImageBitmaps, never serialized and never in history. A resize rescales
//    the bitmap off `original` and leaves `data` stale on purpose; flushAssets re-encodes from
//    that pinned original on the way out, so shrink-then-grow costs no quality.
import { attach, combine, createEffect, createEvent, createStore, sample } from "effector";
import type { ImageStore } from "../core/render/canvas";
import {
  accentBitmapForAsset,
  accentFlaggedAssets,
  bitmapOf,
  blankFrame,
  invertAsset,
  resourceFromFile,
  rotateAsset,
} from "../core/render/pixels";
import { glyphSprites, sizeForHeight, type GlyphSpec } from "../core/render/glyphs";
import {
  framesOf,
  isPlaced,
  type Doc,
  type ImageAsset,
  type ImageCache,
  type ImageId,
} from "../core/document/doc";
import { findLayer, patchLayer, scaleRing } from "../core/document/edits";
import type { Layer, NodeId } from "../core/document/doc";
import type { Resource } from "../core/format";
import { $doc, committed, docLoaded } from "./doc.model";
import { $sim } from "./sim.model";
import { $screen, $selected } from "./selection.model";
import { errored } from "./ui.model";

/** A hand's pivot before any resize, so repeated resizes scale from the same numbers instead of
 *  re-rounding an already-rounded value. Editor-only and per-session, like the bitmap cache.
 *  ponytail: a plain Map keyed by layer id — cleared on load, not on undo, so undoing across a
 *  resize keeps the pinned original. Move it into ImageCache if that ever bites. */
let pivot0 = new Map<NodeId, { x: number; y: number }>();

/** How each font-generated widget was rasterized, so a resize can re-render at the new size
 *  instead of scaling the pixels — the whole reason to generate sprites rather than draw them.
 *  Per-session like the cache: after a reload (or for art that never came from a font) there is
 *  no spec and a resize rescales, as before. Also stale after an undo across a regeneration —
 *  ponytail: the next resize then re-renders the newer spec, which is a redo, not corruption. */
let glyphSpecs = new Map<NodeId, GlyphSpec>();

const asResource = (a: ImageAsset): Resource => ({ cf: a.cf, w: a.w, h: a.h, data: a.data });

// ---- stores ----
export const $cache = createStore<ReadonlyMap<ImageId, ImageCache>>(new Map());
/** What the renderer draws from: the document's assets plus the decoded-pixel cache. */
export const $store = combine(
  $doc,
  $cache,
  (doc, cache): ImageStore => ({ assets: doc?.images ?? new Map(), cache }),
);

// ---- events ----
/** Merge decoded bitmaps into the cache — the one way $cache changes. */
export const cachePatched = createEvent<ReadonlyMap<ImageId, ImageCache>>();
export const replaceImageRequested = createEvent<{ id: ImageId; file: File }>();
/** Blank one frame out, keeping its size: a transparent slot in a value-indexed set is how
 *  blinking is done — the value lands on the empty frame and the widget disappears for a beat. */
export const clearImageRequested = createEvent<{ id: ImageId }>();
/** "These frames came out of this font" — fired by the generator, read by the resize. */
export const glyphSpecRemembered = createEvent<{ layer: NodeId; spec: GlyphSpec }>();
/** w/h: target size of the layer's FIRST frame; `at`: the origin it must end up at, so a corner
 *  drag can anchor the opposite corner in the same update. */
export const resizeImageRequested = createEvent<{
  layer: NodeId;
  w: number;
  h: number;
  at?: { x: number; y: number };
}>();
/** Resizing a group scales its contents, so it is a factor rather than a size — the children all
 *  have their own. `at`: where the group's frame must end up, so a corner drag keeps its anchor. */
export const resizeGroupRequested = createEvent<{
  layer: NodeId;
  kw: number;
  kh: number;
  at?: { x: number; y: number };
}>();
/** Turn a widget's art. `deg` is a DELTA — both the angle field and the canvas handle send the
 *  change, the asset carries the running total (see rotateAsset: the format has no angle, so the
 *  pixels are what turns). */
export const rotateImageRequested = createEvent<{ layer: NodeId; deg: number }>();
export const adjustImageRequested = createEvent<{ layer: NodeId; adjust: ImageAsset["adjust"] }>();
export const invertColorsRequested = createEvent();

// ---- effects ----
// Serialized: a fresh load (re-tinting a just-parsed document) and an accent change can fire
// back to back, and without a queue whichever promise resolves last would win.
let accentQueue = Promise.resolve();

const accentFx = createEffect(
  ({
    doc,
    cache,
    color,
  }: {
    doc: Doc;
    cache: ReadonlyMap<ImageId, ImageCache>;
    color: string | null;
  }) => {
    const flagged = color ? accentFlaggedAssets(doc) : null;
    const out = new Map<ImageId, ImageCache>();

    accentQueue = accentQueue
      .then(async () => {
        for (const a of doc.images.values()) {
          const c = cache.get(a.id);
          const accent =
            color && flagged!.has(a.id) ? await accentBitmapForAsset(a, c, color) : undefined;

          // only the tint — see the field-by-field merge in cachePatched
          out.set(a.id, { accent });
        }
      })
      .then(() => {});
    return accentQueue.then(() => out);
  },
);

const replaceImageFx = attach({
  source: { doc: $doc, cache: $cache },
  async effect({ doc }, { id, file }: { id: ImageId; file: File }) {
    const a = doc?.images.get(id);

    if (!a) return null;
    if (a.cf === 1) {
      // JPEG stays JPEG — the file's own bytes are the resource
      const data = new Uint8Array(await file.arrayBuffer());
      const bitmap = await createImageBitmap(new Blob([data as BlobPart], { type: "image/jpeg" }));

      return {
        asset: { ...a, data, w: bitmap.width, h: bitmap.height },
        // the uploaded file is the new original — drop any pinned resize source
        cache: { bitmap, original: undefined, accent: undefined },
      };
    }
    const fresh = await resourceFromFile(file, a.cf);

    return {
      asset: { ...a, cf: fresh.cf, w: fresh.w, h: fresh.h, data: fresh.data },
      cache: { bitmap: fresh.bitmap ?? (await bitmapOf(fresh)), original: undefined },
    };
  },
});

// Same shape as a replace, with a transparent blank standing in for the file. cf 5 whatever the
// frame was — a cleared JPEG can't stay JPEG, that format has no alpha to be blank with.
const clearImageFx = attach({
  source: $doc,
  async effect(doc, { id }: { id: ImageId }) {
    const a = doc?.images.get(id);

    if (!a) return null;
    const fresh = await blankFrame(a.w, a.h);

    return {
      asset: { ...a, cf: fresh.cf, data: fresh.data },
      cache: { bitmap: fresh.bitmap, original: undefined, accent: undefined },
    };
  },
});

// A widget is drawn 1:1 from its asset (the format has no draw-time scale), so a resize really is
// a rescale of the pixels. Every frame of a multi-frame widget scales by the same ratio, and each
// one scales off its PINNED ORIGINAL rather than its current size — a live drag fires this per
// pointermove, so compounded rounding would walk a hand right off the dial.
const dim = (v: number) => Math.max(1, Math.min(2047, Math.round(v))); // 11-bit, see encodePixels

/** Rescale one layer's frames so the FIRST lands on tw x th, the rest keeping their ratio to it.
 *  Fills `assets`/`cached` and reports the factors, which the caller needs for a hand's pivot. */
async function rescaleFrames(
  doc: Doc,
  cache: ReadonlyMap<ImageId, ImageCache>,
  frames: readonly ImageId[],
  tw: number,
  th: number,
  assets: Map<ImageId, ImageAsset>,
  cached: Map<ImageId, ImageCache>,
): Promise<{ sx: number; sy: number } | null> {
  const first = doc.images.get(frames[0]);

  if (!first) return null;
  const firstSrc = cache.get(frames[0])?.original ?? (await bitmapOf(asResource(first)));
  const sx = tw / firstSrc.width,
    sy = th / firstSrc.height;

  for (const id of new Set(frames)) {
    const a = doc.images.get(id);

    if (!a) continue;
    const src = cache.get(id)?.original ?? (await bitmapOf(asResource(a)));
    const rw = id === frames[0] ? tw : dim(src.width * sx),
      rh = id === frames[0] ? th : dim(src.height * sy);

    assets.set(id, { ...a, w: rw, h: rh });
    cached.set(id, {
      // always off the ORIGINAL, so shrink-then-grow is lossless
      bitmap: await createImageBitmap(src, {
        resizeWidth: rw,
        resizeHeight: rh,
        resizeQuality: "high",
      }),
      original: src,
      accent: undefined, // a stale tint would keep the old size; accentFx recomputes it
    });
  }
  return { sx, sy };
}

const resizeImageFx = attach({
  source: { doc: $doc, cache: $cache },
  async effect(
    { doc, cache },
    { layer, w, h, at }: { layer: NodeId; w: number; h: number; at?: { x: number; y: number } },
  ) {
    const l = doc ? findLayer(doc, layer) : null;
    const frames = l ? framesOf(l) : [];

    if (!doc || !l || !frames.length || l.locked) return null; // locked: no resize, from anywhere
    const tw = dim(w),
      th = dim(h);
    const first = doc.images.get(frames[0]);

    if (!first) return null;
    if (tw === first.w && th === first.h && !at) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cached = new Map<ImageId, ImageCache>();
    // Generated sprites re-render instead of rescaling: the font has the shape at any size, the
    // bitmap only has it at the one it was drawn. The point size follows the height (the width is
    // the font's own business), and the fresh spec is kept so the next drag scales from it.
    const spec = glyphSpecs.get(l.id);

    if (spec && spec.labels.length === frames.length) {
      const sizePx = await sizeForHeight(spec, th);
      const k = sizePx / Math.max(0.05, spec.sizePx);
      const next = { ...spec, sizePx, spacing: spec.spacing * k };
      const sprites = await glyphSprites(next);

      frames.forEach((id, i) => {
        const a = doc.images.get(id);
        const { resource: r, bitmap } = sprites[i];

        if (!a) return;
        assets.set(id, { ...a, cf: r.cf, w: r.w, h: r.h, data: r.data });
        // no `original`: these pixels ARE the source now, and flushAssets must not re-encode
        // them from a stale bitmap of the old size
        cached.set(id, { bitmap, original: undefined, accent: undefined });
      });
      glyphSpecs.set(l.id, next);
      return { assets, cache: cached, layer: l.id, patch: at ? { x: at.x, y: at.y } : {} };
    }
    const scaled = await rescaleFrames(doc, cache, frames, tw, th, assets, cached);

    if (!scaled) return null;
    const { sx, sy } = scaled;

    // A hand rotates around x+pivot: the pivot scales with the art and x/y shift so the rotation
    // centre stays put, otherwise the hand walks off the dial.
    let patch: Partial<Layer> = at ? { x: at.x, y: at.y } : {};

    if (l.kind === "hand") {
      const p0 = pivot0.get(l.id) ?? { x: l.pivotX, y: l.pivotY };

      pivot0.set(l.id, p0);
      const originX = at?.x ?? l.x,
        originY = at?.y ?? l.y;
      const cx = originX + l.pivotX,
        cy = originY + l.pivotY;
      const pivotX = Math.round(p0.x * sx),
        pivotY = Math.round(p0.y * sy);

      patch = { pivotX, pivotY, x: cx - pivotX, y: cy - pivotY };
    }
    // A ring's own circle (see scaleRing) follows its art. Measured against the asset's CURRENT
    // size, not sx/sy: those are relative to the PINNED ORIGINAL, so multiplying an already-scaled
    // meta by them compounds — halving a 284px ring twice would land its circle on 36, not 71.
    if (l.kind === "ring") patch = { ...patch, ...scaleRing(l, tw / first.w, th / first.h) };
    return { assets, cache: cached, layer: l.id, patch };
  },
});

/** Scale a group and everything under it — the Figma reading of resizing a group: the children's
 *  pixels and coordinates follow, not just the box. The frame scales too, since it's what the
 *  auto-layout measures against; AUTO children (meta.auto) ignore their x/y and are laid out from
 *  the new pixel sizes anyway. */
const resizeGroupFx = attach({
  source: { doc: $doc, cache: $cache },
  async effect(
    { doc, cache },
    { layer, kw, kh, at }: { layer: NodeId; kw: number; kh: number; at?: { x: number; y: number } },
  ) {
    const g = doc ? findLayer(doc, layer) : null;

    if (!doc || g?.kind !== "group" || g.locked) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cached = new Map<ImageId, ImageCache>();
    const scale = (v: number) => Math.round(v * kw);
    const scaleY = (v: number) => Math.round(v * kh);

    const walk = async (l: Layer): Promise<Layer> => {
      if (l.kind === "raw" || l.locked) return l; // a locked child holds its size, like anywhere else
      if (l.kind === "group")
        return {
          ...l,
          frame: {
            ...l.frame,
            x: scale(l.frame.x),
            y: scaleY(l.frame.y),
            w: scale(l.frame.w),
            h: scaleY(l.frame.h),
          },
          children: await Promise.all(l.children.map(walk)),
        };
      const frames = framesOf(l);
      const first = frames.length ? doc.images.get(frames[0]) : null;
      const scaled = first
        ? await rescaleFrames(
            doc,
            cache,
            frames,
            dim(first.w * kw),
            dim(first.h * kh),
            assets,
            cached,
          )
        : null;
      const moved = { ...l, x: scale(l.x), y: scaleY(l.y) } as Layer;

      // a ring's circle isn't its pixels, and a ring with no pixels at all still has a size —
      // both are the group's factors, same rule as the standalone resize above
      if (moved.kind === "ring") return { ...moved, ...scaleRing(moved, kw, kh) };
      if (moved.kind !== "hand" || !scaled) return moved;
      // the pivot is a coordinate inside the art, so it scales with it
      return {
        ...moved,
        pivotX: Math.round(moved.pivotX * kw),
        pivotY: Math.round(moved.pivotY * kh),
      };
    };

    const next: Layer = {
      ...g,
      frame: {
        ...g.frame,
        x: at?.x ?? g.frame.x,
        y: at?.y ?? g.frame.y,
        w: scale(g.frame.w),
        h: scaleY(g.frame.h),
      },
      children: await Promise.all(g.children.map(walk)),
    };

    return { assets, cache: cached, layer: g.id, group: next };
  },
});

// Turn every frame of a widget by the same delta. Destructive, like the invert below: the file
// format has no rotation, so the art is re-baked and the pinned original goes with it (the turned
// pixels ARE the source from here — flushAssets must not re-encode the untouched ones over them).
const rotateImageFx = attach({
  source: { doc: $doc, cache: $cache },
  async effect({ doc, cache }, { layer, deg }: { layer: NodeId; deg: number }) {
    const l = doc ? findLayer(doc, layer) : null;
    const frames = l ? framesOf(l) : [];
    const first = doc && frames.length ? doc.images.get(frames[0]) : null;

    if (!doc || !l || !first || l.locked || !(deg % 360)) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cached = new Map<ImageId, ImageCache>();

    for (const id of new Set(frames)) {
      const a = doc.images.get(id);
      const turned = a && (await rotateAsset(a, cache.get(id), deg));

      if (!turned) continue;
      assets.set(id, turned.asset);
      cached.set(id, { bitmap: turned.bitmap, original: undefined, accent: undefined });
    }
    // The bounding box grows around the centre, so the layer moves back by half of the growth and
    // the art stays where it was. A hand's pivot moves with it, which keeps x+pivot — the point it
    // rotates around at runtime — on the same pixel of the dial.
    const grown = assets.get(frames[0]);
    const dx = grown ? Math.round((grown.w - first.w) / 2) : 0;
    const dy = grown ? Math.round((grown.h - first.h) / 2) : 0;
    const moved = isPlaced(l) ? { x: l.x - dx, y: l.y - dy } : {};
    const patch: Partial<Layer> =
      l.kind === "hand"
        ? { ...moved, pivotX: l.pivotX + dx, pivotY: l.pivotY + dy }
        : (moved as Partial<Layer>);

    return { assets, cache: cached, layer: l.id, patch };
  },
});

// Brightness/contrast/saturation/hue of a widget's frames. Non-destructive: the untouched pixels
// stay pinned in `original` and every move re-filters from there, so dragging a slider back to
// 100 restores the original exactly. Only the preview bitmap is rebuilt here — the .bin gets the
// filter applied once, in flushAssets.
const adjustImageFx = attach({
  source: { doc: $doc, cache: $cache },
  async effect({ doc, cache }, { layer, adjust }: { layer: NodeId; adjust: ImageAsset["adjust"] }) {
    const l = doc ? findLayer(doc, layer) : null;
    const frames = l ? framesOf(l) : [];

    if (!doc || !frames.length) return null;
    const assets = new Map<ImageId, ImageAsset>();
    const cached = new Map<ImageId, ImageCache>();
    const filter = adjust
      ? `brightness(${adjust.brightness}%) contrast(${adjust.contrast}%) ` +
        `saturate(${adjust.saturate}%) hue-rotate(${adjust.hue}deg)`
      : "none";

    for (const id of new Set(frames)) {
      const a = doc.images.get(id);

      if (!a) continue;
      const src = cache.get(id)?.original ?? (await bitmapOf(asResource(a)));
      const c = new OffscreenCanvas(a.w, a.h);
      const cx = c.getContext("2d")!;

      cx.filter = filter;
      cx.drawImage(src, 0, 0, a.w, a.h);
      assets.set(id, { ...a, adjust });
      cached.set(id, {
        bitmap: await createImageBitmap(c),
        original: src,
        accent: undefined, // computed off the old pixels
      });
    }
    return { assets, cache: cached };
  },
});

// Invert every image under the selection (or the whole current screen when nothing is selected) —
// the quick way to turn a light layout into an AOD-friendly dark one. Involutive: twice restores
// the original. Assets shared with anything outside the selection are copied first, so inverting
// the AOD screen can't repaint the main one.
const invertColorsFx = attach({
  source: { doc: $doc, cache: $cache, screen: $screen, selected: $selected },
  async effect({ doc, cache, screen, selected }) {
    if (!doc) return null;
    // a locked layer keeps its pixels too, whether it was picked directly or caught by the
    // whole-screen pass
    const roots: readonly Layer[] = (
      selected.length ? selected : (doc.screens.find((s) => s.kind === screen)?.layers ?? [])
    ).filter((l) => !l.locked);
    const mine = new Set<ImageId>();
    const walk = (l: Layer) => {
      framesOf(l).forEach((id) => mine.add(id));
      if (l.kind === "group") l.children.forEach(walk);
      if (l.kind === "raw") l.children?.forEach(walk);
    };

    roots.forEach(walk);
    if (!mine.size) return null;

    // which of them anything OUTSIDE the selection also points at
    const rootIds = new Set(roots.map((r) => r.id));
    const outside = new Set<ImageId>();
    const walkOutside = (l: Layer) => {
      if (rootIds.has(l.id)) return;
      framesOf(l).forEach((id) => outside.add(id));
      if (l.kind === "group") l.children.forEach(walkOutside);
      if (l.kind === "raw") l.children?.forEach(walkOutside);
    };

    doc.screens.forEach((s) => s.layers.forEach(walkOutside));

    const assets = new Map<ImageId, ImageAsset>();
    const cached = new Map<ImageId, ImageCache>();
    const remap = new Map<ImageId, ImageId>();

    for (const id of mine) {
      const a = doc.images.get(id);

      if (!a) continue;
      const flipped = await invertAsset(a, cache.get(id));

      if (!flipped) continue;
      if (outside.has(id)) {
        // shared: the selection gets its own copy, the other users keep the original
        const copy = { ...flipped.asset, id: `${id}-inv` as ImageId };

        remap.set(id, copy.id);
        assets.set(copy.id, copy);
        cached.set(copy.id, { bitmap: flipped.bitmap });
      } else {
        assets.set(id, flipped.asset);
        cached.set(id, { bitmap: flipped.bitmap, original: undefined, accent: undefined });
      }
    }
    return { assets, cache: cached, remap, rootIds };
  },
});

// ---- business logic ----
// Merged FIELD BY FIELD, not entry by entry: the accent pass is async and reports only the tint
// it computed, so replacing whole entries would drop a `bitmap`/`original` that an adjust or a
// resize wrote while it was running — and without `original`, flushAssets never re-encodes.
sample({
  clock: cachePatched,
  source: $cache,
  fn: (cache, patch) => {
    const out = new Map(cache);

    patch.forEach((entry, id) => out.set(id, { ...out.get(id), ...entry }));
    return out;
  },
  target: $cache,
});

// the decoded pixels arrive with the document (see docLoaded), so the canvas never sees a
// document it has no bitmaps for
sample({
  clock: docLoaded,
  fn: ({ cache }) => cache ?? new Map(),
  target: $cache,
});
// then tint — the tint reads those freshly decoded pixels
sample({
  clock: [docLoaded, $sim.map((s) => s.accentColor)],
  source: { doc: $doc, cache: $cache, sim: $sim },
  filter: ({ doc }) => Boolean(doc),
  fn: ({ doc, cache, sim }) => ({ doc: doc!, cache, color: sim.accentColor ?? null }),
  target: accentFx,
});
sample({
  clock: accentFx.doneData,
  target: cachePatched,
});

// ---- asset edits ----
sample({
  clock: replaceImageRequested,
  target: replaceImageFx,
});
sample({
  clock: clearImageRequested,
  target: clearImageFx,
});
sample({
  clock: [replaceImageFx.doneData, clearImageFx.doneData],
  filter: Boolean,
  fn: ({ asset }) => ({
    edit: (doc: Doc) => ({ ...doc, images: new Map(doc.images).set(asset.id, asset) }),
  }),
  target: committed,
});
sample({
  clock: [replaceImageFx.doneData, clearImageFx.doneData],
  filter: Boolean,
  fn: ({ asset, cache }) => new Map([[asset.id, cache]]),
  target: cachePatched,
});

sample({
  clock: resizeImageRequested,
  target: resizeImageFx,
});
sample({
  clock: resizeGroupRequested,
  target: resizeGroupFx,
});
sample({
  clock: resizeGroupFx.doneData,
  filter: Boolean,
  fn: ({ assets, layer, group }) => ({
    edit: (doc: Doc) => {
      const images = new Map(doc.images);

      assets.forEach((a, id) => images.set(id, a));
      return patchLayer({ ...doc, images }, layer, group);
    },
    coalesce: 600,
  }),
  target: committed,
});
sample({
  clock: resizeGroupFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});
sample({
  clock: resizeImageFx.doneData,
  filter: Boolean,
  fn: ({ assets, layer, patch }) => ({
    edit: (doc: Doc) => {
      const images = new Map(doc.images);

      assets.forEach((a, id) => images.set(id, a));
      return patchLayer({ ...doc, images }, layer, patch);
    },
    // a live drag makes one history entry, not one per pointermove
    coalesce: 600,
  }),
  target: committed,
});
sample({
  clock: resizeImageFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});

sample({
  clock: rotateImageRequested,
  target: rotateImageFx,
});
sample({
  clock: rotateImageFx.doneData,
  filter: Boolean,
  fn: ({ assets, layer, patch }) => ({
    edit: (doc: Doc) => {
      const images = new Map(doc.images);

      assets.forEach((a, id) => images.set(id, a));
      return patchLayer({ ...doc, images }, layer, patch);
    },
  }),
  target: committed,
});
sample({
  clock: rotateImageFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});

sample({
  clock: adjustImageRequested,
  target: adjustImageFx,
});
sample({
  clock: adjustImageFx.doneData,
  filter: Boolean,
  fn: ({ assets }) => ({
    edit: (doc: Doc) => {
      const images = new Map(doc.images);

      assets.forEach((a, id) => images.set(id, a));
      return { ...doc, images };
    },
    coalesce: 600,
  }),
  target: committed,
});
sample({
  clock: adjustImageFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});

sample({
  clock: invertColorsRequested,
  target: invertColorsFx,
});
sample({
  clock: invertColorsFx.doneData,
  filter: Boolean,
  fn: ({ assets, remap, rootIds }) => ({
    edit: (doc: Doc) => {
      const images = new Map(doc.images);

      assets.forEach((a, id) => images.set(id, a));
      const next = { ...doc, images };

      if (!remap.size) return next;
      // repoint only the inverted subtree at its private copies
      const repoint = (l: Layer): Layer => {
        const kids =
          l.kind === "group"
            ? { children: l.children.map(repoint) }
            : l.kind === "raw" && l.children
              ? { children: l.children.map(repoint) }
              : {};
        const frames = framesOf(l);
        const moved = frames.map((id) => remap.get(id) ?? id);
        const framesPatch =
          l.kind === "number" ? { glyphs: moved } : frames.length ? { frames: moved } : {};

        return { ...l, ...kids, ...framesPatch } as Layer;
      };

      return {
        ...next,
        screens: next.screens.map((s) => ({
          ...s,
          layers: s.layers.map((l) => (rootIds.has(l.id) ? repoint(l) : l)),
        })),
      };
    },
  }),
  target: committed,
});
sample({
  clock: invertColorsFx.doneData,
  filter: Boolean,
  fn: ({ cache }) => cache,
  target: cachePatched,
});

// asset work is the one place a user action can fail on bad input (a corrupt PNG, an oversized
// image) — surface it rather than leaving the canvas silently unchanged
sample({
  clock: [
    replaceImageFx.failData,
    clearImageFx.failData,
    resizeImageFx.failData,
    rotateImageFx.failData,
    adjustImageFx.failData,
    invertColorsFx.failData,
  ],
  fn: (e: Error) => e.message,
  target: errored,
});

// the pinned pivots, glyph specs and decoded bitmaps belong to the document that was open —
// dropped before decodeAllFx refills the cache for the new one
const resetSessionFx = createEffect(() => {
  pivot0 = new Map();
  glyphSpecs = new Map();
});

sample({
  clock: docLoaded,
  target: resetSessionFx,
});

// Module state, so writing it is an effect — same shape as the frame stash in edit.model.
const rememberGlyphSpecFx = createEffect(({ layer, spec }: { layer: NodeId; spec: GlyphSpec }) => {
  glyphSpecs.set(layer, spec);
});

sample({
  clock: glyphSpecRemembered,
  target: rememberGlyphSpecFx,
});
