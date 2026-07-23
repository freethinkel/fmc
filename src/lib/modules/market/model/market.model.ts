// Маркетплейс: effector-сторы поверх PocketBase.
import { createEffect, createEvent, createStore, sample } from 'effector';
import type { RecordModel } from 'pocketbase';
import { pb } from '$lib/shared/api';
import { bleModel } from '$lib/modules/device/model';

const MAX_BIN = 1048576; // лимит .bin, продублирован в схеме PB

export const loadMarketFx = createEffect(async () => {
  // ponytail: full list, not paginated — catalog + user publishes are a couple hundred
  // records, cheap to fetch whole. getList(1, 50, ...) silently hid everything past the
  // 50 newest (e.g. Creative__312__Disc, ranked #67 by -created) — switch to real
  // pagination if this grows into the thousands.
  const [items, lk] = await Promise.all([
    pb.collection('watchfaces').getFullList({ sort: '-created', expand: 'owner', filter: 'published = true' }),
    pb.collection('likes').getFullList(),
  ]);
  return { items, likes: lk };
});

export const loadMyFx = createEffect((userId: string) =>
  pb.collection('watchfaces').getFullList({ sort: '-updated', filter: `owner = '${userId}'` }));

export const toggleLikeFx = createEffect(
  async ({ wf, userId }: { wf: RecordModel; userId: string }) => {
    const mine = likes.getState().find(l => l.watchface === wf.id && l.user === userId);
    if (mine) await pb.collection('likes').delete(mine.id);
    else await pb.collection('likes').create({ user: userId, watchface: wf.id });
    return pb.collection('likes').getFullList();
  });

export const removeFx = createEffect((wf: RecordModel) => pb.collection('watchfaces').delete(wf.id));
sample({ clock: removeFx.done, target: loadMarketFx });

// циферблат, открытый в редакторе со страниц market/my — Save/Publish обновляют его, а не плодят копии
export const openedWfSet = createEvent<RecordModel | null>();
export const openedWf = createStore<RecordModel | null>(null).on(openedWfSet, (_, wf) => wf);

export interface SavePayload {
  name: string; description?: string; ownerId: string; bin: Uint8Array; preview: Blob; published: boolean;
}

// create или update открытой своей записи; возвращает запись, чтобы след. Save шёл в неё же
export const saveFx = createEffect(async (p: SavePayload) => {
  if (p.bin.length > MAX_BIN)
    throw new Error(`bin is ${(p.bin.length / 1024 / 1024).toFixed(1)} MB — limit is 1 MB`);
  const fd = new FormData();
  fd.set('name', p.name);
  if (p.description !== undefined) fd.set('description', p.description);
  fd.set('owner', p.ownerId);
  fd.set('published', p.published ? 'true' : 'false');
  fd.set('bin', new Blob([p.bin as BlobPart]), `${p.name || 'watchface'}.bin`);
  fd.set('preview', p.preview, 'preview.png');
  const opened = openedWf.getState();
  const col = pb.collection('watchfaces');
  return opened && opened.owner === p.ownerId ? col.update(opened.id, fd) : col.create(fd);
});
sample({ clock: saveFx.doneData, target: openedWfSet });

export const togglePublishFx = createEffect((wf: RecordModel) =>
  pb.collection('watchfaces').update(wf.id, { published: !wf.published }));

// downloads counter also bumps on a successful flash to the watch — no auth check
export const bumpDownloadsFx = createEffect((wfId: string) =>
  pb.send(`/api/wf/${wfId}/bump-downloads`, { method: 'POST' }));
sample({ clock: bleModel.flashFx.done, source: openedWf, filter: Boolean, fn: wf => wf.id, target: bumpDownloadsFx });

export const items = createStore<RecordModel[]>([]).on(loadMarketFx.doneData, (_, d) => d.items);
export const myItems = createStore<RecordModel[]>([])
  .on(loadMyFx.doneData, (_, d) => d)
  .on(togglePublishFx.doneData, (list, r) => list.map(i => (i.id === r.id ? r : i)));
sample({ clock: removeFx.done, source: myItems, fn: (list, { params }) => list.filter(i => i.id !== params.id), target: myItems });

export const likes = createStore<RecordModel[]>([])
  .on(loadMarketFx.doneData, (_, d) => d.likes)
  .on(toggleLikeFx.doneData, (_, l) => l);
export const marketErr = createStore('')
  .on([loadMarketFx.failData, loadMyFx.failData, toggleLikeFx.failData, removeFx.failData, togglePublishFx.failData], (_, e) => e.message)
  .reset(loadMarketFx.done);
