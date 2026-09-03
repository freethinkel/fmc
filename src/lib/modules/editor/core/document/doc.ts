// The editor's own document model. Where `wf.ts`'s FaceNode mirrors the raw TLV tree (and stays
// interchangeable with the Go tool's face.json), this is what the editor wants to think in:
// layers with decoded fields, assets addressed by a stable id rather than a position in an array.
//
// Nothing here knows about bytes. The contiguous-run rule, resource offsets and the canonical
// order of a widget's service children are all reconstructed in `toLegacy`, which is the only
// place that has to care — see the census in the PR that introduced this file: across the whole
// corpus a widget's children are always [struct|frame], [bind], [fmt|pivot|arc|slot], [children],
// with zero exceptions, so the order is derivable and doesn't need storing.
import {
  handKinds,
  TAG,
  unhex,
  hex,
  type Face as LegacyFace,
  type FaceNode,
  type Resource,
} from "../format";
import { buildBind, parseBind, type BindEntry } from "./sources";
import { ARC_REST, arcSpecHex, parseArcSpec, type ArcSpec } from "../render/arc";

// Branded: a bare number index is exactly what let positional bugs (shared runs, orphaned
// resources, a duplicate silently sharing its original's pixels) through unnoticed.
export type NodeId = string & { readonly __node: unique symbol };
export type ImageId = string & { readonly __image: unique symbol };

let nodeSeq = 0;
let imageSeq = 0;

export const newNodeId = (): NodeId => `n${++nodeSeq}` as NodeId;
// `a` rather than `i`: fromLegacy names the assets it reads off the file `i0..iN`, and an id
// minted here must never collide with one of those.
export const newImageId = (): ImageId => `a${++imageSeq}` as ImageId;

// ---- assets ----

/** Brightness/contrast/saturation/hue, re-applied to the pixels at build time. */
export interface ImageAdjust {
  readonly brightness: number;
  readonly contrast: number;
  readonly saturate: number;
  readonly hue: number;
}

/** What lands in the file. No ImageBitmap here — decoded pixels are a cache, see ImageCache. */
export interface ImageAsset {
  readonly id: ImageId;
  readonly cf: number; // 1 JPEG | 4 RGB565 | 5 RGB565+A | 13 A8 | 24 ARGB
  readonly w: number;
  readonly h: number;
  readonly data: Uint8Array;
  readonly adjust?: ImageAdjust;
  /** Degrees the pixels have already been turned by. The format has no rotation (a widget's meta
   *  is a size and nothing else), so a rotation is baked into the art — this is bookkeeping, so
   *  the inspector can show an absolute angle. See rotateAsset. */
  readonly rotate?: number;
}

/** Editor-side only: never serialized, never in undo history, freely mutable. */
export interface ImageCache {
  bitmap?: ImageBitmap;
  original?: ImageBitmap; // pinned source, so resize/adjust stay lossless
  accent?: ImageBitmap; // preview tint for accent-flagged assets
}

// ---- decoded pieces ----

export type CondOp = "eq" | "ne" | "noData" | "lt" | "gte" | "lte";

/** One line of a visibility condition (tag 0x02). */
export interface Condition {
  readonly source: number;
  readonly op: CondOp;
  readonly value: number;
  /** The 0x80 bit, seen on the 0x81 variant — semantically still equality. */
  readonly exclusive?: boolean;
}

// op 4 is the Watch Pro 3's: it only ever appears paired with a 5 over the same source, the two
// bounding a half-open range (0x24 >= 0 && 0x24 < 10, then >= 10 && < 20, … in Explorer and
// Ring_Data), so 4 is `<` next to 5's `>=`. Unmapped it decoded to "eq" and re-exported as a 1,
// silently rewriting the visibility rules of 7 faces in musaoruc's corpus (#49).
const OPS: Record<number, CondOp> = { 1: "eq", 2: "ne", 3: "noData", 4: "lt", 5: "gte", 6: "lte" };
const OP_BYTES: Record<CondOp, number> = { eq: 1, ne: 2, noData: 3, lt: 4, gte: 5, lte: 6 };

const toCondition = (e: BindEntry): Condition => ({
  source: e.id,
  op: OPS[e.op & 0x7f] ?? "eq",
  value: e.val,
  ...(e.op & 0x80 ? { exclusive: true } : {}),
});

const fromCondition = (c: Condition): BindEntry => ({
  id: c.source,
  op: OP_BYTES[c.op] | (c.exclusive ? 0x80 : 0),
  val: c.value,
});

/** A struct's 14 meta bytes, decoded.
 *  `rgb`/`flags` stay raw on purpose: bytes 4..6 hold a real stroke color only when byte 7 is 1,
 *  but they are NOT zero otherwise (Metaball and Function both carry leftovers next to a byte 7
 *  of 4), so deriving them from a semantic field would drop bytes. Byte 8 is unexplained. */
export interface WidgetMeta {
  readonly w: number;
  readonly h: number;
  /** w === 0x8000: "size me from my content", a group's auto-layout child. */
  readonly auto: boolean;
  readonly source: number; // byte 9
  readonly sub: number; // byte 10
  readonly max: number; // bytes 11..13
  readonly rgb: readonly [number, number, number]; // bytes 4..6
  readonly flags: number; // byte 7 — 1 = rgb is a real color, 4 = accent-tintable
  readonly reserved: number; // byte 8
}

/** byte 7 === 4: the watch may repaint this widget's pixels with the wearer's accent color. */
export const isAccent = (m: WidgetMeta) => m.flags === 4;
/** byte 7 === 1: bytes 4..6 are an explicit stroke color for an imageless ring. */
export const ringColorOf = (m: WidgetMeta) => (m.flags === 1 ? m.rgb : null);

export function decodeMeta(metaHex: string): WidgetMeta {
  const m = unhex(metaHex);
  const w = m[0] | (m[1] << 8);

  return {
    w,
    h: m[2] | (m[3] << 8),
    auto: w === 0x8000,
    source: m[9],
    sub: m[10],
    max: m[11] | (m[12] << 8) | (m[13] << 16),
    rgb: [m[4], m[5], m[6]],
    flags: m[7],
    reserved: m[8],
  };
}

export function encodeMeta(meta: WidgetMeta): string {
  const m = new Uint8Array(14);

  m[0] = meta.w;
  m[1] = meta.w >> 8;
  m[2] = meta.h;
  m[3] = meta.h >> 8;
  [m[4], m[5], m[6]] = meta.rgb;
  m[7] = meta.flags;
  m[8] = meta.reserved;
  m[9] = meta.source;
  m[10] = meta.sub;
  m[11] = meta.max;
  m[12] = meta.max >> 8;
  m[13] = meta.max >> 16;
  return hex(m);
}

/** A group's 0x48 frame. */
export interface Frame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly main: number; // byte 8, bits 0-1 — lv_flex_align_t along the row
  readonly track: number; // bits 2-3
  readonly rest: string; // bytes 9.. — always zero in the corpus, kept for an exact round trip
}

// ---- layers ----

interface LayerBase {
  readonly id: NodeId;
  /** The TLV tag this came from. `kind` is an interpretation of it, not a replacement: a digit
   *  strip is tagged 0x60 in most faces but 0x30 in some, and only the tag round-trips. */
  readonly tag: number;
  readonly conditions: readonly Condition[];
  /** Editor-only, never written to the file — the format has no string node but 0x86. */
  readonly name?: string;
  /** Editor-only: left out of the render, so the canvas can't hit it either. */
  readonly hidden?: boolean;
  /** Editor-only: still drawn, but the canvas won't select, drag or resize it. */
  readonly locked?: boolean;
}

interface PlacedLayer extends LayerBase {
  readonly x: number; // int16 — a widget may hang off the left/top edge
  readonly y: number;
  readonly meta: WidgetMeta;
  readonly refType?: number; // 0x01 | 0x61 | 0x71 — how the frame run is referenced
  /** Bytes trailing the meta when there is no image ref at all (procedural rings carry 2). */
  readonly tail?: string;
  /** Service children this parser doesn't model. Only the Watch Pro 3's own widget tags carry
   *  them — 0x5c under 0x82, 0x5d under 0x83, 0x5e under 0x84, 0x63 under 0x89 — and all 37
   *  occurrences across musaoruc's corpus (#49) are flat hex leaves sitting last, so keeping the
   *  bytes in order is enough for those widgets to round-trip until someone decodes them. */
  readonly extra?: readonly { readonly tag: number; readonly hex: string }[];
}

export interface ImageLayer extends PlacedLayer {
  readonly kind: "image";
  /** One frame = static; N = picked by value (weekday, month, AM/PM). */
  readonly frames: readonly ImageId[];
}

export interface NumberLayer extends PlacedLayer {
  readonly kind: "number";
  readonly glyphs: readonly ImageId[];
  readonly digits: number; // fmt byte, low 5 bits
  readonly padZero: boolean; // fmt byte, 0x80
}

export interface HandLayer extends PlacedLayer {
  readonly kind: "hand";
  readonly frames: readonly ImageId[];
  readonly pivotX: number;
  readonly pivotY: number;
  readonly pivotFlag: number;
}

export interface RingLayer extends PlacedLayer {
  readonly kind: "ring";
  readonly spec: ArcSpec;
  /** Absent = drawn as a stroked arc rather than a clipped bitmap. */
  readonly frames: readonly ImageId[];
}

export interface SlotLayer extends PlacedLayer {
  readonly kind: "slot";
  readonly index: number; // 0x5f byte 0 — what a sibling's 0x79 + index condition keys off
  readonly active: number; // byte 2
  readonly metrics: readonly number[];
  /** [0] is the on-watch "tap to configure" placeholder, [1..] the companion-app icons. */
  readonly frames: readonly ImageId[];
  readonly slotRest: string; // the zero padding out to the fixed 33 bytes
}

export interface GroupLayer extends LayerBase {
  readonly kind: "group";
  readonly frame: Frame;
  readonly children: readonly Layer[];
}

/** Anything the parser doesn't understand. Kept byte-exact so a round trip stays lossless —
 *  the format is still being reversed, and 0x38 and friends do turn up. */
export interface RawLayer extends LayerBase {
  readonly kind: "raw";
  readonly bytes?: string;
  readonly text?: string;
  readonly prefix?: string;
  readonly refType?: number;
  readonly frames?: readonly ImageId[];
  readonly children?: readonly Layer[];
}

export type Layer =
  | ImageLayer
  | NumberLayer
  | HandLayer
  | RingLayer
  | SlotLayer
  | GroupLayer
  | RawLayer;

export const isPlaced = (l: Layer): l is Exclude<Layer, GroupLayer | RawLayer> =>
  l.kind !== "group" && l.kind !== "raw";

/** Every asset a layer references, whatever kind it is. */
export const framesOf = (l: Layer): readonly ImageId[] => {
  if (l.kind === "group") return [];
  if (l.kind === "number") return l.glyphs;
  return l.frames ?? [];
};

// ---- document ----

export interface Screen {
  readonly id: NodeId;
  readonly kind: "main" | "aod";
  readonly layers: readonly Layer[];
}

export interface Doc {
  readonly name: string;
  readonly nameRaw: string;
  readonly screens: readonly Screen[];
  /** Insertion-ordered: `toLegacy` walks it to rebuild the resource table. */
  readonly images: ReadonlyMap<ImageId, ImageAsset>;
}

// ---- legacy tree -> doc ----

const sub = (n: FaceNode, tag: number) => n.subs?.find((s) => s.tag === tag);
const SERVICE = new Set<number>([
  TAG.struct,
  TAG.bind,
  TAG.pivot,
  TAG.fmt,
  TAG.frame,
  TAG.arc,
  TAG.arcClipped,
  TAG.slot,
]);

/** A ring with no art is nothing but a stroke, so where its color comes from is not decoration.
 *  Byte 7 says which: 1 = the rgb in bytes 4..6 (and then byte 8 is 0xff), 4 = the wearer's
 *  accent, whose slot is byte 4 — 1, 2 or 4 in all 206 accent widgets of the corpus, never 0.
 *  The editor wrote byte 7 = 0, or 4 over a zero byte 4: no color to stroke with either way. */
const ringMeta = (m: WidgetMeta): WidgetMeta =>
  m.flags === 1 ? m : { ...m, flags: 4, rgb: [m.rgb[0] || 1, 0, 0], reserved: 0 };

/** Every imageless ring in the corpus — and so every one the watch is known to draw — is a 0x5b
 *  spec carrying its 3 trailing bytes, under a struct padded 2 bytes past the meta. The editor
 *  used to mint a bare 16-byte 0x5a under an 18-byte struct: a shape no stock file has, and the
 *  watch silently skipped it (#37). Applied in both directions — on the way in, so opening an
 *  affected face repairs it in front of the author, and on the way out, so nothing else can put a
 *  ring the watch won't draw into a file. 0x5b has nowhere to put a radius, so the editor's live
 *  one moves into meta.w/h — where the reader picks it back up. */
function bareRing(l: RingLayer): RingLayer {
  const r = l.spec.radius;
  const meta = ringMeta(r && !l.meta.auto ? { ...l.meta, w: 2 * r, h: 2 * r } : l.meta);

  return {
    ...l,
    // `||`, not `??`: a spec parsed off a file the editor itself wrote has an empty rest, not a
    // missing one — parseArcSpec hands back whatever was past the body, and there was nothing
    tail: l.tail || "0000",
    meta,
    spec: { ...l.spec, kind: TAG.arcClipped, radius: 0, rest: l.spec.rest || ARC_REST },
  };
}

/** A digit strip is tagged 0x60 in most faces, but the renderer also treats any node with a
 *  `fmt` sibling over a 10-glyph atlas as one — mirror that, so `kind` matches what's drawn. */
const isDigits = (n: FaceNode, frames: readonly ImageId[]) =>
  n.tag === TAG.number || (Boolean(sub(n, TAG.fmt)) && frames.length >= 10);

function toLayer(n: FaceNode, ids: readonly ImageId[]): Layer {
  const id = newNodeId();
  const bind = sub(n, TAG.bind);
  const conditions = parseBind(bind?.hex).map(toCondition);
  const base = { id, tag: n.tag, conditions };
  const st = sub(n, TAG.struct);
  const frames = (st?.images ?? []).map((i) => ids[i]);

  if (n.tag === TAG.group) {
    const f = sub(n, TAG.frame);
    const v = unhex(f?.hex ?? "");
    const i16 = (o: number) => ((v[o] | (v[o + 1] << 8)) << 16) >> 16;

    return {
      ...base,
      kind: "group",
      frame: {
        x: i16(0),
        y: i16(2),
        w: v[4] | (v[5] << 8),
        h: v[6] | (v[7] << 8),
        main: v[8] & 3,
        track: (v[8] >> 2) & 3,
        rest: hex(v.subarray(9)),
      },
      children: (n.subs ?? []).filter((c) => !SERVICE.has(c.tag)).map((c) => toLayer(c, ids)),
    };
  }

  if (st && st.x != null && st.meta) {
    const extra = (n.subs ?? [])
      .filter((c) => !SERVICE.has(c.tag) && c.hex != null)
      .map((c) => ({ tag: c.tag, hex: c.hex! }));
    const placed = {
      ...base,
      x: st.x,
      y: st.y ?? 0,
      meta: decodeMeta(st.meta),
      ...(st.refType != null ? { refType: st.refType } : {}),
      ...(st.tail ? { tail: st.tail } : {}),
      ...(extra.length ? { extra } : {}),
    };
    const pivot = sub(n, TAG.pivot);
    const spec = parseArcSpec(n);
    const slot = sub(n, TAG.slot);

    if (pivot)
      return {
        ...placed,
        kind: "hand",
        frames,
        pivotX: pivot.pivotX ?? 0,
        pivotY: pivot.pivotY ?? 0,
        pivotFlag: pivot.flag ?? 0,
      };
    if (spec) {
      const ring: RingLayer = { ...placed, kind: "ring", spec, frames };

      return frames.length ? ring : bareRing(ring);
    }
    if (slot) {
      const v = unhex(slot.hex ?? "");

      return {
        ...placed,
        kind: "slot",
        index: v[0],
        active: v[2],
        metrics: [...v.subarray(3, 3 + v[1])],
        frames,
        slotRest: hex(v.subarray(3 + v[1])),
      };
    }
    if (isDigits(n, frames)) {
      const f = unhex(sub(n, TAG.fmt)?.hex ?? "00")[0];

      return {
        ...placed,
        kind: "number",
        glyphs: frames,
        digits: f & 0x1f,
        padZero: Boolean(f & 0x80),
      };
    }
    return { ...placed, kind: "image", frames };
  }

  // everything else round-trips verbatim
  return {
    ...base,
    kind: "raw",
    ...(n.text != null ? { text: n.text } : {}),
    ...(n.hex != null ? { bytes: n.hex } : {}),
    ...(n.prefix != null ? { prefix: n.prefix } : {}),
    ...(n.refType != null ? { refType: n.refType } : {}),
    ...(n.images ? { frames: n.images.map((i) => ids[i]) } : {}),
    ...(n.subs ? { children: n.subs.map((c) => toLayer(c, ids)) } : {}),
  };
}

export function fromLegacy(face: LegacyFace): { doc: Doc; assets: Resource[] } {
  const ids = face.resources.map((_, i) => `i${i}` as ImageId);
  const images = new Map<ImageId, ImageAsset>();

  face.resources.forEach((r, i) => {
    images.set(ids[i], {
      id: ids[i],
      cf: r.cf,
      w: r.w,
      h: r.h,
      data: r.data,
      ...(r.adjust ? { adjust: r.adjust } : {}),
    });
  });

  const screens = face.screens.map(
    (s): Screen => ({
      id: newNodeId(),
      kind: s.tag === TAG.aod ? "aod" : "main",
      // 0x86 is hoisted into Doc.name, so it isn't a layer
      layers: (s.subs ?? []).filter((c) => c.tag !== TAG.name).map((c) => toLayer(c, ids)),
    }),
  );
  // The header field the parser reads `face.name` off is only 16 bytes and in practice shorter
  // still — three Pro 3 faces (#49) store 14 chars there and their real title in 0x86, so taking
  // the header would re-export "Traditional Pointer" as "Traditional Po". `nameRaw` keeps the
  // header bytes verbatim either way, so preferring 0x86 costs the round trip nothing.
  const titled = face.screens.flatMap((s) => s.subs ?? []).find((c) => c.tag === TAG.name)?.text;

  return {
    doc: { name: titled || face.name, nameRaw: face.nameRaw ?? "", screens, images },
    assets: face.resources,
  };
}

// ---- doc -> legacy tree ----

const frameHex = (f: Frame) => {
  const v = unhex(f.rest);
  const out = new Uint8Array(9 + v.length);

  out[0] = f.x;
  out[1] = f.x >> 8;
  out[2] = f.y;
  out[3] = f.y >> 8;
  out[4] = f.w;
  out[5] = f.w >> 8;
  out[6] = f.h;
  out[7] = f.h >> 8;
  out[8] = (f.main & 3) | ((f.track & 3) << 2);
  out.set(v, 9);
  return hex(out);
};

/** Every imageless ring in the corpus — and so every one the watch is known to draw — is a 0x5b
 *  spec carrying its 3 trailing bytes, under a struct padded 2 bytes past the meta. The editor
 *  used to mint a bare 16-byte 0x5a under an 18-byte struct: a shape no stock file has, and the
 *  watch silently skipped it (#37). Repaired here rather than only in the factory, so a ring
 *  already sitting in a document is fixed by re-exporting it. 0x5b has nowhere to put a radius,
 *  so the editor's live one moves into meta.w/h — where the reader picks it back up. */
function toNode(layer: Layer, runAt: ReadonlyMap<string, number[]>): FaceNode {
  const l = layer.kind === "ring" && !layer.frames.length ? bareRing(layer) : layer;
  const subs: FaceNode[] = [];
  const imgs = (f: readonly ImageId[]) => runAt.get(f.join(" "))!;

  if (l.kind === "raw") {
    const n: FaceNode = { tag: l.tag };

    if (l.text != null) n.text = l.text;
    if (l.prefix != null) n.prefix = l.prefix;
    if (l.frames) {
      n.refType = l.refType;
      n.images = imgs(l.frames);
    }
    if (l.children) n.subs = l.children.map((c) => toNode(c, runAt));
    else if (l.bytes != null && !l.frames) n.hex = l.bytes;
    return n;
  }

  if (l.kind === "group") {
    subs.push({ tag: TAG.frame, hex: frameHex(l.frame) });
    if (l.conditions.length)
      subs.push({ tag: TAG.bind, hex: buildBind(l.conditions.map(fromCondition)) });
    subs.push(...l.children.map((c) => toNode(c, runAt)));
    return { tag: l.tag, subs };
  }

  const st: FaceNode = { tag: TAG.struct, x: l.x, y: l.y, meta: encodeMeta(l.meta) };
  const frames = l.kind === "number" ? l.glyphs : l.frames;

  // `_kind` is derived, not stored: the parser labels a hand's struct from its source id
  if (l.kind === "hand" && handKinds[l.meta.source]) st._kind = handKinds[l.meta.source];

  if (frames.length) {
    st.refType = l.refType ?? 0x61;
    st.images = imgs(frames);
  } else if (l.tail) st.tail = l.tail;
  subs.push(st);
  if (l.conditions.length)
    subs.push({ tag: TAG.bind, hex: buildBind(l.conditions.map(fromCondition)) });

  if (l.kind === "number")
    subs.push({
      tag: TAG.fmt,
      hex: hex(new Uint8Array([(l.digits & 0x1f) | (l.padZero ? 0x80 : 0)])),
    });
  if (l.kind === "hand")
    subs.push({ tag: TAG.pivot, flag: l.pivotFlag, pivotX: l.pivotX, pivotY: l.pivotY });
  if (l.kind === "ring") subs.push({ tag: l.spec.kind, hex: arcSpecHex(l.spec) });
  if (l.kind === "slot") {
    const v = unhex(l.slotRest);
    const out = new Uint8Array(3 + l.metrics.length + v.length);

    out[0] = l.index;
    out[1] = l.metrics.length;
    out[2] = l.active;
    out.set(l.metrics, 3);
    out.set(v, 3 + l.metrics.length);
    subs.push({ tag: TAG.slot, hex: hex(out) });
  }
  if (l.extra) subs.push(...l.extra.map((e) => ({ tag: e.tag, hex: e.hex })));
  return { tag: l.tag, subs };
}

/** The resource table is derived, not stored. Walk the tree in TLV order and lay every distinct
 *  frame run out contiguously — which is all `refTailBytes` really demands — reusing a run that
 *  is already sitting contiguously and duplicating one that only partly overlaps. Two things
 *  fall out of this for free: assets nothing references never reach the file (GC), and a widget
 *  can stop caring that its indices have to be consecutive.
 *
 *  Corpus check: first-use order matches the on-disk order in all 9 fixtures, and identical runs
 *  are common (Function has 14 groups of them) while partial overlaps never occur — so the reuse
 *  path is the one that actually runs, and the duplication path is the safety net for edits. */
function layoutImages(doc: Doc) {
  const runs: (readonly ImageId[])[] = [];
  const collect = (l: Layer) => {
    const f = framesOf(l);

    if (f.length) runs.push(f);
    if (l.kind === "group") l.children.forEach(collect);
    if (l.kind === "raw") l.children?.forEach(collect);
  };

  doc.screens.forEach((s) => s.layers.forEach(collect));

  const resources: Resource[] = [];
  const runAt = new Map<string, number[]>();
  const firstAt = new Map<ImageId, number>();

  for (const run of runs) {
    const key = run.join(" ");

    if (runAt.has(key)) continue;
    const seen = run.map((id) => firstAt.get(id));
    const reusable = seen.every((v, i) => v != null && (i === 0 || v === seen[i - 1]! + 1));

    if (reusable) {
      runAt.set(key, seen as number[]);
      continue;
    }
    const idx: number[] = [];

    for (const id of run) {
      const a = doc.images.get(id);

      if (!a) throw new Error(`layer references a missing asset: ${id}`);
      idx.push(resources.length);
      if (!firstAt.has(id)) firstAt.set(id, resources.length);
      resources.push({
        cf: a.cf,
        w: a.w,
        h: a.h,
        data: a.data,
        ...(a.adjust ? { adjust: a.adjust } : {}),
      });
    }
    runAt.set(key, idx);
  }
  return { resources, runAt };
}

export function toLegacy(doc: Doc): LegacyFace {
  const { resources, runAt } = layoutImages(doc);
  const screens = doc.screens.map((s): FaceNode => {
    const subs = s.layers.map((l) => toNode(l, runAt));

    return {
      tag: s.kind === "aod" ? TAG.aod : TAG.main,
      subs: s.kind === "main" ? [{ tag: TAG.name, text: doc.name.slice(0, 63) }, ...subs] : subs,
    };
  });

  return { name: doc.name, nameRaw: doc.nameRaw, screens, resources };
}
