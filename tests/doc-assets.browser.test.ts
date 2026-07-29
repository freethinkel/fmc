// The Doc-side asset helpers have to agree with the Resource ones they replace, or switching
// the model over would quietly change exported pixels.
import { test, expect } from "vitest";
import { parseBin, hex, type Resource } from "$lib/modules/editor/lib/wf";
import {
  accentBitmapFor,
  accentBitmapForAsset,
  accentFlaggedAssets,
  accentFlaggedResources,
  bitmapOf,
  invertAsset,
  invertResource,
  regenPreviewAssets,
  regenPreviews,
} from "$lib/modules/editor/lib/pixels";
import { fromLegacy, type ImageCache, type ImageId } from "$lib/modules/editor/lib/doc";
import { defaultSim } from "$lib/modules/editor/lib/sources";
import url from "./__fixtures__/Multifunction__368__Function.bin?url";

async function load() {
  const face = parseBin(await fetch(url).then((r) => r.arrayBuffer()));

  for (const r of face.resources) r.bitmap = await bitmapOf(r);
  const { doc } = fromLegacy(face);
  const assets = [...doc.images.values()];
  const cache = new Map<ImageId, ImageCache>();

  assets.forEach((a, i) => cache.set(a.id, { bitmap: face.resources[i].bitmap }));
  return { face, doc, assets, cache };
}

test("the accent-flagged set is the same, addressed by id instead of index", async () => {
  const { face, doc, assets } = await load();
  const byIndex = accentFlaggedResources(face);
  const byId = accentFlaggedAssets(doc);

  expect(byId.size).toBe(byIndex.size);
  expect(byId.size).toBeGreaterThan(0); // Function does flag widgets, so this isn't vacuous
  for (const i of byIndex) expect(byId.has(assets[i].id)).toBe(true);
});

test("accent tinting produces the same pixels through either path", async () => {
  const { face, doc, assets, cache } = await load();
  const idx = [...accentFlaggedResources(face)][0];
  const a = assets[idx];

  const viaResource = await accentBitmapFor(face.resources[idx], "#0a84ff");
  const viaAsset = await accentBitmapForAsset(a, cache.get(a.id), "#0a84ff");

  expect(Boolean(viaAsset)).toBe(Boolean(viaResource));
  const read = (b: ImageBitmap) => {
    const c = new OffscreenCanvas(b.width, b.height);

    c.getContext("2d")!.drawImage(b, 0, 0);
    return c.getContext("2d")!.getImageData(0, 0, b.width, b.height).data;
  };

  expect([...read(viaAsset!)]).toEqual([...read(viaResource!)]);
  void doc;
});

test("inverting an asset produces the same bytes as inverting the resource", async () => {
  const { face, assets, cache } = await load();
  const idx = assets.findIndex((a) => a.cf !== 1);
  const a = assets[idx];
  const r: Resource = { ...face.resources[idx] };

  await invertResource(r);
  const once = await invertAsset(a, cache.get(a.id));

  expect(once).not.toBeNull();
  expect(hex(once!.asset.data)).toBe(hex(r.data));

  // Involutive in PIXELS, not in bytes: cf 4 is RGB565, so a second encode requantises and
  // lands a step or two off the original. Compare what's drawn, with room for that rounding.
  const twice = await invertAsset(once!.asset, { bitmap: once!.bitmap });
  const read = (b: ImageBitmap) => {
    const c = new OffscreenCanvas(b.width, b.height);

    c.getContext("2d")!.drawImage(b, 0, 0);
    return c.getContext("2d")!.getImageData(0, 0, b.width, b.height).data;
  };
  const back = read(twice!.bitmap);
  const orig = read(cache.get(a.id)!.bitmap!);
  let worst = 0;

  for (let i = 0; i < orig.length; i++) worst = Math.max(worst, Math.abs(orig[i] - back[i]));
  expect(worst).toBeLessThanOrEqual(8); // one RGB565 step is 8 in the red/blue channels
});

test("regenerated previews match the Resource path", async () => {
  const { face, doc, cache } = await load();
  const sim = { ...defaultSim(), live: false, time: new Date("2026-01-09T10:09:30").getTime() };

  regenPreviews(face, sim);
  const fresh = await regenPreviewAssets(doc, { assets: doc.images, cache }, sim);

  // Function has an embedded 0x28 thumbnail on each screen
  expect(fresh.size).toBeGreaterThan(0);
  const assets = [...doc.images.values()];

  for (const [id, { asset }] of fresh) {
    const idx = assets.findIndex((a) => a.id === id);

    expect(hex(asset.data), `preview ${id}`).toBe(hex(face.resources[idx].data));
  }
});
