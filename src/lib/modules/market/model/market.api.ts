// Marketplace: PocketBase API effects.
import { createEffect } from 'effector';
import type { RecordModel } from 'pocketbase';
import { pb } from '$lib/shared/api';

const MAX_BIN = 1048576; // .bin limit, duplicated in the PB schema

export const loadMarketFx = createEffect(async () => {
  // ponytail: full list, not paginated — catalog + user publishes are a couple hundred
  // records, cheap to fetch whole. getList(1, 50, ...) silently hid everything past the
  // 50 newest (e.g. Creative__312__Disc, ranked #67 by -created) — switch to real
  // pagination if this grows into the thousands.
  const [items, likes] = await Promise.all([
    pb.collection('watchfaces').getFullList({ sort: '-created', expand: 'owner', filter: 'published = true' }),
    pb.collection('likes').getFullList(),
  ]);
  return { items, likes };
});

export const loadMyFx = createEffect((userId: string) =>
  pb.collection('watchfaces').getFullList({ sort: '-updated', filter: `owner = '${userId}'` }));

// mineId — id of the caller's existing like, resolved by the model from $likes (attach())
export const toggleLikeFx = createEffect(
  async ({ wf, userId, mineId }: { wf: RecordModel; userId: string; mineId?: string }) => {
    if (mineId) await pb.collection('likes').delete(mineId);
    else await pb.collection('likes').create({ user: userId, watchface: wf.id });
    return pb.collection('likes').getFullList();
  });

export const removeFx = createEffect((wf: RecordModel) => pb.collection('watchfaces').delete(wf.id));

export interface SavePayload {
  name: string; description?: string; ownerId: string; bin: Uint8Array; preview: Blob; published: boolean;
}

// openedId — id of the currently-open own record to update in place, resolved by the model
// from $openedWf (attach()); undefined creates a new record
export const saveFx = createEffect(async (p: SavePayload & { openedId?: string }) => {
  if (p.bin.length > MAX_BIN)
    throw new Error(`bin is ${(p.bin.length / 1024 / 1024).toFixed(1)} MB — limit is 1 MB`);
  const fd = new FormData();
  fd.set('name', p.name);
  if (p.description !== undefined) fd.set('description', p.description);
  fd.set('owner', p.ownerId);
  fd.set('published', p.published ? 'true' : 'false');
  fd.set('bin', new Blob([p.bin as BlobPart]), `${p.name || 'watchface'}.bin`);
  fd.set('preview', p.preview, 'preview.png');
  const col = pb.collection('watchfaces');
  return p.openedId ? col.update(p.openedId, fd) : col.create(fd);
});

export const togglePublishFx = createEffect((wf: RecordModel) =>
  pb.collection('watchfaces').update(wf.id, { published: !wf.published }));

// downloads counter also bumps on a successful flash to the watch — no auth check
export const bumpDownloadsFx = createEffect((wfId: string) =>
  pb.send(`/api/wf/${wfId}/bump-downloads`, { method: 'POST' }));
