// What the Doc renderer draws is pinned by editor-preview-match.browser.test.ts, which compares it
// against the preview image baked into each corpus file — a real device screenshot, so it is an
// independent reference rather than a second implementation of the same logic. This file covers
// what that one can't: editor-only render behaviour, and that no screen comes out empty.
import { test, expect } from "vitest";
import { parseBin } from "$lib/modules/editor/core/format";
import { renderDoc } from "$lib/modules/editor/core/render/render";
import { decodeAssets } from "$lib/modules/editor/core/render/pixels";
import { fromLegacy } from "$lib/modules/editor/core/document/doc";
import { defaultSim } from "$lib/modules/editor/core/document/sources";

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

const docOf = async (url: string) => {
  const { doc } = fromLegacy(parseBin(await fetch(url).then((r) => r.arrayBuffer())));

  return { doc, cache: await decodeAssets(doc.images) };
};

test("a hidden layer is an editor-only concept and never reaches the file", async () => {
  const { doc, cache } = await docOf(Object.values(FIXTURES)[0]);
  const layers = doc.screens[0].layers;
  const hiddenDoc = {
    ...doc,
    screens: [{ ...doc.screens[0], layers: layers.map((l) => ({ ...l, hidden: true })) }],
  };
  const c = canvas();

  renderDoc(c.getContext("2d")!, hiddenDoc, { assets: doc.images, cache }, "main", sim());
  expect(pixels(c).every((v) => v === 0)).toBe(true);
});

test.each(Object.entries(FIXTURES))(
  "%s draws something on each of its screens",
  async (name, url) => {
    const { doc, cache } = await docOf(url);
    const store = { assets: doc.images, cache };

    for (const scr of doc.screens) {
      const c = canvas();
      const hits = renderDoc(c.getContext("2d")!, doc, store, scr.kind, sim());

      // a screen that draws no layer at all would mean the converter dropped the whole tree
      expect(hits.length, `${name} ${scr.kind}`).toBeGreaterThan(0);
      expect(
        pixels(c).some((v) => v !== 0),
        `${name} ${scr.kind} came out blank`,
      ).toBe(true);
    }
  },
);
