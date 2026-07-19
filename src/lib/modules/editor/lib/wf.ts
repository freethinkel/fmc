// CMF Watch Pro 2 watchface .bin <-> TS (port of wfformat.go / wfdecompile.go / wfcompile.go).
// Node schema is identical to the Go tool's face.json (fmc -wfdecompile) — files are interchangeable.
// Format: docs/cmf-protocol.md §9.6a.

export interface Resource {
  cf: number;
  w: number;
  h: number;
  data: Uint8Array;
  bitmap?: ImageBitmap;
}

export interface FaceNode {
  tag: number;
  subs?: FaceNode[];
  text?: string;
  hex?: string;
  x?: number;
  y?: number;
  meta?: string;
  prefix?: string;
  refType?: number;
  images?: number[];
  flag?: number;
  pivotX?: number;
  pivotY?: number;
  _kind?: string;
}

export interface Face {
  name: string;
  nameRaw?: string;
  screens: FaceNode[];
  resources: Resource[];
}

interface TLVNode {
  tag: number;
  raw: Uint8Array;
  children: TLVNode[] | null;
}

const HDR = 36;
export const TAG = {
  root: 0x20, main: 0x21, aod: 0x22, name: 0x86, preview: 0x28,
  struct: 0x01, bind: 0x02, pivot: 0x05, pvStruct: 0x08,
  fmt: 0x40, frame: 0x48,
  image: 0x30, number: 0x60, group: 0x68, hand: 0x70,
} as const;

export const hex = (d: Uint8Array) => [...d].map(b => b.toString(16).padStart(2, '0')).join('');
export const unhex = (s: string) => new Uint8Array((s.match(/../g) || []).map(b => parseInt(b, 16)));
const u16 = (d: Uint8Array, o: number) => d[o] | d[o + 1] << 8;
const u32 = (d: Uint8Array, o: number) => (d[o] | d[o + 1] << 8 | d[o + 2] << 16 | d[o + 3] << 24) >>> 0;

// ---- CRC32 "raw": IEEE reflected, init=0, NO final inversion ----
const CRC_T = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
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

const handKinds: Record<number, string> = { 0x0a: 'minute', 0x0e: 'hour', 0x72: 'second', 0x12: 'second' };

// parseRefTail: [type][count u16][ref u32][count×u16 blk] starting at off.
function parseRefTail(v: Uint8Array, off: number, resources: Resource[], resOffset: Map<number, number>) {
  if (off + 3 > v.length) return null;
  const typ = v[off];
  const count = u16(v, off + 1);
  let p = off + 3;
  if (p + 4 > v.length) return null;
  const ref = u32(v, p);
  p += 4;
  if (!resOffset.has(ref)) return null;
  const idx = resOffset.get(ref)!;
  if (typ === 0x01) {
    if (p !== v.length) return null;
    return { refType: typ, images: [idx] };
  }
  if (typ === 0x61 || typ === 0x71) {
    if (p + 2 * count !== v.length || count === 0) return null;
    const images: number[] = [];
    let cur = ref;
    for (let k = 0; k < count; k++) {
      if (!resOffset.has(cur)) return null;
      const i = resOffset.get(cur)!;
      const blk = resources[i].data.length + 8;
      if (blk !== u16(v, p + 2 * k)) return null;
      images.push(i);
      cur += blk;
    }
    return { refType: typ, images };
  }
  return null;
}

function allZero(b: Uint8Array): boolean {
  for (const c of b) if (c !== 0) return false;
  return true;
}

function nodeToJSON(n: TLVNode, resources: Resource[], resOffset: Map<number, number>, parentTag: number): FaceNode {
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
  if (n.tag === TAG.struct && v.length >= 25) {
    const rt = parseRefTail(v, 18, resources, resOffset);
    if (rt) {
      j.x = u16(v, 0);
      j.y = u16(v, 2);
      j.meta = hex(v.subarray(4, 18));
      j.refType = rt.refType;
      j.images = rt.images;
      if (parentTag === TAG.hand && handKinds[v[13]]) j._kind = handKinds[v[13]];
      return j;
    }
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
  if (n.children) {
    j.subs = n.children.map(c => nodeToJSON(c, resources, resOffset, n.tag));
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
    throw new Error('no watchface magic in header');
  for (let i = 0; i < HDR; i++)
    if (d[i] !== d[d.length - HDR + i]) throw new Error('footer differs from header');
  let e = 8;
  while (e < 0x18 && d[e]) e++;
  const name = new TextDecoder().decode(d.subarray(8, e));
  // after the NUL in the 16-byte name field there can be a non-zero tail (byte 0x17 = 0x08/0x0a,
  // meaning unknown) — keep the whole field for an exact round-trip
  const nameRaw = hex(d.subarray(8, 0x18));
  const body = d.subarray(HDR, d.length - HDR);
  if (body[0] !== TAG.root) throw new Error(`root tag 0x${body[0].toString(16)}, expected 0x20`);
  const rootLen = u16(body, 1);
  if (3 + rootLen > body.length) throw new Error('tree length exceeds body');
  const rawTree = parseTLV(body.subarray(3, 3 + rootLen), 0);
  if (!rawTree) throw new Error('TLV tree does not parse');

  const resources: Resource[] = [];
  const resOffset = new Map<number, number>();
  let off = 3 + rootLen;
  while (off < body.length) {
    if (off + 8 > body.length) throw new Error(`truncated resource @body+0x${off.toString(16)}`);
    const h = u32(body, off);
    const size = u32(body, off + 4);
    if (off + 8 + size > body.length) throw new Error(`resource @body+0x${off.toString(16)} exceeds body`);
    resOffset.set(off + HDR, resources.length);
    resources.push({ cf: h & 0x1f, w: h >>> 10 & 0x7ff, h: h >>> 21 & 0x7ff, data: body.slice(off + 8, off + 8 + size) });
    off += 8 + size;
  }
  const screens = rawTree.map(n => nodeToJSON(n, resources, resOffset, TAG.root));
  return { name, nameRaw, screens, resources };
}

// ---- .bin assembly ----
function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
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
      head[0] = j.x; head[1] = j.x >> 8; head[2] = j.y!; head[3] = j.y! >> 8;
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
  } else if (j.pivotX != null) {
    val = new Uint8Array(5);
    val[0] = j.flag || 0;
    val[1] = j.pivotX; val[2] = j.pivotX >> 8;
    val[3] = j.pivotY!; val[4] = j.pivotY! >> 8;
  } else if (j.subs) {
    val = concat(j.subs.map(s => nodeBytes(s, resources, offsets)));
  } else {
    val = unhex(j.hex || '');
  }
  const out = new Uint8Array(3 + val.length);
  out[0] = j.tag; out[1] = val.length; out[2] = val.length >> 8;
  out.set(val, 3);
  return out;
}

function refTailBytes(j: FaceNode, resources: Resource[], offsets: number[]): Uint8Array {
  const images = j.images!;
  for (let k = 0; k < images.length; k++) {
    const idx = images[k];
    if (idx < 0 || idx >= resources.length) throw new Error(`tag ${j.tag}: resource ${idx} out of range`);
    if (k > 0 && idx !== images[k - 1] + 1)
      throw new Error(`tag ${j.tag}: frame indices must be consecutive, not ${images}`);
  }
  const b = [j.refType!, images.length & 0xff, images.length >> 8];
  const off = offsets[images[0]];
  b.push(off & 0xff, off >> 8 & 0xff, off >> 16 & 0xff, off >> 24 & 0xff);
  if (j.refType === 0x01) {
    if (images.length !== 1) throw new Error(`tag ${j.tag}: refType 0x01 references exactly one resource`);
    b[1] = 1; b[2] = 0;
    return new Uint8Array(b);
  }
  if (j.refType !== 0x61 && j.refType !== 0x71) throw new Error(`tag ${j.tag}: unknown refType 0x${j.refType!.toString(16)}`);
  for (const idx of images) {
    const blk = resources[idx].data.length + 8;
    b.push(blk & 0xff, blk >> 8);
  }
  return new Uint8Array(b);
}

export function buildBin(face: Face): Uint8Array {
  const res = face.resources;
  const offsets: number[] = new Array(res.length).fill(0);
  const build = () => concat(face.screens.map(s => nodeBytes(s, res, offsets)));
  let tb = build();
  let off = HDR + 3 + tb.length;
  for (let i = 0; i < res.length; i++) { offsets[i] = off; off += res[i].data.length + 8; }
  tb = build();
  if (tb.length > 0xffff) throw new Error('TLV tree exceeds 64K');
  const treeSec = concat([new Uint8Array([TAG.root, tb.length & 0xff, tb.length >> 8]), tb]);

  const rb = concat(res.flatMap(r => {
    const h = (r.cf & 0x1f) | (r.w & 0x7ff) << 10 | (r.h & 0x7ff) << 21;
    const hd = new Uint8Array(8);
    hd[0] = h; hd[1] = h >> 8; hd[2] = h >> 16; hd[3] = h >>> 24;
    hd[4] = r.data.length; hd[5] = r.data.length >> 8; hd[6] = r.data.length >> 16; hd[7] = r.data.length >>> 24;
    return [hd, r.data];
  }));

  const total = HDR + treeSec.length + rb.length + HDR;
  const hdr = new Uint8Array(HDR);
  hdr[4] = 1;
  if (face.nameRaw) hdr.set(unhex(face.nameRaw).subarray(0, 16), 8);
  else hdr.set(new TextEncoder().encode(face.name).subarray(0, 15), 8);
  const putU32 = (o: number, v: number) => { hdr[o] = v; hdr[o + 1] = v >> 8; hdr[o + 2] = v >> 16; hdr[o + 3] = v >>> 24; };
  putU32(0x18, total - HDR);
  putU32(0x1c, rb.length);
  putU32(0x20, rawCRC32(rb));
  putU32(0, rawCRC32(concat([hdr.subarray(4, HDR), treeSec])));
  return concat([hdr, treeSec, rb, hdr]);
}

// ---- LZ4 block ----
export function lz4Decompress(src: Uint8Array, outSize: number): Uint8Array {
  const dst = new Uint8Array(outSize);
  let d = 0, i = 0;
  while (i < src.length) {
    const token = src[i++];
    let litLen = token >> 4;
    if (litLen === 15) { let b; do { b = src[i++]; litLen += b; } while (b === 255); }
    dst.set(src.subarray(i, i + litLen), d);
    d += litLen; i += litLen;
    if (i >= src.length) break;
    const off = src[i] | src[i + 1] << 8;
    i += 2;
    let mLen = (token & 15) + 4;
    if ((token & 15) === 15) { let b; do { b = src[i++]; mLen += b; } while (b === 255); }
    if (off === 0 || off > d) throw new Error(`lz4: offset ${off} out of window`);
    const pos = d - off;
    for (let k = 0; k < mLen; k++) dst[d++] = dst[pos + k];
  }
  return d === outSize ? dst : dst.subarray(0, d);
}

// ponytail: greedy encoder as in Go — the watch accepts any valid stream
export function lz4Compress(src: Uint8Array): Uint8Array {
  const dst: number[] = [];
  function writeSeq(litStart: number, litEnd: number, off: number, mLen: number) {
    const litLen = litEnd - litStart;
    const ml = off > 0 ? mLen - 4 : 0;
    let tok = litLen >= 15 ? 0xf0 : litLen << 4;
    if (off > 0) tok |= ml >= 15 ? 15 : ml;
    dst.push(tok);
    for (let l = litLen - 15; litLen >= 15 && l >= 0; l -= 255) {
      if (l >= 255) dst.push(255); else { dst.push(l); break; }
    }
    for (let i = litStart; i < litEnd; i++) dst.push(src[i]);
    if (off > 0) {
      dst.push(off & 0xff, off >> 8);
      for (let l = ml - 15; ml >= 15 && l >= 0; l -= 255) {
        if (l >= 255) dst.push(255); else { dst.push(l); break; }
      }
    }
  }
  const n = src.length;
  if (n < 13) { writeSeq(0, n, 0, 0); return new Uint8Array(dst); }
  const rd = (p: number) => src[p] | src[p + 1] << 8 | src[p + 2] << 16 | src[p + 3] << 24;
  const table = new Int32Array(1 << 14).fill(-1);
  let litStart = 0, i = 0;
  const limit = n - 5;
  while (i < n - 12) {
    const h = (Math.imul(rd(i), 2654435761) >>> 18) & 0x3fff;
    const cand = table[h];
    table[h] = i;
    if (cand >= 0 && i - cand <= 65535 && rd(cand) === rd(i)) {
      let mLen = 4;
      while (i + mLen < limit && src[cand + mLen] === src[i + mLen]) mLen++;
      writeSeq(litStart, i, i - cand, mLen);
      i += mLen;
      litStart = i;
      continue;
    }
    i++;
  }
  writeSeq(litStart, n, 0, 0);
  return new Uint8Array(dst);
}

// ---- pixel codecs ----
// decodePixels: resource -> RGBA Uint8ClampedArray (null for cf=1 — that's raw JPEG)
export function decodePixels(r: Resource): Uint8ClampedArray<ArrayBuffer> | null {
  const { cf, w, h } = r;
  if (cf === 1) return null;
  const bpp = ({ 4: 2, 5: 3, 24: 4 } as Record<number, number>)[cf];
  const want = cf === 13 ? (w * h + 1) >> 1 : w * h * bpp;
  const raw = lz4Decompress(r.data, want);
  if (raw.length !== want) throw new Error(`cf=${cf} ${w}x${h}: decompressed ${raw.length}, expected ${want}`);
  const px = new Uint8ClampedArray(w * h * 4);
  const e5 = (v: number) => v * 255 / 31 | 0, e6 = (v: number) => v * 255 / 63 | 0;
  for (let i = 0; i < w * h; i++) {
    let c: number;
    const o = i * 4;
    switch (cf) {
      case 4:
        c = u16(raw, i * 2);
        px[o] = e5(c >> 11); px[o + 1] = e6(c >> 5 & 63); px[o + 2] = e5(c & 31); px[o + 3] = 255;
        break;
      case 5:
        c = u16(raw, i * 3);
        px[o] = e5(c >> 11); px[o + 1] = e6(c >> 5 & 63); px[o + 2] = e5(c & 31); px[o + 3] = raw[i * 3 + 2];
        break;
      case 13: {
        const nib = raw[i >> 1];
        const a = i % 2 ? nib & 15 : nib >> 4;
        px[o] = px[o + 1] = px[o + 2] = 255; px[o + 3] = a * 17;
        break;
      }
      case 24:
        px[o] = raw[i * 4 + 2]; px[o + 1] = raw[i * 4 + 1]; px[o + 2] = raw[i * 4]; px[o + 3] = raw[i * 4 + 3];
        break;
      default:
        throw new Error(`unknown cf=${cf}`);
    }
  }
  return px;
}

// encodePixels: RGBA -> resource of the given cf
export function encodePixels(px: Uint8ClampedArray, w: number, h: number, cf: number): Resource {
  if (w > 2047 || h > 2047) throw new Error(`image ${w}x${h} does not fit 11-bit fields`);
  const r565 = (r: number, g: number, b: number) => (r >> 3) << 11 | (g >> 2) << 5 | b >> 3;
  let raw: Uint8Array;
  switch (cf) {
    case 4: raw = new Uint8Array(w * h * 2); break;
    case 5: raw = new Uint8Array(w * h * 3); break;
    case 13: raw = new Uint8Array((w * h + 1) >> 1); break;
    case 24: raw = new Uint8Array(w * h * 4); break;
    default: throw new Error(`cf=${cf} not supported for encoding`);
  }
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4], g = px[i * 4 + 1], b = px[i * 4 + 2], a = px[i * 4 + 3];
    switch (cf) {
      case 4: { const c = r565(r, g, b); raw[i * 2] = c; raw[i * 2 + 1] = c >> 8; break; }
      case 5: { const c = r565(r, g, b); raw[i * 3] = c; raw[i * 3 + 1] = c >> 8; raw[i * 3 + 2] = a; break; }
      case 13: raw[i >> 1] |= i % 2 ? a >> 4 : a >> 4 << 4; break;
      case 24: raw[i * 4] = b; raw[i * 4 + 1] = g; raw[i * 4 + 2] = r; raw[i * 4 + 3] = a; break;
    }
  }
  return { cf, w, h, data: lz4Compress(raw) };
}
