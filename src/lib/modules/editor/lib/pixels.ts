// Everything that turns a Resource into pixels and back: browser decode, canvas readback,
// the non-destructive adjust/resize path, the accent tint and the embedded preview thumbnails.
// No store access — the editor model owns when these run.
import { decodePixels, encodePixels, TAG, type Face, type FaceNode, type Resource } from "./wf";
import { metaInfo, type Sim } from "./sources";
import { render } from "./render";

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

// re-encode every resized or adjusted resource from its original pixels — called just before
// buildBin, so the downsampling and the brightness/contrast filter land only in what's
// exported/flashed. r.bitmap (the crisp browser-scaled preview) is left alone; the editing
// session keeps showing the good one.
export async function flushResized(face: Face) {
  for (const r of face.resources)
    if (r.srcBitmap) r.data = await encodeBitmap(r.srcBitmap, r.w, r.h, r.cf, filterOf(r));
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

// the pixels actually on screen: a resized resource still holds the old ones in r.data, and
// JPEG resources only ever decode through the bitmap
const livePixels = (r: Resource) => (r.bitmap ? pixelsOf(r.bitmap, r.w, r.h) : decodePixels(r));

// which resource indices are accent-tintable: struct.meta[7]===4 (metaInfo's `accent` field)
// — a real per-widget capability flag, confirmed against 7 real-device test cases including
// ones where the accent widget is baked plain white (not a color to pattern-match at all).
// Supersedes the old pixel-color guessing entirely — see docs/cmf-protocol.md "Accent color".
export function accentFlaggedResources(face: Face): Set<number> {
  const flagged = new Set<number>();
  const walk = (n: FaceNode) => {
    if (n.tag === TAG.struct && n.images && metaInfo(n).accent) {
      n.images.forEach((i) => flagged.add(i));
    }
    n.subs?.forEach(walk);
  };

  face.screens.forEach(walk);
  return flagged;
}

// preview-only recolor of an accent-flagged resource: replace every non-transparent pixel's
// RGB with the chosen color (alpha untouched) — the flag identifies the whole resource as
// tintable regardless of its baked color, so there's no per-pixel color test here. Never
// touches r.data — the exported .bin must keep the original bytes for the real watch to
// substitute its own accent color.
export async function accentBitmapFor(
  r: Resource,
  colorHex: string,
): Promise<ImageBitmap | undefined> {
  if (r.cf === 1) return undefined; // JPEG — no per-pixel recolor
  const px = livePixels(r);

  if (!px) return undefined;
  const n = parseInt(colorHex.slice(1), 16);
  const cr = (n >> 16) & 255,
    cg = (n >> 8) & 255,
    cb = n & 255;
  let changed = false;

  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) {
      px[i] = cr;
      px[i + 1] = cg;
      px[i + 2] = cb;
      changed = true;
    }
  }
  return changed ? createImageBitmap(new ImageData(px, r.w, r.h)) : undefined;
}

/** Invert one resource in place (alpha untouched). Involutive — twice restores the original. */
export async function invertResource(r: Resource) {
  const px = livePixels(r);

  if (!px) return;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255 - px[i];
    px[i + 1] = 255 - px[i + 1];
    px[i + 2] = 255 - px[i + 2];
  }
  const bitmap = await createImageBitmap(new ImageData(px, r.w, r.h));

  Object.assign(r, {
    data: await encodeBitmap(bitmap, r.w, r.h, r.cf),
    bitmap,
    srcBitmap: undefined, // the inverted pixels are the original now — see flushResized
    accentBitmap: undefined,
  });
}

/** Re-bake each screen's embedded 0x28 thumbnail from the current render. */
export function regenPreviews(face: Face, sim: Sim) {
  for (const scr of face.screens) {
    const pv = scr.subs
      ?.find((s) => s.tag === TAG.preview)
      ?.subs?.find((s) => s.tag === TAG.pvStruct);
    const ri = pv?.images?.[0];

    if (ri == null) continue;
    const r = face.resources[ri];

    if (r.cf === 1) continue; // don't re-encode JPEG previews
    const screen = document.createElement("canvas");

    screen.width = screen.height = 466;
    render(screen.getContext("2d")!, face, scr.tag, sim);
    const thumb = document.createElement("canvas");

    thumb.width = r.w;
    thumb.height = r.h;
    const tx = thumb.getContext("2d")!;

    tx.drawImage(screen, 0, 0, r.w, r.h);
    Object.assign(r, encodePixels(tx.getImageData(0, 0, r.w, r.h).data, r.w, r.h, r.cf));
    bitmapOf(r).then((b) => (r.bitmap = b));
  }
}
