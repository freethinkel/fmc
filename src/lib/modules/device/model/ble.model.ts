// Web Bluetooth: watch connection and flashing.
import { createEffect, createEvent, createStore, sample } from "effector";
import { reset } from "patronum";
import { NoFreeSlotError, Watch, type WatchDials, type WatchInfo } from "../lib/ble";
import { rememberDial } from "../lib/catalog-names";
import * as bleApi from "./ble.api";

// what a flash needs: the file, a thumbnail of the face so the watch's id list can show it
// later (the file itself never reaches catalog-names), and a key identifying the face across
// flashes — a marketplace record id, falling back to the name inside the file
export interface FlashPayload {
  bin: Uint8Array;
  preview?: string;
  key?: string;
}

export type { WatchDials };

let watch: Watch | null = null; // live connection — not serialized, lives outside the store

// ---- stores ----
export const $bleStatus = createStore("");
export const $bleInfo = createStore<WatchInfo | null>(null);
// list of installed watchfaces from a055; the firmware doesn't report our own side-loaded one
export const $dials = createStore<WatchDials | null>(null);
// a flash appends into a free slot; when the watch has none, the file waits here while the
// user picks which dial to overwrite in the slot dialog
export const $slotDialogOpen = createStore(false);
const $pendingBin = createStore<FlashPayload | null>(null);
export const $forgetting = bleApi.forgetFx.pending;

// ---- events ----
const statusChanged = createEvent<string>();
const disconnected = createEvent();
const dialsChanged = createEvent<WatchDials>();
export const connectRequested = createEvent();
export const flashRequested = createEvent<FlashPayload>();
export const slotPicked = createEvent<number>();
export const slotDialogClosed = createEvent();
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
  // console hook for inspecting a live connection (installedWf, codec, chars). Read-only in
  // spirit: sending hand-built commands from here is what bricked a watch once, see ble.ts
  (window as { fmcWatch?: Watch }).fmcWatch = w;
  return info;
});
export const $connecting = connectFx.pending;
const flashFx = createEffect(
  async ({ bin, preview, key, slot }: FlashPayload & { slot?: number }) => {
    const { id, name } = await watch!.uploadWatchface(bin, slot, key);

    // the watch will only ever report this dial by its id — this is the one moment the name
    // and the picture are both in hand
    rememberDial(id, name, preview);
    return id;
  },
);
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
  // a full watch isn't an error — the slot dialog handles it below
  filter: (e) => !(e instanceof NoFreeSlotError),
  fn: (e) => `error: ${e.message}`,
  target: statusChanged,
});

// flash appends into a free slot…
sample({
  clock: flashRequested,
  target: $pendingBin,
});
sample({
  clock: flashRequested,
  target: flashFx,
});
// …and only when the watch has none does it ask which dial to overwrite
sample({
  clock: flashFx.failData,
  filter: (e) => e instanceof NoFreeSlotError,
  fn: () => true,
  target: $slotDialogOpen,
});
sample({
  clock: slotPicked,
  source: $pendingBin,
  filter: Boolean,
  fn: (pending, slot) => ({ ...pending, slot }),
  target: flashFx,
});
reset({
  clock: [slotPicked, slotDialogClosed, flashFx.done, disconnected],
  target: $slotDialogOpen,
});
// the bin outlives the dialog on purpose — slotPicked re-runs flashFx with it
reset({ clock: [slotDialogClosed, flashFx.done, disconnected], target: $pendingBin });

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
