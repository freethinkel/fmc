// LZ4 block codec — the compression every resource payload in a .bin is stored under.

export function lz4Decompress(src: Uint8Array, outSize: number): Uint8Array {
  const dst = new Uint8Array(outSize);
  let d = 0,
    i = 0;

  while (i < src.length) {
    const token = src[i++];
    let litLen = token >> 4;

    if (litLen === 15) {
      let b;

      do {
        b = src[i++];
        litLen += b;
      } while (b === 255);
    }
    dst.set(src.subarray(i, i + litLen), d);
    d += litLen;
    i += litLen;
    if (i >= src.length) break;
    const off = src[i] | (src[i + 1] << 8);

    i += 2;
    let mLen = (token & 15) + 4;

    if ((token & 15) === 15) {
      let b;

      do {
        b = src[i++];
        mLen += b;
      } while (b === 255);
    }
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
      if (l >= 255) dst.push(255);
      else {
        dst.push(l);
        break;
      }
    }
    for (let i = litStart; i < litEnd; i++) dst.push(src[i]);
    if (off > 0) {
      dst.push(off & 0xff, off >> 8);
      for (let l = ml - 15; ml >= 15 && l >= 0; l -= 255) {
        if (l >= 255) dst.push(255);
        else {
          dst.push(l);
          break;
        }
      }
    }
  }
  const n = src.length;

  if (n < 13) {
    writeSeq(0, n, 0, 0);
    return new Uint8Array(dst);
  }
  const rd = (p: number) => src[p] | (src[p + 1] << 8) | (src[p + 2] << 16) | (src[p + 3] << 24);
  const table = new Int32Array(1 << 14).fill(-1);
  let litStart = 0,
    i = 0;
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
