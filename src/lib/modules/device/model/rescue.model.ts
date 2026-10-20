// The /rescue page: a watch that is alive on Bluetooth but stuck on a black screen after a bad
// face gets one command — factory reset — the moment auth completes. Nothing else is asked of
// it, because a wedged firmware may never answer the usual info/dial-list exchange.
import { createEffect, createEvent, createStore, sample } from "effector";
import { Watch } from "../lib/ble";

export const resetRequested = createEvent();
export const $status = createStore("");
export const $error = createStore<string | null>(null);
export const $done = createStore(false);

const statusChanged = createEvent<string>();
const resetFx = createEffect(async () => {
  const w = new Watch((s: string) => statusChanged(s));

  await w.connect({ rescue: true });
  statusChanged("sending factory reset…");
  await w.factoryReset();
});

export const $busy = resetFx.pending;

sample({
  clock: resetRequested,
  target: resetFx,
});
sample({
  clock: statusChanged,
  target: $status,
});
$error.on(resetRequested, () => null).on(resetFx.failData, (_, e) => e.message);
$done.on(resetRequested, () => false).on(resetFx.done, () => true);
