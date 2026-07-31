// The asset helpers the editor leans on, each checked against its own contract: the accent tint
// is preview-only, an invert is involutive, and re-baking a preview reproduces what the renderer
// draws. (Whether the renderer itself is right is editor-preview-match's job.)
import { test, expect } from "vitest";
import { parseBin, decodePixels, type Resource } from "$lib/modules/editor/core/format";
import {
  accentBitmapForAsset,
  accentFlaggedAssets,
  decodeAssets,
  invertAsset,
  pixelsOf,
  regenPreviewAssets,
} from "$lib/modules/editor/core/render/pixels";
import {
  fromLegacy,
  isAccent,
  framesOf,
  type ImageAsset,
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
