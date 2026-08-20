// ETC2 RGBA8 (EAC alpha + ETC2 RGB) block texture — what cf 28 resources on the CMF Watch Pro 3
// are stored as: 4x4-pixel blocks of 16 bytes (8 alpha, 8 colour), row-major over the image
// padded to a multiple of 4 on both axes. Decode only; spec: OpenGL ES 3.0, appendix C.
// ponytail: no encoder — an edited cf 28 asset can't be written back; re-encode as cf 5 if that
// ever matters (the watch takes the Pro 2 formats fine, see issue #49).

const MOD = [
  [2, 8],
  [5, 17],
  [9, 29],
  [13, 42],
  [18, 60],
  [24, 80],
  [33, 106],
  [47, 183],
];
const DIST = [3, 6, 11, 16, 23, 32, 41, 64];
const EAC = [
  [-3, -6, -9, -15, 2, 5, 8, 14],
  [-3, -7, -10, -13, 2, 6, 9, 12],
  [-2, -5, -8, -13, 1, 4, 7, 12],
  [-2, -4, -6, -13, 1, 3, 5, 12],
  [-3, -6, -8, -12, 2, 5, 7, 11],
  [-3, -7, -9, -11, 2, 6, 8, 10],
  [-4, -7, -8, -11, 3, 6, 7, 10],
  [-3, -5, -8, -11, 2, 4, 7, 10],
  [-2, -6, -8, -10, 1, 5, 7, 9],
  [-2, -5, -8, -10, 1, 4, 7, 9],
  [-2, -4, -8, -10, 1, 3, 7, 9],
  [-2, -5, -7, -10, 1, 4, 6, 9],
  [-3, -4, -7, -10, 2, 3, 6, 9],
  [-1, -2, -3, -10, 0, 1, 2, 9],
  [-4, -6, -8, -9, 3, 5, 7, 8],
  [-3, -5, -7, -9, 2, 4, 6, 8],
];

const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);
const ext4 = (v: number) => v * 17;
const ext5 = (v: number) => (v << 3) | (v >> 2);
const ext6 = (v: number) => (v << 2) | (v >> 4);
const ext7 = (v: number) => (v << 1) | (v >> 6);
const s3 = (v: number) => (v & 7) - (v & 4 ? 8 : 0); // 3-bit two's complement

/** Decode the 8-byte colour block at `b[o..]` into `out` as 16 RGB triples, pixel i = x*4+y. */
function rgbBlock(b: Uint8Array, o: number, out: Uint8ClampedArray) {
  const b0 = b[o],
    b1 = b[o + 1],
    b2 = b[o + 2],
    b3 = b[o + 3];
  const lo = ((b[o + 4] << 24) | (b[o + 5] << 16) | (b[o + 6] << 8) | b[o + 7]) >>> 0;
  const idx = (i: number) => (((lo >>> (16 + i)) & 1) << 1) | ((lo >>> i) & 1);
  const paint = (p: number[][]) => {
    for (let i = 0; i < 16; i++) {
      const c = p[idx(i)];

      out[i * 3] = c[0];
      out[i * 3 + 1] = c[1];
      out[i * 3 + 2] = c[2];
    }
  };
  const diff = (b3 >> 1) & 1;
  let c1: number[], c2: number[];

  if (!diff) {
    c1 = [ext4(b0 >> 4), ext4(b1 >> 4), ext4(b2 >> 4)];
    c2 = [ext4(b0 & 15), ext4(b1 & 15), ext4(b2 & 15)];
  } else {
    const R = b0 >> 3,
      G = b1 >> 3,
      B = b2 >> 3;
    const R2 = R + s3(b0),
      G2 = G + s3(b1),
      B2 = B + s3(b2);

    if (R2 < 0 || R2 > 31) {
      // T mode: one base colour plus a second with ±distance
      const c0 = [ext4((((b0 >> 3) & 3) << 2) | (b0 & 3)), ext4(b1 >> 4), ext4(b1 & 15)];
      const cA = [ext4(b2 >> 4), ext4(b2 & 15), ext4(b3 >> 4)];
      const d = DIST[(((b3 >> 2) & 3) << 1) | (b3 & 1)];

      return paint([c0, cA.map((v) => clamp(v + d)), cA, cA.map((v) => clamp(v - d))]);
    }
    if (G2 < 0 || G2 > 31) {
      // H mode: two base colours, each ±distance
      const cA = [
        ext4((b0 >> 3) & 15),
        ext4(((b0 & 7) << 1) | ((b1 >> 4) & 1)),
        ext4((((b1 >> 3) & 1) << 3) | ((b1 & 3) << 1) | (b2 >> 7)),
      ];
      const cB = [ext4((b2 >> 3) & 15), ext4(((b2 & 7) << 1) | (b3 >> 7)), ext4((b3 >> 3) & 15)];
      const vA = (cA[0] << 16) | (cA[1] << 8) | cA[2],
        vB = (cB[0] << 16) | (cB[1] << 8) | cB[2];
      const d = DIST[(((b3 >> 2) & 1) << 2) | ((b3 & 1) << 1) | (vA >= vB ? 1 : 0)];

      return paint([
        cA.map((v) => clamp(v + d)),
        cA.map((v) => clamp(v - d)),
        cB.map((v) => clamp(v + d)),
        cB.map((v) => clamp(v - d)),
      ]);
    }
    if (B2 < 0 || B2 > 31) {
      // planar: a colour gradient from three corner colours O (0,0), H (4,0), V (0,4)
      const b4 = b[o + 4],
        b5 = b[o + 5],
        b6 = b[o + 6],
        b7 = b[o + 7];
      const O = [
        ext6((b0 >> 1) & 63),
        ext7(((b0 & 1) << 6) | ((b1 >> 1) & 63)),
        ext6(((b1 & 1) << 5) | (b2 & 0x18) | ((b2 & 3) << 1) | (b3 >> 7)),
      ];
      const H = [
        ext6((((b3 >> 2) & 31) << 1) | (b3 & 1)),
        ext7(b4 >> 1),
        ext6(((b4 & 1) << 5) | (b5 >> 3)),
      ];
      const V = [
        ext6(((b5 & 7) << 3) | (b6 >> 5)),
        ext7(((b6 & 31) << 2) | (b7 >> 6)),
        ext6(b7 & 63),
      ];

      for (let x = 0; x < 4; x++)
        for (let y = 0; y < 4; y++)
          for (let k = 0; k < 3; k++)
            out[(x * 4 + y) * 3 + k] = clamp(
              (x * (H[k] - O[k]) + y * (V[k] - O[k]) + 4 * O[k] + 2) >> 2,
            );
      return;
    }
    c1 = [ext5(R), ext5(G), ext5(B)];
    c2 = [ext5(R2), ext5(G2), ext5(B2)];
  }
  // ETC1: two sub-blocks (left/right, or top/bottom when flipped), each a base ± table modifier
  const flip = b3 & 1;
  const t1 = MOD[b3 >> 5],
    t2 = MOD[(b3 >> 2) & 7];

  for (let i = 0; i < 16; i++) {
    const x = i >> 2,
      y = i & 3;
    const first = flip ? y < 2 : x < 2;
    const base = first ? c1 : c2,
      t = first ? t1 : t2;
    const k = idx(i);
    const m = (k & 1 ? t[1] : t[0]) * (k & 2 ? -1 : 1);

    out[i * 3] = clamp(base[0] + m);
    out[i * 3 + 1] = clamp(base[1] + m);
    out[i * 3 + 2] = clamp(base[2] + m);
  }
}

/** Padded buffer size of a w×h ETC2 RGBA8 texture. */
export const etc2Size = (w: number, h: number) => ((w + 3) >> 2) * ((h + 3) >> 2) * 16;

/** ETC2 RGBA8 blocks -> RGBA pixels, cropped to w×h. */
export function decodeEtc2(raw: Uint8Array, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const px = new Uint8ClampedArray(w * h * 4);
  const bw = (w + 3) >> 2;
  const rgb = new Uint8ClampedArray(48);

  for (let o = 0, blk = 0; o + 16 <= raw.length; o += 16, blk++) {
    const bx = (blk % bw) * 4,
      by = ((blk / bw) | 0) * 4;
    const base = raw[o],
      mult = raw[o + 1] >> 4,
      tbl = EAC[raw[o + 1] & 15];
    // 48 bits of 3-bit alpha indices, first pixel in the top bits
    const aHi = (raw[o + 2] << 16) | (raw[o + 3] << 8) | raw[o + 4];
    const aLo = (raw[o + 5] << 16) | (raw[o + 6] << 8) | raw[o + 7];

    rgbBlock(raw, o + 8, rgb);
    for (let i = 0; i < 16; i++) {
      const x = bx + (i >> 2),
        y = by + (i & 3);

      if (x >= w || y >= h) continue;
      const ai = i < 8 ? (aHi >> (21 - 3 * i)) & 7 : (aLo >> (45 - 3 * i)) & 7;
      const p = (y * w + x) * 4;

      px[p] = rgb[i * 3];
      px[p + 1] = rgb[i * 3 + 1];
      px[p + 2] = rgb[i * 3 + 2];
      px[p + 3] = clamp(base + tbl[ai] * mult);
    }
  }
  return px;
}
