// Canvas-side primitives shared by the renderer: its types, and how a Resource becomes
// something drawImage can take.
import type { FaceNode, Resource } from "./wf";

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
export type Drawable = ImageBitmap | OffscreenCanvas;

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Hit extends Point, Size {
  node: FaceNode;
}

/** accentBitmap (if set — see accentFx in editor.model.ts) takes priority over the baked one. */
export const bmp = (res: Resource[], i: number): Drawable | undefined =>
  res[i]?.accentBitmap ?? res[i]?.bitmap;

// cf=4 (RGB565, no alpha channel — see wf.ts's decodePixels) ring/arc fill images bake their
// "empty" background as opaque black, which is fine for a genuine full-bleed background image
// but wrong for a ring meant to sit transparently over other content: confirmed on Dichotomy,
// where this exact bitmap — drawn as a literal opaque rectangle by drawSector/the 0x80 bar
// path — blotted out a "BATT" text label sharing its group, and clipped into the background's
// own baked "10" hour-marker glyph at the ring's edge. Chroma-key near-black to transparent,
// lazily once per bitmap (keyed on the bitmap itself, not the resource, so an accent-recolored
// swap naturally invalidates it). Only cf=4 is touched — cf=5 already carries real alpha.
const ringMaskCache = new WeakMap<ImageBitmap, OffscreenCanvas>();

export function ringBmp(res: Resource[], i: number): Drawable | undefined {
  const b = bmp(res, i);

  if (!b || res[i]?.cf !== 4) return b;
  let masked = ringMaskCache.get(b as ImageBitmap);

  if (!masked) {
    masked = new OffscreenCanvas(b.width, b.height);
    const mctx = masked.getContext("2d")!;

    mctx.drawImage(b, 0, 0);
    const px = mctx.getImageData(0, 0, b.width, b.height);
    const d = px.data;

    for (let k = 0; k < d.length; k += 4) {
      if (d[k] < 12 && d[k + 1] < 12 && d[k + 2] < 12) d[k + 3] = 0;
    }
    mctx.putImageData(px, 0, 0);
    ringMaskCache.set(b as ImageBitmap, masked);
  }
  return masked;
}
