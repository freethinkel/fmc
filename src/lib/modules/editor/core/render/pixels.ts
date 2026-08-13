// Everything that turns pixels into assets and back: browser decode, canvas readback, the
// non-destructive adjust/resize path, the accent tint and the embedded preview thumbnails.
// No store access — the editor model owns when these run.
//
// `Resource` still appears here because that is what the .bin codec speaks: a file read or a
// dropped image arrives as one, and becomes an ImageAsset the moment it joins a document.
import { decodePixels, encodePixels, TAG, type Resource } from "../format";
import type { Sim } from "../document/sources";
import { SCREEN } from "./screen";
import {
  framesOf,
  isAccent,
  type Doc,
  type ImageAsset,
  type ImageCache,
  type ImageId,
  type Layer,
} from "../document/doc";

export async function bitmapOf(r: Resource): Promise<ImageBitmap> {
  const px = decodePixels(r);

  return px
    ? createImageBitmap(new ImageData(px, r.w, r.h))
    : createImageBitmap(new Blob([r.data as BlobPart], { type: "image/jpeg" }));
}

/** RGBA readback at the given size — the only way back to pixels the browser scaled or decoded. */
export function pixelsOf(
  b: ImageBitmap,
  w: number,
  h: number,
  filter = "none",
): Uint8ClampedArray<ArrayBuffer> {
  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext("2d")!;

  cx.filter = filter;
  cx.drawImage(b, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h).data;
}

// brightness/contrast/saturation as a canvas filter — the browser's own image pipeline does
// the pixel math, we only ever store the three numbers (Resource.adjust)
export const filterOf = (r: Resource) =>
  r.adjust
    ? `brightness(${r.adjust.brightness}%) contrast(${r.adjust.contrast}%) ` +
      `saturate(${r.adjust.saturate}%) hue-rotate(${r.adjust.hue}deg)`
    : "none";

export async function encodeBitmap(
  b: ImageBitmap,
  w: number,
  h: number,
  cf: number,
  filter = "none",
): Promise<Uint8Array> {
  if (cf === 1) {
    // JPEG resource (backgrounds) — keep the codec, decodePixels/encodePixels can't touch it
    const c = new OffscreenCanvas(w, h);
    const cx = c.getContext("2d")!;

    cx.filter = filter;
    cx.drawImage(b, 0, 0, w, h);
    return new Uint8Array(
      await (await c.convertToBlob({ type: "image/jpeg", quality: 0.92 })).arrayBuffer(),
    );
  }
  return encodePixels(pixelsOf(b, w, h, filter), w, h, cf).data;
}

/** A canvas as a resource — the encode side of pixelsOf. No bitmap: the caller already has the
 *  canvas, and `createImageBitmap` on it is cheaper than decoding what was just encoded. */
export function resourceFromCanvas(canvas: OffscreenCanvas, cf: number): Resource {
  const { width: w, height: h } = canvas;

  return encodePixels(canvas.getContext("2d")!.getImageData(0, 0, w, h).data, w, h, cf);
}

/** A dropped/picked image file as a ready-to-use resource (bitmap included). */
export async function resourceFromFile(file: File, cf: number): Promise<Resource> {
  const img = await createImageBitmap(file);
  const c = new OffscreenCanvas(img.width, img.height);
  const cx = c.getContext("2d")!;

  cx.drawImage(img, 0, 0);
  const r = encodePixels(
    cx.getImageData(0, 0, img.width, img.height).data,
    img.width,
    img.height,
    cf,
  );

  r.bitmap = await bitmapOf(r);
  return r;
}

/** A fully transparent frame at cf 5 (RGB565+alpha, what uploads already use) — the slot an
 *  auto-grown frame set gets until the user drops art on it. cf is per resource, so a run may
 *  mix this with cf 4 frames that can't carry alpha at all. */
export async function blankFrame(w: number, h: number): Promise<Resource> {
  const r = encodePixels(new Uint8ClampedArray(w * h * 4), w, h, 5);

  r.bitmap = await bitmapOf(r);
  return r;
}

export async function opaqueBlack(w: number, h: number): Promise<Resource> {
  const px = new Uint8ClampedArray(w * h * 4);

  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  const r = encodePixels(px, w, h, 4);

  r.bitmap = await bitmapOf(r);
  return r;
}

// ---- Doc-side equivalents ----
// Same maths, but an asset is immutable and its decoded pixels live in the cache, so these
// return what changed instead of writing through a Resource. The cache is a plain Map the
// caller owns — it is not part of the document and never reaches the file.

/** Decode every asset of a document into bitmaps. Part of loading rather than a follow-up step:
 *  a document whose pixels aren't decoded yet renders as a blank screen, so the two have to
 *  become visible to the editor together. */
export async function decodeAssets(
  images: ReadonlyMap<ImageId, ImageAsset>,
): Promise<Map<ImageId, ImageCache>> {
  const out = new Map<ImageId, ImageCache>();

  for (const a of images.values())
    out.set(a.id, { bitmap: await bitmapOf({ cf: a.cf, w: a.w, h: a.h, data: a.data }) });
  return out;
}

/** Which assets the watch may repaint with the wearer's accent color (meta flags === 4). */
export function accentFlaggedAssets(doc: Doc): Set<ImageId> {
  const flagged = new Set<ImageId>();
  const walk = (l: Layer) => {
    if (l.kind !== "group" && l.kind !== "raw" && isAccent(l.meta))
      framesOf(l).forEach((id) => flagged.add(id));
    if (l.kind === "group") l.children.forEach(walk);
    if (l.kind === "raw") l.children?.forEach(walk);
  };

  doc.screens.forEach((s) => s.layers.forEach(walk));
  return flagged;
}

const cachedPixels = (a: ImageAsset, c?: ImageCache) =>
  c?.bitmap ? pixelsOf(c.bitmap, a.w, a.h) : decodePixels(a as unknown as Resource);

/** Preview-only accent tint of one asset — never touches `data`, see accentBitmapFor. */
export async function accentBitmapForAsset(
  a: ImageAsset,
  cache: ImageCache | undefined,
  colorHex: string,
): Promise<ImageBitmap | undefined> {
  if (a.cf === 1) return undefined; // JPEG — no per-pixel recolor
  const px = cachedPixels(a, cache);

  if (!px) return undefined;
  const n = parseInt(colorHex.slice(1), 16);
  let changed = false;

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) {
      px[i] = (n >> 16) & 255;
      px[i + 1] = (n >> 8) & 255;
      px[i + 2] = n & 255;
      changed = true;
    }
  }
  return changed ? createImageBitmap(new ImageData(px, a.w, a.h)) : undefined;
}

/** Invert one asset. Returns the replacement plus its fresh bitmap — involutive, as before. */
export async function invertAsset(
  a: ImageAsset,
  cache: ImageCache | undefined,
): Promise<{ asset: ImageAsset; bitmap: ImageBitmap } | null> {
  const px = cachedPixels(a, cache);

  if (!px) return null;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255 - px[i];
    px[i + 1] = 255 - px[i + 1];
    px[i + 2] = 255 - px[i + 2];
  }
  const bitmap = await createImageBitmap(new ImageData(px, a.w, a.h));

  return { asset: { ...a, data: await encodeBitmap(bitmap, a.w, a.h, a.cf) }, bitmap };
}

/** Turn one asset's pixels by `deg` around their centre, growing the canvas to the rotated
 *  bounding box. The file format has no angle of its own, so a rotation IS a pixel edit: the art
 *  is re-baked (like invertAsset above) and `rotate` only records the running total for the
 *  inspector. cf 4 has no alpha for the corners a non-square turn opens up, so it becomes cf 5;
 *  a JPEG resource keeps its codec and gets black corners instead.
 *  ponytail: every call resamples the current pixels, so a hundred 1° nudges blur more than one
 *  100° turn. Pin the pre-rotation bitmap in the cache if that ever shows. */
export async function rotateAsset(
  a: ImageAsset,
  cache: ImageCache | undefined,
  deg: number,
): Promise<{ asset: ImageAsset; bitmap: ImageBitmap } | null> {
  const src = cache?.bitmap ?? (await bitmapOf({ cf: a.cf, w: a.w, h: a.h, data: a.data }));
  const rad = (deg * Math.PI) / 180;
  const cos = Math.abs(Math.cos(rad)),
    sin = Math.abs(Math.sin(rad));
  const size = (v: number) => Math.max(1, Math.min(2047, Math.round(v))); // 11-bit, see encodePixels
  const w = size(a.w * cos + a.h * sin),
    h = size(a.w * sin + a.h * cos);
  const cf = a.cf === 4 && deg % 90 !== 0 ? 5 : a.cf;
  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext("2d")!;

  cx.translate(w / 2, h / 2);
  cx.rotate(rad);
  cx.drawImage(src, -a.w / 2, -a.h / 2, a.w, a.h);
  const bitmap = await createImageBitmap(c);
  const rotate = ((((a.rotate ?? 0) + deg) % 360) + 360) % 360;

  return {
    // the turned pixels are the ones the user was looking at, filter included — so `adjust` goes
    // back to neutral rather than claiming it could still be dialled away
    asset: {
      ...a,
      cf,
      w,
      h,
      rotate,
      adjust: undefined,
      data: await encodeBitmap(bitmap, w, h, cf),
    },
    bitmap,
  };
}

/** Re-encode every asset whose pixels were resized or adjusted, from the pinned original —
 *  the downsampling and the filter land only in what gets exported, never in the preview. */
export async function flushAssets(
  images: ReadonlyMap<ImageId, ImageAsset>,
  cache: ReadonlyMap<ImageId, ImageCache>,
): Promise<Map<ImageId, ImageAsset>> {
  const out = new Map(images);

  for (const [id, a] of images) {
    const src = cache.get(id)?.original;

    if (!src) continue;
    const filter = a.adjust
      ? `brightness(${a.adjust.brightness}%) contrast(${a.adjust.contrast}%) ` +
        `saturate(${a.adjust.saturate}%) hue-rotate(${a.adjust.hue}deg)`
      : "none";

    out.set(id, { ...a, data: await encodeBitmap(src, a.w, a.h, a.cf, filter) });
  }
  return out;
}

/** Re-bake each screen's embedded 0x28 thumbnail from the current render — the Doc counterpart
 *  of regenPreviews. The preview node has no widget shape of its own, so it stays a RawLayer and
 *  is found by tag rather than by kind. Returns the assets that changed. */
export async function regenPreviewAssets(
  doc: Doc,
  store: { assets: ReadonlyMap<ImageId, ImageAsset>; cache: ReadonlyMap<ImageId, ImageCache> },
  sim: Sim,
): Promise<Map<ImageId, { asset: ImageAsset; bitmap: ImageBitmap }>> {
  const { renderDoc } = await import("./render");
  const out = new Map<ImageId, { asset: ImageAsset; bitmap: ImageBitmap }>();

  for (const scr of doc.screens) {
    const pv = scr.layers.find((l) => l.kind === "raw" && l.tag === TAG.preview);
    const holder = pv?.kind === "raw" ? pv.children?.find((c) => framesOf(c).length) : null;
    const id = holder ? framesOf(holder)[0] : null;
    const a = id ? store.assets.get(id) : null;

    if (!a || a.cf === 1) continue; // don't re-encode JPEG previews
    // DOM canvas, not OffscreenCanvas: the two rasterise slightly differently, and after the
    // RGB565 quantise that shows up as different bytes than the Resource path produces
    const screen = document.createElement("canvas");

    screen.width = screen.height = SCREEN;
    renderDoc(screen.getContext("2d")!, doc, store, scr.kind, sim);
    const thumb = document.createElement("canvas");

    thumb.width = a.w;
    thumb.height = a.h;
    thumb.getContext("2d")!.drawImage(screen, 0, 0, a.w, a.h);
    const bitmap = await createImageBitmap(thumb);

    out.set(a.id, { asset: { ...a, data: await encodeBitmap(bitmap, a.w, a.h, a.cf) }, bitmap });
  }
  return out;
}
