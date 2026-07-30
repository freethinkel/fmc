// Copy/paste over the layer tree. Within one document the copies share the original's assets;
// pasted into a document that was loaded separately they must bring their own, since asset ids
// restart per document and would otherwise land on someone else's pixels.
import { test, expect } from "vitest";
import { assetsOf } from "$lib/modules/editor/core/document/edits";
import { framesOf, type Layer } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import dialUrl from "./__fixtures__/Analog__287__Simple_Dial.bin?url";
import discUrl from "./__fixtures__/Creative__312__Disc.bin?url";

const doc = () => editorModel.$doc.getState()!;
const layers = () => doc().screens[0].layers;

const load = async (label: string, url: string) => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label });
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
};

/** A layer that actually carries pixels — the interesting case for the asset handling. */
const withFrames = (): Layer => layers().find((l) => framesOf(l).length > 0)!;

test("paste into the same document adds copies that share the original's assets", async () => {
  await load("clip-same", dialUrl);
  const src = withFrames();
  const n = layers().length;
  const assets = doc().images.size;

  editorModel.select(src.id);
  editorModel.copyRequested();
  editorModel.pasteRequested();

  expect(layers().length).toBe(n + 1);
  const copy = layers().at(-1)!;

  expect(copy.id).not.toBe(src.id);
  expect(framesOf(copy)).toEqual(framesOf(src)); // same ids: no pixels were duplicated
  expect(doc().images.size).toBe(assets);
  // and the paste is what's selected, the way it behaves in any editor
  expect(editorModel.$sel.getState()).toBe(copy.id);
});

test("paste carries its assets into a document that doesn't have them", async () => {
  await load("clip-from", dialUrl);
  const src = withFrames();
  const srcAssets = [...assetsOf(src)].map((id) => doc().images.get(id)!);

  editorModel.select(src.id);
  editorModel.copyRequested();

  await load("clip-into", discUrl);
  const n = layers().length;
  const before = doc().images.size;

  editorModel.pasteRequested();

  expect(layers().length).toBe(n + 1);
  const copy = layers().at(-1)!;
  const frames = framesOf(copy);

  // fresh ids in this document, and the pixels came along with them
  expect(doc().images.size).toBe(before + srcAssets.length);
  expect(frames.every((id) => doc().images.has(id))).toBe(true);
  expect(frames.map((id) => doc().images.get(id)!.data)).toEqual(srcAssets.map((a) => a.data));
  // the bitmaps travelled too — a pasted layer that can't be drawn is not much use
  const cache = editorModel.$cache.getState();

  expect(frames.every((id) => Boolean(cache.get(id)?.bitmap))).toBe(true);
});

test("copying multiple layers pastes all of them, selected together", async () => {
  await load("clip-multi", dialUrl);
  const [a, b] = layers()
    .filter((l) => framesOf(l).length > 0)
    .slice(0, 2);
  const n = layers().length;

  editorModel.select(a.id);
  editorModel.selectToggled(b.id);
  editorModel.copyRequested();
  editorModel.pasteRequested();

  expect(layers().length).toBe(n + 2);
  expect(editorModel.$selected.getState()).toHaveLength(2);
  expect(editorModel.$selected.getState().map((l) => l.id)).toEqual(
    layers()
      .slice(-2)
      .map((l) => l.id),
  );
});

test("cut removes the layers and still pastes them back", async () => {
  await load("clip-cut", dialUrl);
  const src = withFrames();
  const n = layers().length;

  editorModel.select(src.id);
  editorModel.cutRequested();
  expect(layers().length).toBe(n - 1);
  expect(layers().some((l) => l.id === src.id)).toBe(false);

  editorModel.pasteRequested();
  expect(layers().length).toBe(n);
  const back = layers().at(-1)!;

  // the clipboard was filled before the delete, so the pixels came back with it
  expect(framesOf(back)).toEqual(framesOf(src));
  expect(framesOf(back).every((id) => doc().images.has(id))).toBe(true);
});
