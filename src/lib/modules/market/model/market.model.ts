// Marketplace: effector stores on top of PocketBase.
import { attach, createEffect, createEvent, createStore, sample } from 'effector';
import type { RecordModel } from 'pocketbase';
import { goto } from '$app/navigation';
import { fileUrl } from '$lib/shared/api';
import { authModel } from '$lib/modules/auth/model';
import { bleModel } from '$lib/modules/device/model';
import { editorModel } from '$lib/modules/editor/model';
import * as marketApi from './market.api';

export type { SavePayload } from './market.api';

// api effects stay private — components only dispatch the *Requested events below

export const marketLoadRequested = createEvent();
sample({ clock: marketLoadRequested, target: marketApi.loadMarketFx });
export const $marketLoading = marketApi.loadMarketFx.pending;

export const myLoadRequested = createEvent<string>();
sample({ clock: myLoadRequested, target: marketApi.loadMyFx });
export const $myLoading = marketApi.loadMyFx.pending;

export const removeRequested = createEvent<RecordModel>();
sample({ clock: removeRequested, target: marketApi.removeFx });
export const $removing = marketApi.removeFx.pending;
sample({ clock: marketApi.removeFx.done, target: marketApi.loadMarketFx });

export const publishToggleRequested = createEvent<RecordModel>();
sample({ clock: publishToggleRequested, target: marketApi.togglePublishFx });

// watchface opened in the editor from the market/my pages — Save/Publish update it in place instead of spawning copies
export const openedWfSet = createEvent<RecordModel | null>();
export const $openedWf = createStore<RecordModel | null>(null);
sample({ clock: openedWfSet, target: $openedWf });

// "open in editor" from a market/my card: fetch the .bin, hand it to the editor model, then
// navigate once it's actually loaded — used by both pages (market.svelte, my.svelte)
export const editRequested = createEvent<RecordModel>();
const openInEditorFx = createEffect(async (wf: RecordModel) => {
  const buf = await (await fetch(fileUrl(wf, 'bin'))).arrayBuffer();
  return { wf, buf };
});
sample({ clock: editRequested, target: openInEditorFx });
sample({ clock: openInEditorFx.failData, fn: e => e.message, target: editorModel.errored });

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

// editorModel.loadDone also fires for unrelated loads (drag-drop import on /editor) — only
// navigate when the load we're waiting on is specifically the one editRequested started
const $awaitingEdit = createStore(false);
sample({ clock: openInEditorFx.doneData, fn: () => true, target: $awaitingEdit });
const navigateToEditorFx = createEffect(() => goto('/editor'));
sample({ clock: editorModel.loadDone, source: $awaitingEdit, filter: Boolean, target: navigateToEditorFx });
sample({ clock: editorModel.loadDone, fn: () => false, target: $awaitingEdit });

// resolves openedId from $openedWf so the api layer doesn't need to know about model state
const saveFx = attach({
  source: $openedWf,
  effect: marketApi.saveFx,
  mapParams: (p: marketApi.SavePayload, opened) => ({
    ...p, openedId: opened && opened.owner === p.ownerId ? opened.id : undefined,
  }),
});
sample({ clock: saveFx.doneData, target: openedWfSet });
export const $savePending = saveFx.pending;

// editor.svelte's "Save" and PublishDialog's "Publish" both hit saveFx but need different
// done/error handling (Publish also navigates + closes the dialog) and are mounted on the same
// page at the same time — a shared done/err reaction would make one react to the other's call,
// so each gets its own request event and $saveKind picks out which done/failData was whose. All
// of the follow-up (dialog open state, navigation, error banner) lives here, not in components.
export const saveDraftRequested = createEvent<marketApi.SavePayload>();
export const publishRequested = createEvent<marketApi.SavePayload>();
sample({ clock: saveDraftRequested, target: saveFx });
sample({ clock: publishRequested, target: saveFx });

const $saveKind = createStore<'draft' | 'publish' | null>(null);
sample({ clock: saveDraftRequested, fn: () => 'draft' as const, target: $saveKind });
sample({ clock: publishRequested, fn: () => 'publish' as const, target: $saveKind });

sample({
  clock: saveFx.failData, source: $saveKind, filter: k => k === 'draft',
  fn: (_k, e) => `save: ${e.message}`, target: editorModel.errored,
});

export const $publishDialogOpen = createStore(false);
export const publishDialogOpened = createEvent();
export const publishDialogClosed = createEvent();
sample({ clock: publishDialogOpened, fn: () => true, target: $publishDialogOpen });
sample({ clock: publishDialogClosed, fn: () => false, target: $publishDialogOpen });
sample({
  clock: saveFx.done, source: $saveKind, filter: k => k === 'publish',
  fn: () => false, target: $publishDialogOpen,
});
sample({
  clock: saveFx.failData, source: $saveKind, filter: k => k === 'publish',
  fn: () => false, target: $publishDialogOpen,
});
sample({
  clock: saveFx.failData, source: $saveKind, filter: k => k === 'publish',
  fn: (_k, e) => `publish: ${e.message}`, target: editorModel.errored,
});
const navigateToMarketFx = createEffect(() => goto('/market'));
sample({ clock: saveFx.done, source: $saveKind, filter: k => k === 'publish', target: navigateToMarketFx });

export const $likes = createStore<RecordModel[]>([]);
sample({ clock: marketApi.loadMarketFx.doneData, fn: d => d.likes, target: $likes });

// resolves the caller's existing like id from $likes so the api layer doesn't need to know about model state
const toggleLikeFx = attach({
  source: $likes,
  effect: marketApi.toggleLikeFx,
  mapParams: ({ wf, userId }: { wf: RecordModel; userId: string }, likes) => ({
    wf, userId, mineId: likes.find(l => l.watchface === wf.id && l.user === userId)?.id,
  }),
});
sample({ clock: toggleLikeFx.doneData, target: $likes });

export const likeToggleRequested = createEvent<{ wf: RecordModel; userId: string }>();
sample({ clock: likeToggleRequested, target: toggleLikeFx });

export const $items = createStore<RecordModel[]>([]);
sample({ clock: marketApi.loadMarketFx.doneData, fn: d => d.items, target: $items });

export const $myItems = createStore<RecordModel[]>([]);
sample({ clock: marketApi.loadMyFx.doneData, target: $myItems });
sample({
  clock: marketApi.togglePublishFx.doneData,
  source: $myItems,
  fn: (list, r) => list.map(i => (i.id === r.id ? r : i)),
  target: $myItems,
});
sample({
  clock: marketApi.removeFx.done,
  source: $myItems,
  fn: (list, { params }) => list.filter(i => i.id !== params.id),
  target: $myItems,
});

export const $marketErr = createStore('').reset(marketApi.loadMarketFx.done);
sample({
  clock: [
    marketApi.loadMarketFx.failData, marketApi.loadMyFx.failData, toggleLikeFx.failData,
    marketApi.removeFx.failData, marketApi.togglePublishFx.failData,
  ],
  fn: e => e.message,
  target: $marketErr,
});

// downloads counter also bumps on a successful flash to the watch — no auth check
sample({
  clock: bleModel.flashDone, source: $openedWf, filter: Boolean,
  fn: wf => wf.id, target: marketApi.bumpDownloadsFx,
});
