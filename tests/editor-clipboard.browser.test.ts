// Copy/paste over the layer tree. Within one document the copies share the original's assets;
// pasted into a document that was loaded separately they must bring their own, since asset ids
// restart per document and would otherwise land on someone else's pixels.
import { test, expect, vi } from "vitest";
import { buildBin } from "$lib/modules/editor/core/format";
import { assetsOf } from "$lib/modules/editor/core/document/edits";
import { framesOf, toLegacy, type Layer } from "$lib/modules/editor/core/document/doc";
import { accentFlaggedAssets } from "$lib/modules/editor/core/render/pixels";
import { editorModel } from "$lib/modules/editor/model";
import dialUrl from "./__fixtures__/Analog__287__Simple_Dial.bin?url";
import discUrl from "./__fixtures__/Creative__312__Disc.bin?url";
import moodUrl from "./__fixtures__/Default__273__Activity_Mood.bin?url"; // main screen only
import dichotomyUrl from "./__fixtures__/Default__276__Dichotomy.bin?url"; // main only, accent art

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

const file = async (url: string, name: string) =>
  new File([await fetch(url).then((r) => r.arrayBuffer())], name);

/** Import, and wait for the document to take the paste. */
const importBins = (files: File[]) =>
  new Promise<void>((resolve) => {
    const unwatch = editorModel.$doc.updates.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.binsImported(files);
  });

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

test("importing several .bin files pastes every file's layers, each with its own pixels", async () => {
  const files = [await file(dialUrl, "dial.bin"), await file(discUrl, "disc.bin")];
  const assetCount = () => new Set(layers().flatMap((l) => [...assetsOf(l)])).size;

  await load("bins-a", dialUrl);
  const [dialLayers, dialAssets] = [layers().length, assetCount()];

  await load("bins-b", discUrl);
  const [discLayers, discAssets] = [layers().length, assetCount()];

  await load("bins-into", dialUrl);
  const n = layers().length;
  const before = doc().images.size;

  await importBins(files);

  expect(layers().length).toBe(n + dialLayers + discLayers);
  // both files number their assets from i0, so merging them by id would let one file's pixels
  // overwrite the other's — every asset has to arrive under its own fresh id
  expect(doc().images.size).toBe(before + dialAssets + discAssets);
  const frames = layers()
    .slice(n)
    .flatMap((l) => [...assetsOf(l)]);
  const cache = editorModel.$cache.getState();

  expect(frames.every((id) => doc().images.has(id) && Boolean(cache.get(id)?.bitmap))).toBe(true);
  // one import, one undo step
  editorModel.undo();
  expect(layers().length).toBe(n);
});

test("importing on AOD takes each file's AOD layers, or its main ones when it has none", async () => {
  const count = async (url: string, kind: "main" | "aod") => {
    await load(`bins-${kind}`, url);
    return doc().screens.find((s) => s.kind === kind)!.layers.length;
  };
  const [moodMain, discAod] = [await count(moodUrl, "main"), await count(discUrl, "aod")];
  const aod = () => doc().screens.find((s) => s.kind === "aod")!.layers;

  await load("bins-aod", dialUrl);
  editorModel.screenSet("aod");
  const [n, main] = [aod().length, layers().length];

  await importBins([await file(moodUrl, "mood.bin"), await file(discUrl, "disc.bin")]);
  expect(aod().length).toBe(n + moodMain + discAod);
  expect(layers().length).toBe(main);
  editorModel.screenSet("main");
});

test("imported accent-flagged art gets its accent tint", async () => {
  await load("bins-accent", dialUrl);
  editorModel.simPatched({ accentColor: "#ff00ff" });
  const before = new Set(accentFlaggedAssets(doc()));

  await importBins([await file(dichotomyUrl, "dichotomy.bin")]);
  const imported = [...accentFlaggedAssets(doc())].filter((id) => !before.has(id));

  expect(imported.length).toBeGreaterThan(0);
  await vi.waitFor(() =>
    expect(imported.every((id) => editorModel.$cache.getState().get(id)?.accent)).toBe(true),
  );
  editorModel.simPatched({ accentColor: null });
});

test("a file with no screens fails the import with an error that names it", async () => {
  await load("bins-empty", dialUrl);
  const empty = new File([buildBin(toLegacy({ ...doc(), screens: [] })).slice()], "empty.bin");
  const n = layers().length;

  editorModel.errored("");
  editorModel.binsImported([empty]);
  await vi.waitFor(() => expect(editorModel.$err.getState()).toContain("empty.bin"));
  expect(layers().length).toBe(n);
});

test("an import is dropped when the face changes before it lands", async () => {
  await load("bins-stale", dialUrl);
  const n = layers().length;

  const disc = await file(discUrl, "disc.bin");

  editorModel.binsImported([disc]);
  editorModel.select(withFrames().id);
  editorModel.deleteRequested(); // lands while the file is still being parsed
  await vi.waitFor(() => expect(editorModel.$err.getState()).toContain("changed"));
  expect(layers().length).toBe(n - 1);
});
