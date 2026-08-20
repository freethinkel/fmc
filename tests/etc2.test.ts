// cf 28 (ETC2 RGBA8) and cf 14 (8-bit alpha) — the two Watch Pro 3 resource formats that made
// the editor throw "source array is too long" (issue #49). Expected pixels come from a reference
// decoder (texture2ddecoder) run on the same fixture, one sample per ETC2 block mode.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { decodePixels, encodePixels, parseBin } from "$lib/modules/editor/core/format";

const fixture = (name: string) =>
  parseBin(new Uint8Array(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url))));

describe("cf 28 — ETC2 RGBA8", () => {
  const face = fixture("Pro3__SlopeTime.bin");
  const r = face.resources[1];
  const px = decodePixels(r)!;
  const at = (x: number, y: number) =>
    Array.from(px.subarray((y * r.w + x) * 4, (y * r.w + x) * 4 + 4));

  test("is a 466x466 background decoded from 468x468 blocks", () => {
    expect([r.cf, r.w, r.h]).toEqual([28, 466, 466]);
    expect(px.length).toBe(466 * 466 * 4);
  });
  test("differential block + opaque alpha", () => expect(at(232, 232)).toEqual([48, 48, 52, 255]));
  test("individual block", () => expect(at(208, 3)).toEqual([59, 59, 59, 255]));
  test("T block", () => expect(at(231, 0)).toEqual([51, 51, 51, 255]));
  test("H block", () => expect(at(255, 4)).toEqual([57, 57, 57, 255]));
  test("planar block", () => {
    expect(at(332, 84)).toEqual([97, 96, 101, 255]);
    expect(at(335, 87)).toEqual([91, 93, 95, 255]);
  });
  test("EAC alpha: transparent corner and an anti-aliased edge", () => {
    expect(at(0, 0)[3]).toBe(0);
    expect(at(212, 0)).toEqual([0, 0, 0, 37]);
  });
  test("has no encoder", () => {
    expect(() => encodePixels(px, r.w, r.h, 28)).toThrow(/not supported/);
  });
});

describe("cf 14 — 8-bit alpha mask", () => {
  const face = fixture("Pro3__Cyclopes.bin");
  const r = face.resources[32];

  test("decodes to white with the byte as alpha, and round-trips", () => {
    expect([r.cf, r.w, r.h]).toEqual([14, 36, 60]);
    const px = decodePixels(r)!;
    const alphas = new Set<number>();

    for (let i = 0; i < px.length; i += 4) {
      expect([px[i], px[i + 1], px[i + 2]]).toEqual([255, 255, 255]);
      alphas.add(px[i + 3]);
    }
    expect(alphas.size).toBeGreaterThan(2); // a real mask, not a flat one
    expect(decodePixels(encodePixels(px, r.w, r.h, 14))).toEqual(px);
  });
});
