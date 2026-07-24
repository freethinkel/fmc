// Web Bluetooth: watch connection and flashing.
import { createEffect, createEvent, createStore, sample } from 'effector';
import { Watch, type WatchDials, type WatchInfo } from '../lib/ble';
import * as bleApi from './ble.api';

export type { WatchDials };

let watch: Watch | null = null; // live connection — not serialized, lives outside the store
const statusChanged = createEvent<string>();
const disconnected = createEvent();
const dialsChanged = createEvent<WatchDials>();

export const $bleStatus = createStore('');
sample({ clock: statusChanged, target: $bleStatus });

// connectFx/flashFx stay here instead of moving to ble.api.ts: they aren't request/response
// calls, they drive a live connection and push a stream of status/dials events into the model
// mid-flight (via the Watch constructor callback) — an api.ts effect calling model events would
// just invert the dependency, not remove the coupling.
const connectFx = createEffect(async () => {
  const w = new Watch((s: string) => {
    statusChanged(s);
    if (s === 'disconnected') { watch = null; disconnected(); }
  });
  w.onDials = dialsChanged;
  const info = await w.connect();
  watch = w;
  return info;
});
sample({ clock: connectFx.failData, fn: e => `error: ${e.message}`, target: statusChanged });

export const connectRequested = createEvent();
sample({ clock: connectRequested, target: connectFx });
export const $connecting = connectFx.pending;

export const $bleInfo = createStore<WatchInfo | null>(null).reset(connectFx, disconnected);
sample({ clock: connectFx.doneData, target: $bleInfo });

// list of installed watchfaces from a055; the firmware doesn't report our own side-loaded one
export const $dials = createStore<WatchDials | null>(null).reset(disconnected);
sample({ clock: dialsChanged, target: $dials });

const flashFx = createEffect((bin: Uint8Array) => watch!.uploadWatchface(bin));
sample({ clock: flashFx.failData, fn: e => `error: ${e.message}`, target: statusChanged });

export const flashRequested = createEvent<Uint8Array>();
sample({ clock: flashRequested, target: flashFx });
export const $flashing = flashFx.pending;
// cross-module signal (market.model bumps the download counter on a successful flash) —
// exposed as an event, not the effect itself, so other models react without touching flashFx
export const flashDone = createEvent();
sample({ clock: flashFx.done, fn: () => undefined, target: flashDone });

export const forgetRequested = createEvent();
sample({ clock: forgetRequested, target: bleApi.forgetFx });
export const $forgetting = bleApi.forgetFx.pending;
sample({
  clock: bleApi.forgetFx.doneData,
  fn: n => (n ? `forgot ${n} device(s) — connect to pick again` : 'nothing to forget'),
  target: statusChanged,
});
sample({ clock: bleApi.forgetFx.failData, fn: e => `error: ${e.message}`, target: statusChanged });
