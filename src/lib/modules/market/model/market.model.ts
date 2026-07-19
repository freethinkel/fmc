// Маркетплейс: effector-сторы поверх PocketBase.
import { createEffect, createStore, sample } from 'effector';
import type { RecordModel } from 'pocketbase';
import { pb } from '$lib/shared/api';

export const loadMarketFx = createEffect(async () => {
  const [wf, lk] = await Promise.all([
    // ponytail: one page of 50 + full likes list; paginate when the list outgrows it
    pb.collection('watchfaces').getList(1, 50, { sort: '-created', expand: 'owner' }),
    pb.collection('likes').getFullList(),
  ]);
  return { items: wf.items, likes: lk };
});

export const toggleLikeFx = createEffect(
  async ({ wf, userId }: { wf: RecordModel; userId: string }) => {
    const mine = likes.getState().find(l => l.watchface === wf.id && l.user === userId);
    if (mine) await pb.collection('likes').delete(mine.id);
    else await pb.collection('likes').create({ user: userId, watchface: wf.id });
    return pb.collection('likes').getFullList();
  });

export const removeFx = createEffect((wf: RecordModel) => pb.collection('watchfaces').delete(wf.id));
sample({ clock: removeFx.done, target: loadMarketFx });

export const publishFx = createEffect(
  async ({ name, description, ownerId, bin, preview }: {
    name: string; description: string; ownerId: string; bin: Uint8Array; preview: Blob;
  }) => {
    const fd = new FormData();
    fd.set('name', name);
    fd.set('description', description);
    fd.set('owner', ownerId);
    fd.set('bin', new Blob([bin as BlobPart]), `${name || 'watchface'}.bin`);
    fd.set('preview', preview, 'preview.png');
    await pb.collection('watchfaces').create(fd);
  });

export const items = createStore<RecordModel[]>([]).on(loadMarketFx.doneData, (_, d) => d.items);
export const likes = createStore<RecordModel[]>([])
  .on(loadMarketFx.doneData, (_, d) => d.likes)
  .on(toggleLikeFx.doneData, (_, l) => l);
export const marketErr = createStore('')
  .on([loadMarketFx.failData, toggleLikeFx.failData, removeFx.failData], (_, e) => e.message)
  .reset(loadMarketFx.done);
