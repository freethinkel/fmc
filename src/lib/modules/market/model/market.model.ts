// Marketplace: effector stores on top of PocketBase.
import { attach, createEffect, createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import type { RecordModel } from "pocketbase";
import { goto } from "$app/navigation";
import { fileUrl } from "$lib/shared/api";
import { authModel } from "$lib/modules/auth/model";
import { bleModel } from "$lib/modules/device/model";
import { editorModel } from "$lib/modules/editor/model";
import * as marketApi from "./market.api";

export type { SavePayload } from "./market.api";

// api effects stay private — components only dispatch the *Requested events below

// ---- stores ----
export const $marketLoading = marketApi.loadMarketFx.pending;
export const $myLoading = marketApi.loadMyFx.pending;
export const $removing = marketApi.removeFx.pending;
// watchface opened in the editor from the market/my pages — Save/Publish update it in place instead of spawning copies
export const $openedWf = createStore<RecordModel | null>(null);
// editorModel.loadDone also fires for unrelated loads (drag-drop import on /editor) — only
// navigate when the load we're waiting on is specifically the one editRequested started
const $awaitingEdit = createStore(false);
// editor.svelte's "Save" and PublishDialog's "Publish" both hit saveFx but need different
// done/error handling (Publish also navigates + closes the dialog) and are mounted on the same
// page at the same time — a shared done/err reaction would make one react to the other's call,
// so each gets its own request event and $saveKind picks out which done/failData was whose. All
// of the follow-up (dialog open state, navigation, error banner) lives here, not in components.
const $saveKind = createStore<"draft" | "publish" | null>(null);
export const $publishDialogOpen = createStore(false);
export const $likes = createStore<RecordModel[]>([]);
export const $items = createStore<RecordModel[]>([]);
export const $myItems = createStore<RecordModel[]>([]);
export const $marketErr = createStore("");

// ---- events ----
export const marketLoadRequested = createEvent();
export const myLoadRequested = createEvent<string>();
export const removeRequested = createEvent<RecordModel>();
export const publishToggleRequested = createEvent<RecordModel>();
export const openedWfSet = createEvent<RecordModel | null>();
// "open in editor" from a market/my card: fetch the .bin, hand it to the editor model, then
// navigate once it's actually loaded — used by both pages (market.svelte, my.svelte)
export const editRequested = createEvent<RecordModel>();
export const saveDraftRequested = createEvent<marketApi.SavePayload>();
export const publishRequested = createEvent<marketApi.SavePayload>();
export const publishDialogOpened = createEvent();
export const publishDialogClosed = createEvent();
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

// ---- business logic ----
sample({
  clock: marketLoadRequested,
  target: marketApi.loadMarketFx,
});

sample({
  clock: myLoadRequested,
  target: marketApi.loadMyFx,
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
  clock: editRequested,
  target: openInEditorFx,
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
  fn: ({ wf, buf }) => ({ buf, label: wf.name }),
  target: editorModel.loadRequested,
});

sample({
  clock: openInEditorFx.doneData,
  fn: () => true,
  target: $awaitingEdit,
});
sample({
  clock: editorModel.loadDone,
  source: $awaitingEdit,
  filter: Boolean,
  target: navigateToEditorFx,
});
sample({
  clock: editorModel.loadDone,
  fn: () => false,
  target: $awaitingEdit,
});

sample({
  clock: saveFx.doneData,
  target: openedWfSet,
});

sample({
  clock: saveDraftRequested,
  target: saveFx,
});
sample({
  clock: publishRequested,
  target: saveFx,
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
    toggleLikeFx.failData,
    marketApi.removeFx.failData,
    marketApi.togglePublishFx.failData,
  ],
  fn: (e) => e.message,
  target: $marketErr,
});

// downloads counter also bumps on a successful flash to the watch — no auth check
sample({
  clock: bleModel.flashDone,
  source: $openedWf,
  filter: Boolean,
  fn: (wf) => wf.id,
  target: marketApi.bumpDownloadsFx,
});

reset({ clock: marketApi.loadMarketFx.done, target: $marketErr });
