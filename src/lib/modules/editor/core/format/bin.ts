// CMF Watch Pro 2 watchface .bin <-> the raw node tree (port of wfformat.go / wfdecompile.go /
// wfcompile.go). Node schema is identical to the Go tool's face.json (fmc -wfdecompile) — files
// are interchangeable. Format: docs/cmf-protocol.md §9.6a.

import type { Face, FaceNode, Resource } from "./raw";
import { TAG, handKinds, hex, i16, u16, u32, unhex } from "./raw";

interface TLVNode {
  tag: number;
  raw: Uint8Array;
  children: TLVNode[] | null;
}

const HDR = 36;

// ---- CRC32 "raw": IEEE reflected, init=0, NO final inversion ----
const CRC_T = new Uint32Array(256);

for (let i = 0; i < 256; i++) {
  let c = i;

  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_T[i] = c >>> 0;
}
export function rawCRC32(d: Uint8Array): number {
  let c = 0;

  for (let i = 0; i < d.length; i++) c = CRC_T[(c ^ d[i]) & 0xff] ^ (c >>> 8);
  return c >>> 0;
}

// ---- TLV ----
function parseTLV(data: Uint8Array, depth: number): TLVNode[] | null {
  const nodes: TLVNode[] = [];
  let off = 0;

  while (off < data.length) {
    if (off + 3 > data.length) return null;
    const tag = data[off];
    const ln = u16(data, off + 1);

    if (off + 3 + ln > data.length) return null;
    const val = data.subarray(off + 3, off + 3 + ln);
    const n: TLVNode = { tag, raw: val, children: null };

    if (ln >= 3 && depth < 12) n.children = parseTLV(val, depth + 1);
    nodes.push(n);
    off += 3 + ln;
  }
  return nodes;
}

// parseRefTail: [type][count u16][ref u32][count×u16 blk] starting at off.
function parseRefTail(
  v: Uint8Array,
  off: number,
  resources: Resource[],
  resOffset: Map<number, number>,
) {
  if (off + 3 > v.length) return null;
  const typ = v[off];
  const count = u16(v, off + 1);
  let p = off + 3;

  if (p + 4 > v.length) return null;
  const ref = u32(v, p);

  p += 4;
  if (!resOffset.has(ref)) return null;
  const idx = resOffset.get(ref)!;

  // 0x01 spells every frame out as its own absolute u32 offset, where 0x61/0x71 store the first
  // offset and the block sizes to walk on from it. Watch Pro 2 files only ever use count=1, which
  // reads the same either way; the Watch Pro 3 uses the same tag for a whole run — one file in
  // musaoruc's corpus (#49) hangs 7 full-screen backgrounds off a count=7 tail, and rejecting it
  // dropped them to an opaque `tail` and lost 490 KB of art on open.
  if (typ === 0x01) {
    if (count === 0 || p + 4 * (count - 1) !== v.length) return null;
    const images = [idx];

    for (let k = 1; k < count; k++) {
      const o = u32(v, p + 4 * (k - 1));

      if (!resOffset.has(o)) return null;
      images.push(resOffset.get(o)!);
    }
    return { refType: typ, images };
  }
  if (typ === 0x61 || typ === 0x71) {
    if (p + 2 * count !== v.length || count === 0) return null;
    const images: number[] = [];
    let cur = ref;

    for (let k = 0; k < count; k++) {
      if (!resOffset.has(cur)) return null;
      const i = resOffset.get(cur)!;

      images.push(i);
      // the stored block size only locates the NEXT frame — the trailing one's value is
      // unused and unvalidated elsewhere, so a writer can put anything there (seen in the wild:
      // count=1 with a mismatched value) without it being an actually-broken reference.
      if (k < count - 1) {
        const blk = resources[i].data.length + 8;

        if (blk !== u16(v, p + 2 * k)) return null;
        cur += blk;
      }
    }
    return { refType: typ, images };
  }
  return null;
}

// Fixed-layout leaves the speculative TLV descent must not split: a slot's `00 06 00 …` reads as
// a zero tag of length 6 (seen on the Watch Pro 3), and the document reads these by `hex`.
const LEAF = new Set<number>([TAG.bind, TAG.fmt, TAG.frame, TAG.arc, TAG.arcClipped, TAG.slot]);

function allZero(b: Uint8Array): boolean {
  for (const c of b) if (c !== 0) return false;
  return true;
}

function nodeToJSON(
  n: TLVNode,
  resources: Resource[],
  resOffset: Map<number, number>,
  parentTag: number,
): FaceNode {
  const j: FaceNode = { tag: n.tag };
  const v = n.raw;

  if (n.tag === TAG.name && v.length === 64) {
    let e = 0;

    while (e < v.length && v[e]) e++;
    if (e < v.length && allZero(v.subarray(e))) {
      j.text = new TextDecoder().decode(v.subarray(0, e));
      return j;
    }
  }
  // struct: [x u16][y u16][meta 14b] then either a refTail (image ref) or nothing —
  // short arcs (0x81/0x80 rings with no bitmap, ring drawn procedurally) carry no ref at all.
  if (n.tag === TAG.struct && v.length >= 18) {
    j.x = i16(v, 0);
    j.y = i16(v, 2);
    j.meta = hex(v.subarray(4, 18));
    if (parentTag === TAG.hand && handKinds[v[13]]) j._kind = handKinds[v[13]];
    const rt = v.length >= 25 ? parseRefTail(v, 18, resources, resOffset) : null;

    if (rt) {
      j.refType = rt.refType;
      j.images = rt.images;
    } else if (v.length > 18) {
      j.tail = hex(v.subarray(18));
    }
    return j;
  }
  if (n.tag === TAG.pvStruct && v.length >= 12) {
    const rt = parseRefTail(v, 5, resources, resOffset);

    if (rt) {
      j.prefix = hex(v.subarray(0, 5));
      j.refType = rt.refType;
      j.images = rt.images;
      return j;
    }
  }
  if (n.tag === TAG.pivot && v.length === 5) {
    j.flag = v[0];
    j.pivotX = u16(v, 1);
    j.pivotY = u16(v, 3);
    return j;
  }
  if (n.children && !LEAF.has(n.tag)) {
    j.subs = n.children.map((c) => nodeToJSON(c, resources, resOffset, n.tag));
    return j;
  }
  j.hex = hex(v);
  return j;
}

// parseBin: ArrayBuffer/Uint8Array -> {name, screens, resources:[{cf,w,h,data}]}
export function parseBin(buf: ArrayBuffer | Uint8Array): Face {
  const d = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

  if (d.length < 2 * HDR + 3) throw new Error(`file too small: ${d.length} bytes`);
  if (!(d[4] === 1 && d[5] === 0 && d[6] === 0 && (d[7] === 0 || d[7] === 2)))
    throw new Error("no watchface magic in header");
  for (let i = 0; i < HDR; i++)
    if (d[i] !== d[d.length - HDR + i]) throw new Error("footer differs from header");
  let e = 8;

  while (e < 0x18 && d[e]) e++;
  const name = new TextDecoder().decode(d.subarray(8, e));
  // after the NUL in the 16-byte name field there can be a non-zero tail (byte 0x17 = 0x08/0x0a,
  // meaning unknown) — keep the whole field for an exact round-trip
  const nameRaw = hex(d.subarray(8, 0x18));
  const body = d.subarray(HDR, d.length - HDR);

  if (body[0] !== TAG.root) throw new Error(`root tag 0x${body[0].toString(16)}, expected 0x20`);
  const rootLen = u16(body, 1);

  if (3 + rootLen > body.length) throw new Error("tree length exceeds body");
  const rawTree = parseTLV(body.subarray(3, 3 + rootLen), 0);

  if (!rawTree) throw new Error("TLV tree does not parse");

  const resources: Resource[] = [];
  const resOffset = new Map<number, number>();
  let off = 3 + rootLen;

  while (off < body.length) {
    if (off + 8 > body.length) throw new Error(`truncated resource @body+0x${off.toString(16)}`);
    const h = u32(body, off);
    const size = u32(body, off + 4);

    if (off + 8 + size > body.length)
      throw new Error(`resource @body+0x${off.toString(16)} exceeds body`);
    resOffset.set(off + HDR, resources.length);
    resources.push({
      cf: h & 0x1f,
      w: (h >>> 10) & 0x7ff,
      h: (h >>> 21) & 0x7ff,
      data: body.slice(off + 8, off + 8 + size),
    });
    off += 8 + size;
  }
  const screens = rawTree.map((n) => nodeToJSON(n, resources, resOffset, TAG.root));

  return { name, nameRaw, screens, resources };
}

// ---- .bin assembly ----
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;

  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function nodeBytes(j: FaceNode, resources: Resource[], offsets: number[]): Uint8Array {
  let val: Uint8Array;

  if (j.text) {
    val = new Uint8Array(64);
    val.set(new TextEncoder().encode(j.text).subarray(0, 63));
  } else if (j.images) {
    const parts: Uint8Array[] = [];

    if (j.x != null) {
      const head = new Uint8Array(4);

      head[0] = j.x;
      head[1] = j.x >> 8;
      head[2] = j.y!;
      head[3] = j.y! >> 8;
      const meta = unhex(j.meta!);

      if (meta.length !== 14) throw new Error(`tag ${j.tag}: meta must be 14 bytes`);
      parts.push(head, meta);
    } else {
      const pfx = unhex(j.prefix!);

      if (pfx.length !== 5) throw new Error(`tag ${j.tag}: prefix must be 5 bytes`);
      parts.push(pfx);
    }
    parts.push(refTailBytes(j, resources, offsets));
    val = concat(parts);
  } else if (j.x != null && j.tag === TAG.struct) {
    // short struct: x/y + meta, no image ref (e.g. imageless progress ring)
    const head = new Uint8Array(4);

    head[0] = j.x;
    head[1] = j.x >> 8;
    head[2] = j.y!;
    head[3] = j.y! >> 8;
    const meta = unhex(j.meta!);

    if (meta.length !== 14) throw new Error(`tag ${j.tag}: meta must be 14 bytes`);
    val = concat([head, meta, unhex(j.tail || "")]);
  } else if (j.pivotX != null) {
    val = new Uint8Array(5);
    val[0] = j.flag || 0;
    val[1] = j.pivotX;
    val[2] = j.pivotX >> 8;
    val[3] = j.pivotY!;
    val[4] = j.pivotY! >> 8;
  } else if (j.subs) {
    val = concat(j.subs.map((s) => nodeBytes(s, resources, offsets)));
  } else {
    val = unhex(j.hex || "");
  }
  const out = new Uint8Array(3 + val.length);

  out[0] = j.tag;
  out[1] = val.length;
  out[2] = val.length >> 8;
  out.set(val, 3);
  return out;
}

function refTailBytes(j: FaceNode, resources: Resource[], offsets: number[]): Uint8Array {
  const images = j.images!;

  for (let k = 0; k < images.length; k++) {
    const idx = images[k];

    if (idx < 0 || idx >= resources.length)
      throw new Error(`tag ${j.tag}: resource ${idx} out of range`);
    if (k > 0 && idx !== images[k - 1] + 1)
      throw new Error(`tag ${j.tag}: frame indices must be consecutive, not ${images}`);
  }
  const b = [j.refType!, images.length & 0xff, images.length >> 8];
  const off = offsets[images[0]];

  b.push(off & 0xff, (off >> 8) & 0xff, (off >> 16) & 0xff, (off >> 24) & 0xff);
  if (j.refType === 0x01) {
    // one absolute offset per frame after the first, which the shared prefix already wrote
    for (let k = 1; k < images.length; k++) {
      const o = offsets[images[k]];

      b.push(o & 0xff, (o >> 8) & 0xff, (o >> 16) & 0xff, (o >>> 24) & 0xff);
    }
    return new Uint8Array(b);
  }
  if (j.refType !== 0x61 && j.refType !== 0x71)
    throw new Error(`tag ${j.tag}: unknown refType 0x${j.refType!.toString(16)}`);
  for (const idx of images) {
    const blk = resources[idx].data.length + 8;

    b.push(blk & 0xff, blk >> 8);
  }
  return new Uint8Array(b);
}

export function buildBin(face: Face): Uint8Array {
  const res = face.resources;
  const offsets: number[] = Array(res.length).fill(0);
  const build = () => concat(face.screens.map((s) => nodeBytes(s, res, offsets)));
  let tb = build();
  let off = HDR + 3 + tb.length;

  for (let i = 0; i < res.length; i++) {
    offsets[i] = off;
    off += res[i].data.length + 8;
  }
  tb = build();
  if (tb.length > 0xffff) throw new Error("TLV tree exceeds 64K");
  const treeSec = concat([new Uint8Array([TAG.root, tb.length & 0xff, tb.length >> 8]), tb]);

  const rb = concat(
    res.flatMap((r) => {
      const h = (r.cf & 0x1f) | ((r.w & 0x7ff) << 10) | ((r.h & 0x7ff) << 21);
      const hd = new Uint8Array(8);

      hd[0] = h;
      hd[1] = h >> 8;
      hd[2] = h >> 16;
      hd[3] = h >>> 24;
      hd[4] = r.data.length;
      hd[5] = r.data.length >> 8;
      hd[6] = r.data.length >> 16;
      hd[7] = r.data.length >>> 24;
      return [hd, r.data];
    }),
  );

  const total = HDR + treeSec.length + rb.length + HDR;
  const hdr = new Uint8Array(HDR);

  hdr[4] = 1;
  if (face.nameRaw) hdr.set(unhex(face.nameRaw).subarray(0, 16), 8);
  else hdr.set(new TextEncoder().encode(face.name).subarray(0, 15), 8);
  const putU32 = (o: number, v: number) => {
    hdr[o] = v;
    hdr[o + 1] = v >> 8;
    hdr[o + 2] = v >> 16;
    hdr[o + 3] = v >>> 24;
  };

  putU32(0x18, total - HDR);
  putU32(0x1c, rb.length);
  putU32(0x20, rawCRC32(rb));
  putU32(0, rawCRC32(concat([hdr.subarray(4, HDR), treeSec])));
  return concat([hdr, treeSec, rb, hdr]);
}
