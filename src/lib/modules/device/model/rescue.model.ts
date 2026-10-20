// The /rescue page: a watch that is alive on Bluetooth but stuck on a black screen after a bad
// face gets one command — factory reset — the moment auth completes. Nothing else is asked of
// it, because a wedged firmware may never answer the usual info/dial-list exchange.
import { createEffect, createEvent, createStore, sample } from "effector";
import { Watch } from "../lib/ble";
import { dbgListeners } from "../lib/ble-protocol";

export const resetRequested = createEvent();
export const $status = createStore("");
export const $error = createStore<string | null>(null);
export const $done = createStore(false);
// everything ble.ts logged during the attempt, for the user to paste into an issue
export const $log = createStore<string[]>([]);

const statusChanged = createEvent<string>();
const logged = createEvent<string>();
const resetFx = createEffect(async () => {
  const w = new Watch((s: string) => statusChanged(s));

  dbgListeners.add(logged);
  try {
    await w.connect({ rescue: true });
    statusChanged("sending factory reset…");
    await w.factoryReset();
  } finally {
    dbgListeners.delete(logged);
  }
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
$log
  .on(resetRequested, () => [])
  .on(logged, (log, line) => [...log, line])
  .on(resetFx.failData, (log, e) => [...log, `error: ${e.message}`]);
