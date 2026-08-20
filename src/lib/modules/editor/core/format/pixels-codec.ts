// Resource payload <-> RGBA. The colour formats (`cf`) are LVGL's: 4 = RGB565, 5 = RGB565+alpha,
// 13 = 4-bit alpha mask, 14 = 8-bit alpha mask, 24 = BGRA8888, 28 = ETC2 RGBA8 (Watch Pro 3,
// decode only), 1 = raw JPEG (left to the browser to decode).

import { decodeEtc2, etc2Size } from "./etc2";
import { lz4Compress, lz4Decompress } from "./lz4";
import type { Resource } from "./raw";
import { u16 } from "./raw";

// decodePixels: resource -> RGBA Uint8ClampedArray (null for cf=1 — that's raw JPEG)
export function decodePixels(r: Resource): Uint8ClampedArray<ArrayBuffer> | null {
  const { cf, w, h } = r;

  if (cf === 1) return null;
  const bpp = ({ 4: 2, 5: 3, 13: 0.5, 14: 1, 24: 4 } as Record<number, number>)[cf];

  if (!bpp && cf !== 28) throw new Error(`unknown cf=${cf}`);
  const want = cf === 28 ? etc2Size(w, h) : Math.ceil(w * h * bpp);
  const raw = lz4Decompress(r.data, want);

  if (raw.length !== want)
    throw new Error(`cf=${cf} ${w}x${h}: decompressed ${raw.length}, expected ${want}`);
  if (cf === 28) return decodeEtc2(raw, w, h);
  const px = new Uint8ClampedArray(w * h * 4);
  const e5 = (v: number) => ((v * 255) / 31) | 0,
    e6 = (v: number) => ((v * 255) / 63) | 0;

  for (let i = 0; i < w * h; i++) {
    let c: number;
    const o = i * 4;

    switch (cf) {
      case 4:
        c = u16(raw, i * 2);
        px[o] = e5(c >> 11);
        px[o + 1] = e6((c >> 5) & 63);
        px[o + 2] = e5(c & 31);
        px[o + 3] = 255;
        break;
      case 5:
        c = u16(raw, i * 3);
        px[o] = e5(c >> 11);
        px[o + 1] = e6((c >> 5) & 63);
        px[o + 2] = e5(c & 31);
        px[o + 3] = raw[i * 3 + 2];
        break;
      case 13: {
        const nib = raw[i >> 1];
        const a = i % 2 ? nib & 15 : nib >> 4;

        px[o] = px[o + 1] = px[o + 2] = 255;
        px[o + 3] = a * 17;
        break;
      }
      case 14:
        px[o] = px[o + 1] = px[o + 2] = 255;
        px[o + 3] = raw[i];
        break;
      case 24:
        px[o] = raw[i * 4 + 2];
        px[o + 1] = raw[i * 4 + 1];
        px[o + 2] = raw[i * 4];
        px[o + 3] = raw[i * 4 + 3];
        break;
    }
  }
  return px;
}

// encodePixels: RGBA -> resource of the given cf
export function encodePixels(px: Uint8ClampedArray, w: number, h: number, cf: number): Resource {
  if (w > 2047 || h > 2047) throw new Error(`image ${w}x${h} does not fit 11-bit fields`);
  const r565 = (r: number, g: number, b: number) => ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3);
  let raw: Uint8Array;

  switch (cf) {
    case 4:
      raw = new Uint8Array(w * h * 2);
      break;
    case 5:
      raw = new Uint8Array(w * h * 3);
      break;
    case 13:
      raw = new Uint8Array((w * h + 1) >> 1);
      break;
    case 14:
      raw = new Uint8Array(w * h);
      break;
    case 24:
      raw = new Uint8Array(w * h * 4);
      break;
    default:
      throw new Error(`cf=${cf} not supported for encoding`);
  }
  for (let i = 0; i < w * h; i++) {
    const r = px[i * 4],
      g = px[i * 4 + 1],
      b = px[i * 4 + 2],
      a = px[i * 4 + 3];

    switch (cf) {
      case 4: {
        const c = r565(r, g, b);

        raw[i * 2] = c;
        raw[i * 2 + 1] = c >> 8;
        break;
      }
      case 5: {
        const c = r565(r, g, b);

        raw[i * 3] = c;
        raw[i * 3 + 1] = c >> 8;
        raw[i * 3 + 2] = a;
        break;
      }
      case 13:
        raw[i >> 1] |= i % 2 ? a >> 4 : (a >> 4) << 4;
        break;
      case 14:
        raw[i] = a;
        break;
      case 24:
        raw[i * 4] = b;
        raw[i * 4 + 1] = g;
        raw[i * 4 + 2] = r;
        raw[i * 4 + 3] = a;
        break;
    }
  }
  return { cf, w, h, data: lz4Compress(raw) };
}
