// Getting documents in and out: opening a .bin, starting a blank face, importing a Facer,
// WatchMaker or Wear OS (.aab) export, and building the bytes back. The assets are re-encoded on the way out only
// (flushAssets), so everything the editor did to the pixels stays non-destructive until export.
import { attach, combine, createEffect, createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import { buildBin, parseBin } from "../core/format";
import { fromLegacy, toLegacy, type Doc, type ImageId } from "../core/document/doc";
import { saveNames, withNames } from "../core/document/names";
import { previewSim } from "../core/document/sources";
import { blankDoc } from "../core/document/factory";
import { decodeAssets, flushAssets, opaqueBlack, regenPreviewAssets } from "../core/render/pixels";
import { renderDoc } from "../core/render/render";
import { PREVIEW, SCREEN } from "../core/render/screen";
import type { ImageCache } from "../core/document/doc";
import { $dirty, $doc, docLoaded } from "./doc.model";
import { $cache, $store } from "./assets.model";
import { $sim } from "./sim.model";
import { errored } from "./ui.model";

// ---- events ----
/** `key` is the marketplace record the bytes came from — what the layer names are stored under.
 *  A face with no record (New, a dropped .bin, an import) keeps its names for the session only. */
export const loadRequested = createEvent<{
  buf: ArrayBuffer | Uint8Array;
  label: string;
  key?: string;
}>();
/** Fired by the market model when the open face gains or loses its record — saving a draft mints
 *  one, New/drag-drop detaches it. */
export const faceKeySet = createEvent<string | null>();
export const newFaceRequested = createEvent<string | void>();
export const importFacerRequested = createEvent<File[]>();
export const exportBin = createEvent();
/** Fired on any successful load — pages that need to react (navigate once the face is ready)
 *  subscribe, others ignore it. */
export const loadDone = createEvent<{ doc: Doc; label: string }>();
/** "Bytes are on their way" — a marketplace open fetches the .bin before it can call
 *  loadRequested, and the editor is already on screen by then. Without this the page looked
 *  idle for the whole download. */
export const bytesAwaited = createEvent();

// ---- stores ----
export const $faceKey = createStore<string | null>(null);
// bytesAwaited until the load they belong to settles — or until the fetch that promised them
// fails, which the caller reports by way of its own error
const $awaitingBytes = createStore(false);

// ---- effects ----
const loadBufferFx = createEffect(
  async ({ buf, label, key }: { buf: ArrayBuffer | Uint8Array; label: string; key?: string }) => {
    const { doc: parsed } = fromLegacy(parseBin(buf));
    const doc = key ? withNames(parsed, key) : parsed;

    return { doc, label, cache: await decodeAssets(doc.images) };
  },
);

const saveNamesFx = createEffect(({ key, doc }: { key: string; doc: Doc }) => saveNames(key, doc));

/** Covers the whole wait, not just the parse: the fetch that precedes it counts too. */
export const $loading = combine(
  loadBufferFx.pending,
  $awaitingBytes,
  (parsing, awaiting) => parsing || awaiting,
);

const newFaceFx = createEffect(async (name: string = "Custom") => {
  const doc = blankDoc(
    name,
    await opaqueBlack(PREVIEW, PREVIEW),
    await opaqueBlack(SCREEN, SCREEN),
  );

  return { doc, label: "new", dirty: true, cache: await decodeAssets(doc.images) };
});

// Facer and WatchMaker exports are both directories and tell each other apart by their manifest;
// a Wear OS bundle is one zip (.aab). No need to make the user pick the format they downloaded —
// and the bundle is sniffed by its magic bytes, because a downloaded one often loses its
// extension on the way (renamed, or unwrapped from a .zip).
const importFacerFx = createEffect(async (files: File[]) => {
  const has = (n: string) => files.some((f) => (f.webkitRelativePath || f.name).endsWith(n));
  const head = files.length === 1 ? new Uint8Array(await files[0].slice(0, 2).arrayBuffer()) : null;
  const aab = head?.[0] === 0x50 && head?.[1] === 0x4b;
  const wm = has("watch.pxml");

  if (aab) {
    const { face } = await (await import("../core/import/wff")).wffToFace(files[0]);
    const { doc } = fromLegacy(face);

    return { doc, label: "wff", dirty: true, cache: await decodeAssets(doc.images) };
  }
  const toFace = wm
    ? (await import("../core/import/watchmaker")).watchmakerToFace
    : (await import("../core/import/facer")).facerToFace;

  if (!wm && !has("watchface.json"))
    throw new Error(
      "not a watchface export: no watchface.json (Facer), watch.pxml (WatchMaker) or .aab bundle",
    );
  const { face } = await toFace(files);
  const { doc } = fromLegacy(face);

  return {
    doc,
    label: wm ? "watchmaker" : "facer",
    dirty: true,
    cache: await decodeAssets(doc.images),
  };
});

/** The bytes, with every resized or adjusted asset re-encoded from its pinned original, and the
 *  embedded 0x28 thumbnails re-baked when the document was edited. Async for exactly that reason. */
const binOf = async ({
  doc,
  cache,
  sim,
  dirty,
}: {
  doc: Doc | null;
  cache: ReadonlyMap<ImageId, ImageCache>;
  sim: Parameters<typeof regenPreviewAssets>[2];
  dirty: boolean;
}) => {
  const images = await flushAssets(doc!.images, cache);
  let next: Doc = { ...doc!, images };

  if (dirty) {
    const fresh = await regenPreviewAssets(next, { assets: images, cache }, previewSim(sim));
    const merged = new Map(images);

    fresh.forEach(({ asset }, id) => merged.set(id, asset));
    next = { ...next, images: merged };
  }
  const out = buildBin(toLegacy(next));

  parseBin(out); // self-check: never hand out bytes we can't read back
  return out;
};

/** The .bin to upload or download. A query, so it stays a callable effect. */
export const buildCurrentBin = attach({
  source: { doc: $doc, cache: $cache, sim: $sim, dirty: $dirty },
  effect: binOf,
});

/** PNG snapshot of the main screen, for marketplace cards. */
export const previewBlob = attach({
  source: { doc: $doc, store: $store, sim: $sim },
  effect({ doc, store, sim }): Promise<Blob> {
    const c = document.createElement("canvas");

    c.width = c.height = SCREEN;
    renderDoc(c.getContext("2d")!, doc!, store, "main", previewSim(sim));
    return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
  },
});

/** Tiny JPEG data URL of the main screen, stored next to the flashed dial id so the watch's
 *  id-only list can show what each slot holds. 96px keeps it around 5 KB. */
export const previewThumb = attach({
  source: { doc: $doc, store: $store, sim: $sim },
  effect({ doc, store, sim }): string {
    const full = document.createElement("canvas");

    full.width = full.height = SCREEN;
    renderDoc(full.getContext("2d")!, doc!, store, "main", previewSim(sim));
    const thumb = document.createElement("canvas");

    thumb.width = thumb.height = 96;
    thumb.getContext("2d")!.drawImage(full, 0, 0, 96, 96);
    return thumb.toDataURL("image/jpeg", 0.7);
  },
});

const exportBinFx = attach({
  source: { doc: $doc, cache: $cache, sim: $sim, dirty: $dirty },
  async effect(s) {
    const out = await binOf(s);
    const a = document.createElement("a");

    a.href = URL.createObjectURL(new Blob([out as BlobPart]));
    a.download = `${s.doc!.name || "watchface"}.bin`;
    a.click();
    URL.revokeObjectURL(a.href);
  },
});

// ---- business logic ----
sample({
  clock: bytesAwaited,
  fn: () => true,
  target: $awaitingBytes,
});
// the load itself takes over from here; errored covers the fetch that never got to call it
reset({ clock: [loadRequested, errored], target: $awaitingBytes });

sample({
  clock: loadRequested,
  target: loadBufferFx,
});
sample({
  clock: loadRequested,
  fn: ({ key }) => key ?? null,
  target: $faceKey,
});
sample({
  clock: faceKeySet,
  target: $faceKey,
});
// Every document change rewrites the name map — it is a handful of strings, and this way a rename
// is stored whether it came from the tree, an undo or a paste. Without a record to key on there
// is nowhere to put it, so the names stay in memory.
sample({
  clock: [$doc.updates, faceKeySet],
  source: { key: $faceKey, doc: $doc },
  filter: ({ key, doc }) => Boolean(key && doc),
  fn: ({ key, doc }) => ({ key: key!, doc: doc! }),
  target: saveNamesFx,
});
sample({
  clock: newFaceRequested,
  fn: (name) => name ?? undefined,
  target: newFaceFx,
});
sample({
  clock: importFacerRequested,
  target: importFacerFx,
});
sample({
  clock: [loadBufferFx.doneData, newFaceFx.doneData, importFacerFx.doneData],
  target: docLoaded,
});
sample({
  clock: [loadBufferFx.doneData, newFaceFx.doneData, importFacerFx.doneData],
  fn: ({ doc, label }) => ({ doc, label }),
  target: loadDone,
});
sample({
  clock: exportBin,
  source: $doc,
  filter: Boolean,
  target: exportBinFx,
});

sample({
  clock: loadBufferFx.fail,
  fn: ({ params, error }) => `${params.label}: ${(error as Error).message}`,
  target: errored,
});
sample({
  clock: [
    newFaceFx.failData,
    importFacerFx.failData,
    exportBinFx.failData,
    buildCurrentBin.failData,
  ],
  fn: (e: Error) => e.message,
  target: errored,
});
