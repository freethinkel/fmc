// Round-trip check of parser/builder against real .bin files from ../watchfaces/:
// parse -> build must produce a byte-for-byte identical file (resources are not re-encoded).
// Plus lz4: decompress all resources + compress->decompress round-trip.
// Runs in the "unit" (node) vitest project — needs node:fs, not a browser.
import { readFileSync, readdirSync } from "node:fs";
import { describe, test, expect } from "vitest";
import {
  parseBin,
  buildBin,
  decodePixels,
  lz4Compress,
  lz4Decompress,
  type Face,
  type FaceNode,
} from "$lib/modules/editor/core/format";

const dir = new URL("./__fixtures__/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".bin"));

describe("wf.ts round-trips every real watchface .bin byte-for-byte", () => {
  test.each(files)("%s", (name) => {
    const src = new Uint8Array(readFileSync(new URL(name, dir)));
    const face = parseBin(src);
    const out = buildBin(face);

    expect(out).toEqual(src);

    for (const r of face.resources) {
      const px = decodePixels(r); // throws if lz4/size is broken

      if (!px || r !== face.resources[0]) continue;
      // compress -> decompress round trip on the first resource of the file
      const want =
        ({ 4: 2, 5: 3, 24: 4 } as Record<number, number>)[r.cf] * r.w * r.h || (r.w * r.h + 1) >> 1;
      const raw = lz4Decompress(r.data, want);
      const rt = lz4Decompress(lz4Compress(raw), raw.length);

      expect(rt).toEqual(raw);
    }
  });
});

// Widget x/y is int16 — stock faces park nodes a few pixels off the left/top edge
// (Digital__297__Ray sits at x=-1), so the editor must keep negatives instead of
// reading them back as 65535.
test("negative widget x/y survive parse -> build -> parse", () => {
  const structs = (face: Face) => {
    const out: FaceNode[] = [];
    const walk = (n: FaceNode) => {
      if (n.x != null) out.push(n);
      n.subs?.forEach(walk);
    };

    face.screens.forEach(walk);
    return out;
  };
  const face = parseBin(new Uint8Array(readFileSync(new URL(files[0], dir))));
  const st = structs(face)[0];

  st.x = -3;
  st.y = -7;
  const back = structs(parseBin(buildBin(face)))[0];

  expect([back.x, back.y]).toEqual([-3, -7]);
});
