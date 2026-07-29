// The Doc renderer has to be pixel-identical to the TLV one, or the port silently changes what
// people's faces look like. Every fixture, both screens, at a fixed time so hands don't drift
// between the two renders.
import { test, expect } from "vitest";
import { parseBin, TAG, type Resource } from "$lib/modules/editor/lib/wf";
import { render } from "$lib/modules/editor/lib/render";
import { renderDoc } from "$lib/modules/editor/lib/render-doc";
import { fromLegacy, type ImageCache, type ImageId } from "$lib/modules/editor/lib/doc";
import { bitmapOf } from "$lib/modules/editor/lib/pixels";
import { defaultSim } from "$lib/modules/editor/lib/sources";
import type { ImageStore } from "$lib/modules/editor/lib/canvas";

const FIXTURES = import.meta.glob("./__fixtures__/*.bin", {
  query: "?url",
  import: "default",
  eager: true,
}) as Record<string, string>;

const sim = () => ({
  ...defaultSim(),
  live: false,
  time: new Date("2026-01-09T10:09:30").getTime(),
  showSlotPlaceholders: true,
});

function canvas() {
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  return c;
}

const pixels = (c: HTMLCanvasElement) => c.getContext("2d")!.getImageData(0, 0, 466, 466).data;

test.each(Object.entries(FIXTURES))("%s renders identically through Doc", async (_name, url) => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  const face = parseBin(buf);

  for (const r of face.resources) r.bitmap = await bitmapOf(r);

  const { doc } = fromLegacy(face);
  // the cache is keyed by ImageId and carries exactly what the legacy Resource held
  const cache = new Map<ImageId, ImageCache>();
  const assetsByIndex = [...doc.images.values()];

  assetsByIndex.forEach((a, i) => cache.set(a.id, { bitmap: face.resources[i].bitmap }));
  const store: ImageStore = { assets: doc.images, cache };

  for (const [tag, kind] of [
    [TAG.main, "main"],
    [TAG.aod, "aod"],
  ] as const) {
    if (!face.screens.some((s) => s.tag === tag)) continue;
    const a = canvas();
    const b = canvas();

    render(a.getContext("2d")!, face, tag, sim());
    renderDoc(b.getContext("2d")!, doc, store, kind, sim());

    const pa = pixels(a);
    const pb = pixels(b);
    let diff = 0;

    for (let i = 0; i < pa.length; i += 4) {
      // compare premultiplied-ish: a fully transparent pixel's rgb is don't-care
      if (pa[i + 3] !== pb[i + 3]) diff++;
      else if (
        pa[i + 3] > 0 &&
        (pa[i] !== pb[i] || pa[i + 1] !== pb[i + 1] || pa[i + 2] !== pb[i + 2])
      )
        diff++;
    }
    expect(diff, `${_name} ${kind}: ${diff} differing pixels`).toBe(0);
  }
});

test("a hidden layer is an editor-only concept and never reaches the file", async () => {
  const url = Object.values(FIXTURES)[0];
  const face = parseBin(await fetch(url).then((r) => r.arrayBuffer()));

  for (const r of face.resources) r.bitmap = await bitmapOf(r);
  const { doc } = fromLegacy(face);
  const cache = new Map<ImageId, ImageCache>();

  [...doc.images.values()].forEach((a, i) =>
    cache.set(a.id, { bitmap: (face.resources[i] as Resource).bitmap }),
  );

  const layers = doc.screens[0].layers;
  const hiddenDoc = {
    ...doc,
    screens: [{ ...doc.screens[0], layers: layers.map((l) => ({ ...l, hidden: true })) }],
  };
  const c = canvas();

  renderDoc(c.getContext("2d")!, hiddenDoc, { assets: doc.images, cache }, "main", sim());
  expect(pixels(c).every((v) => v === 0)).toBe(true);
});
