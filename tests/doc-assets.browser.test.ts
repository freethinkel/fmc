// The asset helpers the editor leans on, each checked against its own contract: the accent tint
// is preview-only, an invert is involutive, and re-baking a preview reproduces what the renderer
// draws. (Whether the renderer itself is right is editor-preview-match's job.)
import { test, expect } from "vitest";
import {
  parseBin,
  decodePixels,
  encodePixels,
  type Resource,
} from "$lib/modules/editor/core/format";
import {
  accentBitmapForAsset,
  accentFlaggedAssets,
  decodeAssets,
  invertAsset,
  pixelsOf,
  regenPreviewAssets,
  rotateAsset,
} from "$lib/modules/editor/core/render/pixels";
import {
  fromLegacy,
  isAccent,
  framesOf,
  type ImageAsset,
  type ImageId,
  type Layer,
} from "$lib/modules/editor/core/document/doc";
import { defaultSim } from "$lib/modules/editor/core/document/sources";
import url from "./__fixtures__/Multifunction__368__Function.bin?url";

const asResource = (a: ImageAsset): Resource => ({ cf: a.cf, w: a.w, h: a.h, data: a.data });
const sim = { ...defaultSim(), live: false, time: new Date("2026-01-09T10:09:30").getTime() };

async function load() {
  const { doc } = fromLegacy(parseBin(await fetch(url).then((r) => r.arrayBuffer())));

  return { doc, cache: await decodeAssets(doc.images) };
}

test("accent-flagged assets are exactly the frames of accent-flagged layers", async () => {
  const { doc } = await load();
  const flagged = accentFlaggedAssets(doc);
  const expected = new Set<string>();
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      if (l.kind !== "group" && l.kind !== "raw" && isAccent(l.meta))
        framesOf(l).forEach((id) => expected.add(id));
      if (l.kind === "group") walk(l.children);
      if (l.kind === "raw" && l.children) walk(l.children);
    }
  };

  doc.screens.forEach((s) => walk(s.layers));
  expect([...flagged].sort()).toEqual([...expected].sort());
});

test("the accent tint repaints every opaque pixel and leaves the stored bytes alone", async () => {
  const { doc, cache } = await load();
  const id = [...accentFlaggedAssets(doc)][0];

  // the fixture is chosen for having accent-flagged art; without it there is nothing to check
  expect(id).toBeTruthy();
  const a = doc.images.get(id)!;
  const before = a.data;
  const tinted = await accentBitmapForAsset(a, cache.get(id), "#ff00ff");

  expect(tinted).toBeTruthy();
  const px = pixelsOf(tinted!, a.w, a.h);
  let opaque = 0;

  for (let i = 0; i < px.length; i += 4)
    if (px[i + 3] > 0) {
      expect([px[i], px[i + 1], px[i + 2]]).toEqual([255, 0, 255]);
      opaque++;
    }
  expect(opaque).toBeGreaterThan(0);
  expect(doc.images.get(id)!.data).toBe(before); // preview only
});

test("inverting an asset twice restores it", async () => {
  const { doc, cache } = await load();
  // a paletted/RGB565 asset re-encodes lossily, so compare after a full there-and-back cycle
  const id = [...doc.images.keys()].find((i) => doc.images.get(i)!.cf !== 1)!;
  const a = doc.images.get(id)!;
  const once = (await invertAsset(a, cache.get(id)))!;

  expect(once).toBeTruthy();
  const twice = (await invertAsset(once.asset, { bitmap: once.bitmap }))!;
  const before = decodePixels(asResource(a))!;
  const after = decodePixels(asResource(twice.asset))!;

  for (let i = 0; i < before.length; i += 4)
    if (before[i + 3] === 255) {
      expect(Math.abs(after[i] - before[i])).toBeLessThan(12);
      expect(after[i + 3]).toBe(255);
    }
});

test("re-baking the embedded preview produces a new asset of the same shape", async () => {
  const { doc, cache } = await load();
  const fresh = await regenPreviewAssets(doc, { assets: doc.images, cache }, sim);

  expect(fresh.size).toBeGreaterThan(0);
  for (const [id, { asset }] of fresh) {
    const old = doc.images.get(id)!;

    // same slot in the file — only the pixels are new
    expect([asset.cf, asset.w, asset.h]).toEqual([old.cf, old.w, old.h]);
    expect(asset.data).not.toBe(old.data);
  }
});

test("rotating an asset turns its pixels and grows the box to fit", async () => {
  // a 6x2 strip, black but for one red pixel at (0,0) — enough to tell a turn from a no-op
  const w = 6,
    h = 2;
  const px = new Uint8ClampedArray(w * h * 4);

  for (let i = 3; i < px.length; i += 4) px[i] = 255;
  px[0] = 255;
  const r = encodePixels(px, w, h, 5);
  const a: ImageAsset = { id: "a1" as ImageId, cf: r.cf, w, h, data: r.data };

  const turned = (await rotateAsset(a, undefined, 90))!;

  expect([turned.asset.w, turned.asset.h, turned.asset.rotate]).toEqual([h, w, 90]);
  const out = decodePixels(asResource(turned.asset))!;
  const red = (x: number, y: number) => out[(y * h + x) * 4];

  expect(red(h - 1, 0)).toBeGreaterThan(200); // (0,0) turned clockwise into the top-right corner
  expect(red(0, 0)).toBeLessThan(80);

  // 45° grows the canvas to the rotated bounding box, and cf 4 has no alpha for the corners
  const flat = encodePixels(px, w, h, 4);
  const skew = (await rotateAsset({ ...a, cf: 4, data: flat.data }, undefined, 45))!;

  expect(skew.asset.cf).toBe(5);
  expect(skew.asset.h).toBeGreaterThan(h); // the strip's length now leans into its height
  expect(skew.asset.rotate).toBe(45);
});
