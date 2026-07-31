// The raw shape of a .bin watchface: the tree exactly as the file stores it, plus the byte
// primitives every codec in this folder needs. This is the parser's output, not the editor's
// model — `Doc` (core/document/doc.ts) is what the editor edits, and fromLegacy/toLegacy bridge
// the two. Format: docs/cmf-protocol.md §9.6a.

export interface Resource {
  cf: number;
  w: number;
  h: number;
  data: Uint8Array;
  bitmap?: ImageBitmap;
  // set once a resize touched this resource: the ORIGINAL full-size pixels. Resizing only
  // rescales `bitmap` (+ w/h) off this source and leaves `data` stale — it's re-encoded from
  // the source at build time (flushResized in core/render/pixels.ts), so resizing back and forth
  // costs nothing in quality and only what lands on the watch is ever downsampled.
  srcBitmap?: ImageBitmap;
  // preview-only recolor of the accent sentinel (see docs/cmf-protocol.md) — never
  // read by buildBin/encodePixels, must not leak into exported resource.data
  accentBitmap?: ImageBitmap;
  // brightness/contrast/saturation in percent (100 = untouched) + hue rotation in degrees.
  // Applied off srcBitmap as a canvas filter, so the sliders are non-destructive; re-applied
  // at build time by flushResized (core/render/pixels.ts).
  adjust?: { brightness: number; contrast: number; saturate: number; hue: number };
}

export interface FaceNode {
  tag: number;
  subs?: FaceNode[];
  text?: string;
  hex?: string;
  x?: number;
  y?: number;
  meta?: string;
  tail?: string;
  prefix?: string;
  refType?: number;
  images?: number[];
  flag?: number;
  pivotX?: number;
  pivotY?: number;
  _kind?: string;
  /** Editor-only: the pivot before any resize, so repeated resizes scale it from the same
   *  numbers instead of re-rounding an already-rounded value. Never written to the file. */
  _pivot0?: { x: number; y: number };
}

export interface Face {
  name: string;
  nameRaw?: string;
  screens: FaceNode[];
  resources: Resource[];
}

export const TAG = {
  root: 0x20,
  main: 0x21,
  aod: 0x22,
  name: 0x86,
  preview: 0x28,
  struct: 0x01,
  bind: 0x02,
  pivot: 0x05,
  pvStruct: 0x08,
  fmt: 0x40,
  frame: 0x48,
  image: 0x30,
  number: 0x60,
  group: 0x68,
  hand: 0x70,
} as const;

// 0x0a/0x0e were swapped until this fix — confirmed by comparing hand geometry in
// Analog__287__Simple_Dial.bin: the hand tagged 0x0e is the long/thin one (pivot-to-tip
// 163px), 0x0a is the short/thick one (122px). Minute hands are longer than hour hands.
export const handKinds: Record<number, string> = {
  0x0a: "hour",
  0x0e: "minute",
  0x72: "second",
  0x12: "second",
};

export const hex = (d: Uint8Array) => [...d].map((b) => b.toString(16).padStart(2, "0")).join("");
export const unhex = (s: string) =>
  new Uint8Array((s.match(/../g) || []).map((b) => parseInt(b, 16)));
export const u16 = (d: Uint8Array, o: number) => d[o] | (d[o + 1] << 8);
// widget x/y are int16 (LVGL lv_coord_t): 10 nodes across the corpus sit at 0xfffe/0xfffc/…,
// i.e. a couple of pixels off the left/top edge, not at x=65534
export const i16 = (d: Uint8Array, o: number) => (u16(d, o) << 16) >> 16;
export const u32 = (d: Uint8Array, o: number) =>
  (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
