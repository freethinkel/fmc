// Web Bluetooth: подключение и прошивка часов.
import { createEffect, createEvent, createStore } from 'effector';
import { Watch, type WatchDials, type WatchInfo } from '../lib/ble';

export type { WatchDials };

let watch: Watch | null = null; // живое соединение — не сериализуется, живёт вне стора
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

// список установленных циферблатов из a055; свои side-loaded прошивка не репортит
export const dials = createStore<WatchDials | null>(null)
  .on(dialsChanged, (_, d) => d)
  .reset(disconnected);

export const flashFx = createEffect((bin: Uint8Array) => watch!.uploadWatchface(bin));
flashFx.failData.watch(e => statusChanged(`error: ${e.message}`));
