// Marketplace: effector stores on top of PocketBase.
import { attach, combine, createEffect, createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import type { RecordModel } from "pocketbase";
import { goto } from "$app/navigation";
import { fileUrl } from "$lib/shared/api";
import { authModel } from "$lib/modules/auth/model";
import { bleModel } from "$lib/modules/device/model";
import { editorModel } from "$lib/modules/editor/model";
// The watchface page draws the real dial rather than the still preview, so it needs the editor's
// domain layer (the .bin reader and the renderer's inputs) — not its model, which is the editor's
// own session. Everything the renderer itself needs stays in the component that draws.
import { parseBin } from "$lib/modules/editor/core/format";
import { fromLegacy, type Doc } from "$lib/modules/editor/core/document/doc";
import { decodeAssets } from "$lib/modules/editor/core/render/pixels";
import type { ImageStore } from "$lib/modules/editor/core/render/canvas";
import * as marketApi from "./market.api";

export type { SavePayload } from "./market.api";

// api effects stay private — components only dispatch the *Requested events below

// ---- stores ----
export const $marketLoading = marketApi.loadMarketFx.pending;
export const $myLoading = marketApi.loadMyFx.pending;
export const $removing = marketApi.removeFx.pending;
// watchface opened in the editor from the market/my pages — Save/Publish update it in place instead of spawning copies
export const $openedWf = createStore<RecordModel | null>(null);
// wf record currently loaded in the editor, regardless of owner — narrower than $openedWf
// (which only tracks the caller's OWN record, for save-in-place) wouldn't do: flashing someone
// else's design should still count as a download. Cleared on New/drag-drop import (faceDetached),
// which have no backing record at all.
export const $loadedWf = createStore<RecordModel | null>(null);
// Someone else's (or the stock catalog's) watchface, open in the editor: editing, flashing and
// exporting the .bin are all fine, uploading it under a new owner is not — that's how the
// marketplace filled up with copies of the same dial. Starting from it deliberately still
// works: export the .bin and open that file, which detaches the record (faceDetached).
export const $foreignWf = combine(
  $loadedWf,
  $openedWf,
  (loaded, opened) => Boolean(loaded) && !opened,
);
// editor.svelte's "Save" and PublishDialog's "Publish" both hit saveFx but need different
// done/error handling (Publish also navigates + closes the dialog) and are mounted on the same
// page at the same time — a shared done/err reaction would make one react to the other's call,
// so each gets its own request event and $saveKind picks out which done/failData was whose. All
// of the follow-up (dialog open state, navigation, error banner) lives here, not in components.
const $saveKind = createStore<"draft" | "publish" | null>(null);
export const $publishDialogOpen = createStore(false);
// marketLoadRequested fires on every market.svelte mount — load the catalog once per session,
// a page revisit reuses $items; reloading needs a full page refresh (or removeFx's own reload below)
const $marketRequestedOnce = createStore(false);
// the one being flashed straight from that page, without the editor — the downloads bump
// below reads it first, $loadedWf only ever knows what the editor has open
const $installingWf = createStore<RecordModel | null>(null);
export const $installed = createStore(false);
/** The parsed face behind that page: what the canvas draws, ticking against the real clock. */
export interface LiveFace {
  doc: Doc;
  store: ImageStore;
}
export const $live = createStore<LiveFace | null>(null);
// the same bytes an install sends — fetched once, whichever happens first
const $bin = createStore<Uint8Array | null>(null);
export const $likes = createStore<RecordModel[]>([]);
// the single record behind the showcase page (/market/[id]) — refetched on every mount, so
// it doesn't need patching when downloads/likes move elsewhere
export const $watchface = createStore<RecordModel | null>(null);
export const $watchfaceLoading = marketApi.loadWatchfaceFx.pending;
export const $items = createStore<RecordModel[]>([]);
export const $myItems = createStore<RecordModel[]>([]);
export const $marketErr = createStore("");
// creator profile (/user/[id]) — the viewed user and their published faces
export const $profile = createStore<RecordModel | null>(null);
export const $profileItems = createStore<RecordModel[]>([]);
export const $profileLoading = marketApi.loadProfileFx.pending;

// ---- events ----
export const marketLoadRequested = createEvent();
export const myLoadRequested = createEvent<string>();
// fired by profile.svelte on mount and whenever the id in the url changes
export const profileLoadRequested = createEvent<string>();
export const removeRequested = createEvent<RecordModel>();
export const publishToggleRequested = createEvent<RecordModel>();
export const openedWfSet = createEvent<RecordModel | null>();
// fired by the component on New / drag-drop import — the loaded face has no backing record
export const faceDetached = createEvent();
// "open in editor" from a market/my card or the watchface page: go to the editor at once and
// fetch the .bin behind it, handing the bytes to the editor model when they land
export const editRequested = createEvent<RecordModel>();
// the showcase page: flash the face to the watch without the editor
export const installRequested = createEvent<RecordModel>();
export const saveDraftRequested = createEvent<marketApi.SavePayload>();
export const publishRequested = createEvent<marketApi.SavePayload>();
export const publishDialogOpened = createEvent();
export const publishDialogClosed = createEvent();
// showcase page: load one watchface by id, and open its page from a card
export const watchfaceRequested = createEvent<string>();
export const showcaseRequested = createEvent<RecordModel>();
export const likeToggleRequested = createEvent<{
  wf: RecordModel;
  userId: string;
}>();

// ---- effects ----
const openInEditorFx = createEffect(async (wf: RecordModel) => {
  const buf = await (await fetch(fileUrl(wf, "bin"))).arrayBuffer();

  return { wf, buf };
});
const navigateToEditorFx = createEffect(() => goto("/editor"));
const binOfFx = createEffect(
  async (wf: RecordModel) => new Uint8Array(await (await fetch(fileUrl(wf, "bin"))).arrayBuffer()),
);
// the still preview is a fallback, not the plan: parse the file and hand the renderer the same
// two things the editor gives it — the document and its decoded pixels
const liveFx = createEffect(async (bin: Uint8Array): Promise<LiveFace> => {
  const { doc } = fromLegacy(parseBin(bin));

  return { doc, store: { assets: doc.images, cache: await decodeAssets(doc.images) } };
});
// install from the watchface page: the .bin is all the watch needs, the editor never enters it
const fetchBinFx = attach({
  source: $bin,
  async effect(cached, wf: RecordModel) {
    return {
      bin: cached ?? (await binOfFx(wf)),
      // the watch reports ids only — the market preview is what makes it recognisable later
      preview: fileUrl(wf, "preview"),
      key: wf.id,
    };
  },
});
export const $installing = combine(
  fetchBinFx.pending,
  bleModel.$flashing,
  (fetching, flashing) => fetching || flashing,
);
// resolves openedId from $openedWf so the api layer doesn't need to know about model state
const saveFx = attach({
  source: $openedWf,
  effect: marketApi.saveFx,
  mapParams: (p: marketApi.SavePayload, opened) => ({
    ...p,
    openedId: opened && opened.owner === p.ownerId ? opened.id : undefined,
  }),
});
export const $savePending = saveFx.pending;
const navigateToMarketFx = createEffect(() => goto("/market"));
const navigateToShowcaseFx = createEffect((wf: RecordModel) => goto(`/market/${wf.id}`));
// resolves the caller's existing like id from $likes so the api layer doesn't need to know about model state
const toggleLikeFx = attach({
  source: $likes,
  effect: marketApi.toggleLikeFx,
  mapParams: ({ wf, userId }: { wf: RecordModel; userId: string }, likes) => ({
    wf,
    userId,
    mineId: likes.find((l) => l.watchface === wf.id && l.user === userId)?.id,
  }),
});

// bumpDownloadsFx.done only carries back {} — patch the count locally on every successful
// flash instead of waiting for a refetch (market list loads once per session, see above)
const bumpDownloads = (list: RecordModel[], wfId: string) =>
  list.map((i) => (i.id === wfId ? { ...i, downloads: (i.downloads || 0) + 1 } : i));

// ---- business logic ----
sample({
  clock: marketLoadRequested,
  source: $marketRequestedOnce,
  filter: (requested) => !requested,
  target: marketApi.loadMarketFx,
});
sample({
  clock: marketLoadRequested,
  fn: () => true,
  target: $marketRequestedOnce,
});

sample({
  clock: myLoadRequested,
  target: marketApi.loadMyFx,
});

sample({
  clock: profileLoadRequested,
  target: marketApi.loadProfileFx,
});
sample({
  clock: marketApi.loadProfileFx.doneData,
  fn: (d) => d.user,
  target: $profile,
});
sample({
  clock: marketApi.loadProfileFx.doneData,
  fn: (d) => d.items,
  target: $profileItems,
});
sample({
  clock: marketApi.loadProfileFx.doneData,
  fn: (d) => d.likes,
  target: $likes,
});
// don't let the previous creator's name and grid sit on screen while the next one loads
reset({ clock: profileLoadRequested, target: [$profile, $profileItems] });

sample({
  clock: showcaseRequested,
  target: navigateToShowcaseFx,
});

sample({
  clock: watchfaceRequested,
  target: marketApi.loadWatchfaceFx,
});
// drop the previous record while the new one loads — otherwise navigating from one showcase
// page to another shows the old face under the new id
sample({
  clock: watchfaceRequested,
  fn: () => null,
  target: $watchface,
});
sample({
  clock: marketApi.loadWatchfaceFx.doneData,
  fn: ({ wf }) => wf,
  target: $watchface,
});
// fold this face's likes into the shared list, so the showcase page counts and toggles them
// with the same $likes/likeToggleRequested the grid uses
sample({
  clock: marketApi.loadWatchfaceFx.doneData,
  source: $likes,
  fn: (all, { wf, likes }) => [...all.filter((l) => l.watchface !== wf.id), ...likes],
  target: $likes,
});

sample({
  clock: removeRequested,
  target: marketApi.removeFx,
});
sample({
  clock: marketApi.removeFx.done,
  target: marketApi.loadMarketFx,
});

sample({
  clock: publishToggleRequested,
  target: marketApi.togglePublishFx,
});

sample({
  clock: openedWfSet,
  target: $openedWf,
});

sample({
  clock: faceDetached,
  fn: () => null,
  target: [$openedWf, $loadedWf, $installingWf, editorModel.faceKeySet],
});

// a different face on screen than the one that was just installed
reset({ clock: watchfaceRequested, target: [$installed, $live, $bin] });

// the page draws the dial for real: fetch the file, parse it, decode its pixels
sample({
  clock: marketApi.loadWatchfaceFx.doneData,
  fn: ({ wf }) => wf,
  target: binOfFx,
});
sample({
  clock: binOfFx.doneData,
  target: [$bin, liveFx],
});
sample({
  clock: liveFx.doneData,
  target: $live,
});
// a file we can't parse or decode isn't worth an error banner — the still preview stays up,
// and everything else on the page (install included) works off the bytes regardless

sample({
  clock: installRequested,
  target: [fetchBinFx, $installingWf],
});
sample({
  clock: fetchBinFx.doneData,
  target: bleModel.flashRequested,
});
sample({
  clock: bleModel.flashDone,
  source: $installingWf,
  filter: Boolean,
  fn: () => true,
  target: $installed,
});
reset({ clock: installRequested, target: $installed });
// whichever of the two acted last owns the flash: opening a face in the editor hands the
// downloads bump back to $loadedWf
sample({
  clock: openInEditorFx.doneData,
  fn: () => null,
  target: $installingWf,
});

// Open the editor first and let it show its own loading state: the .bin is a megabyte over the
// network, and waiting for it on the page the user just left off reads as a frozen site.
sample({
  clock: editRequested,
  target: [openInEditorFx, navigateToEditorFx, editorModel.bytesAwaited],
});
sample({
  clock: openInEditorFx.failData,
  fn: (e) => e.message,
  target: editorModel.errored,
});

sample({
  clock: openInEditorFx.doneData,
  source: authModel.$user,
  fn: (user, { wf }) => (user && wf.owner === user.id ? wf : null),
  target: openedWfSet,
});
sample({
  clock: openInEditorFx.doneData,
  fn: ({ wf }) => wf,
  target: $loadedWf,
});
// the record id doubles as the key the editor stores this face's layer names under
sample({
  clock: openInEditorFx.doneData,
  fn: ({ wf, buf }) => ({ buf, label: wf.name, key: wf.id }),
  target: editorModel.loadRequested,
});

sample({
  clock: saveFx.doneData,
  target: openedWfSet,
});
sample({
  clock: saveFx.doneData,
  target: $loadedWf,
});
// the first save mints the record — from here on the names have somewhere to live
sample({
  clock: saveFx.doneData,
  fn: (wf) => wf.id,
  target: editorModel.faceKeySet,
});
// Saving replaces the record's bin AND its preview file, so the cached catalog lists would
// keep showing the old art (and old name) until a full page reload — $items is only fetched
// once per session on purpose. Patch the saved record in wherever it already is.
const replaceSaved = (list: RecordModel[], r: RecordModel) =>
  list.map((i) => (i.id === r.id ? r : i));

sample({
  clock: saveFx.doneData,
  source: $items,
  fn: replaceSaved,
  target: $items,
});
sample({
  clock: saveFx.doneData,
  source: $myItems,
  fn: replaceSaved,
  target: $myItems,
});

// the two buttons are disabled for a foreign face (see $foreignWf), but the rule lives here —
// a component can't be the thing that enforces it. A dropped save says so instead of looking
// like a dead button: silently swallowing the click is how "it just doesn't save" bugs start.
sample({
  clock: [saveDraftRequested, publishRequested],
  source: $foreignWf,
  filter: (foreign) => !foreign,
  fn: (_foreign, p) => p,
  target: saveFx,
});
sample({
  clock: [saveDraftRequested, publishRequested],
  source: $foreignWf,
  filter: Boolean,
  fn: () => "this watchface belongs to someone else — export the .bin to start your own from it",
  target: editorModel.errored,
});

sample({
  clock: saveDraftRequested,
  fn: () => "draft" as const,
  target: $saveKind,
});
sample({
  clock: publishRequested,
  fn: () => "publish" as const,
  target: $saveKind,
});

sample({
  clock: saveFx.failData,
  source: $saveKind,
  filter: (k) => k === "draft",
  fn: (_k, e) => `save: ${e.message}`,
  target: editorModel.errored,
});

sample({
  clock: publishDialogOpened,
  fn: () => true,
  target: $publishDialogOpen,
});

sample({
  clock: publishDialogClosed,
  fn: () => false,
  target: $publishDialogOpen,
});

sample({
  clock: saveFx.done,
  source: $saveKind,
  filter: (k) => k === "publish",
  fn: () => false,
  target: $publishDialogOpen,
});

sample({
  clock: saveFx.failData,
  source: $saveKind,
  filter: (k) => k === "publish",
  fn: () => false,
  target: $publishDialogOpen,
});

sample({
  clock: saveFx.failData,
  source: $saveKind,
  filter: (k) => k === "publish",
  fn: (_k, e) => `publish: ${e.message}`,
  target: editorModel.errored,
});

sample({
  clock: saveFx.done,
  source: $saveKind,
  filter: (k) => k === "publish",
  target: navigateToMarketFx,
});

sample({
  clock: marketApi.loadMarketFx.doneData,
  fn: (d) => d.likes,
  target: $likes,
});

sample({
  clock: toggleLikeFx.doneData,
  target: $likes,
});

sample({
  clock: likeToggleRequested,
  target: toggleLikeFx,
});

sample({
  clock: marketApi.loadMarketFx.doneData,
  fn: (d) => d.items,
  target: $items,
});

sample({
  clock: marketApi.loadMyFx.doneData,
  target: $myItems,
});

sample({
  clock: marketApi.togglePublishFx.doneData,
  source: $myItems,
  fn: (list, r) => list.map((i) => (i.id === r.id ? r : i)),
  target: $myItems,
});

sample({
  clock: marketApi.removeFx.done,
  source: $myItems,
  fn: (list, { params }) => list.filter((i) => i.id !== params.id),
  target: $myItems,
});

sample({
  clock: [
    marketApi.loadMarketFx.failData,
    marketApi.loadMyFx.failData,
    marketApi.loadProfileFx.failData,
    marketApi.loadWatchfaceFx.failData,
    fetchBinFx.failData,
    toggleLikeFx.failData,
    marketApi.removeFx.failData,
    marketApi.togglePublishFx.failData,
  ],
  // ClientResponseError.isAbort — the SDK auto-cancels a request when an identical one is
  // fired (same collection+params), so the "loser" is never a real failure: a newer identical
  // request is already in flight. Nothing to show the user.
  filter: (e) => !(e as { isAbort?: boolean }).isAbort,
  fn: (e) => e.message,
  target: $marketErr,
});

// downloads counter also bumps on a successful flash to the watch — no auth check, own or not
sample({
  clock: bleModel.flashDone,
  source: combine($installingWf, $loadedWf, (installing, loaded) => installing || loaded),
  filter: Boolean,
  fn: (wf) => wf.id,
  target: marketApi.bumpDownloadsFx,
});
sample({
  clock: marketApi.bumpDownloadsFx.done,
  source: $items,
  fn: (list, { params: wfId }) => bumpDownloads(list, wfId),
  target: $items,
});
sample({
  clock: marketApi.bumpDownloadsFx.done,
  source: $myItems,
  fn: (list, { params: wfId }) => bumpDownloads(list, wfId),
  target: $myItems,
});
sample({
  clock: marketApi.bumpDownloadsFx.done,
  source: $watchface,
  filter: (wf, { params: wfId }) => wf?.id === wfId,
  fn: (wf, _p) => ({ ...wf!, downloads: (wf!.downloads || 0) + 1 }),
  target: $watchface,
});

// any successful load clears the banner — otherwise a one-off failure (or a request the SDK
// auto-cancelled) stayed on screen for the rest of the session, /my never reset it at all
reset({
  clock: [
    marketApi.loadMarketFx.done,
    marketApi.loadMyFx.done,
    marketApi.loadProfileFx.done,
    marketApi.loadWatchfaceFx.done,
  ],
  target: $marketErr,
});
