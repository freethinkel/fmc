// Web Bluetooth: watch connection and flashing.
import { createEffect, createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import { Watch, type WatchDials, type WatchInfo } from "../lib/ble";
import * as bleApi from "./ble.api";

export type { WatchDials };

let watch: Watch | null = null; // live connection — not serialized, lives outside the store

// ---- stores ----
export const $bleStatus = createStore("");
export const $bleInfo = createStore<WatchInfo | null>(null);
// list of installed watchfaces from a055; the firmware doesn't report our own side-loaded one
export const $dials = createStore<WatchDials | null>(null);
export const $forgetting = bleApi.forgetFx.pending;

// ---- events ----
const statusChanged = createEvent<string>();
const disconnected = createEvent();
const dialsChanged = createEvent<WatchDials>();
export const connectRequested = createEvent();
export const flashRequested = createEvent<Uint8Array>();
// cross-module signal (market.model bumps the download counter on a successful flash) —
// exposed as an event, not the effect itself, so other models react without touching flashFx
export const flashDone = createEvent();
export const forgetRequested = createEvent();

// ---- effects ----
// connectFx/flashFx stay here instead of moving to ble.api.ts: they aren't request/response
// calls, they drive a live connection and push a stream of status/dials events into the model
// mid-flight (via the Watch constructor callback) — an api.ts effect calling model events would
// just invert the dependency, not remove the coupling.
const connectFx = createEffect(async () => {
  const w = new Watch((s: string) => {
    statusChanged(s);
    if (s === "disconnected") {
      watch = null;
      disconnected();
    }
  });

  w.onDials = dialsChanged;
  const info = await w.connect();

  watch = w;
  return info;
});
export const $connecting = connectFx.pending;
const flashFx = createEffect((bin: Uint8Array) => watch!.uploadWatchface(bin));
export const $flashing = flashFx.pending;

// ---- business logic ----
sample({
  clock: statusChanged,
  target: $bleStatus,
});

sample({
  clock: connectFx.failData,
  fn: (e) => `error: ${e.message}`,
  target: statusChanged,
});

sample({
  clock: connectRequested,
  target: connectFx,
});

sample({
  clock: connectFx.doneData,
  target: $bleInfo,
});
reset({ clock: [connectFx, disconnected], target: $bleInfo });

sample({
  clock: dialsChanged,
  target: $dials,
});
reset({ clock: disconnected, target: $dials });

sample({
  clock: flashFx.failData,
  fn: (e) => `error: ${e.message}`,
  target: statusChanged,
});

sample({
  clock: flashRequested,
  target: flashFx,
});

sample({
  clock: flashFx.done,
  fn: () => undefined,
  target: flashDone,
});

sample({
  clock: forgetRequested,
  target: bleApi.forgetFx,
});
sample({
  clock: bleApi.forgetFx.doneData,
  fn: (n) => (n ? `forgot ${n} device(s) — connect to pick again` : "nothing to forget"),
  target: statusChanged,
});
sample({
  clock: bleApi.forgetFx.failData,
  fn: (e) => `error: ${e.message}`,
  target: statusChanged,
});
