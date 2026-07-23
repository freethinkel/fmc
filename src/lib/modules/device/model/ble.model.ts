// Web Bluetooth: watch connection and flashing.
import { createEffect, createEvent, createStore } from 'effector';
import { Watch, forgetKnownDevices, type WatchDials, type WatchInfo } from '../lib/ble';

export type { WatchDials };

let watch: Watch | null = null; // live connection — not serialized, lives outside the store
const statusChanged = createEvent<string>();
const disconnected = createEvent();
const dialsChanged = createEvent<WatchDials>();

export const bleStatus = createStore('').on(statusChanged, (_, s) => s);

export const connectFx = createEffect(async () => {
  const w = new Watch((s: string) => {
    statusChanged(s);
    if (s === 'disconnected') { watch = null; disconnected(); }
  });
  w.onDials = dialsChanged;
  const info = await w.connect();
  watch = w;
  return info;
});
connectFx.failData.watch(e => statusChanged(`error: ${e.message}`));

export const bleInfo = createStore<WatchInfo | null>(null)
  .on(connectFx.doneData, (_, i) => i)
  .reset(connectFx, disconnected);

// list of installed watchfaces from a055; the firmware doesn't report our own side-loaded one
export const dials = createStore<WatchDials | null>(null)
  .on(dialsChanged, (_, d) => d)
  .reset(disconnected);

export const flashFx = createEffect((bin: Uint8Array) => watch!.uploadWatchface(bin));
flashFx.failData.watch(e => statusChanged(`error: ${e.message}`));

export const forgetFx = createEffect(async () => {
  const n = await forgetKnownDevices();
  statusChanged(n ? `forgot ${n} device(s) — connect to pick again` : 'nothing to forget');
});
forgetFx.failData.watch(e => statusChanged(`error: ${e.message}`));
