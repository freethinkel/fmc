// Round-trip check of parser/builder against real .bin files from watchfaces/:
// parse -> build must produce a byte-for-byte identical file (resources are not re-encoded).
// Plus lz4: decompress all resources + compress->decompress round-trip.
import { readFileSync, readdirSync } from 'node:fs';
import { parseBin, buildBin, decodePixels, lz4Compress, lz4Decompress } from './src/lib/wf.js';

const dir = new URL('../watchfaces/files/', import.meta.url).pathname;
const files = readdirSync(dir).filter(f => f.endsWith('.bin'));
let identical = 0, decoded = 0, lzOK = 0;

for (const f of files) {
  const src = new Uint8Array(readFileSync(dir + f));
  const face = parseBin(src);
  const out = buildBin(face);
  if (out.length === src.length && out.every((b, i) => b === src[i])) identical++;
  else console.error(`NOT IDENTICAL: ${f} (${src.length} -> ${out.length})`);
  for (const r of face.resources) {
    const px = decodePixels(r); // throws if lz4/size is broken
    if (px) {
      decoded++;
      if (r === face.resources[0]) {
        // compress -> decompress on the first resource of each file
        const want = { 4: 2, 5: 3, 24: 4 }[r.cf] * r.w * r.h || (r.w * r.h + 1) >> 1;
        const raw = lz4Decompress(r.data, want);
        const rt = lz4Decompress(lz4Compress(raw), raw.length);
        if (raw.length === rt.length && raw.every((b, i) => b === rt[i])) lzOK++;
        else console.error(`LZ4 RT FAIL: ${f}`);
      }
    }
  }
}
console.log(`round-trip identical: ${identical}/${files.length}, resources decoded: ${decoded}, lz4 rt: ${lzOK}`);
if (identical !== files.length) process.exit(1);
