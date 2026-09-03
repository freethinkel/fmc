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
// installed watchfaces: what a055 reported, plus the ones this browser side-loaded onto this
// watch — the firmware leaves those out of its own list
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
// cross-module signals (market.model bumps the download counter on a successful flash,
// analytics.model counts both) — exposed as events, not the effects themselves, so other models
// react without touching connectFx/flashFx. They carry the connected watch because who it was is
// part of what happened, and $bleInfo is already gone by the time a disconnect is handled.
export const connected = createEvent<WatchInfo>();
export const flashDone = createEvent<WatchInfo | null>();
export const flashFailed = createEvent<{ watch: WatchInfo | null; error: Error }>();
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
    // and the picture are both in hand. The serial goes with them: a055 won't list this dial on
    // the next connection, so this record is what keeps its slot counted (see mergeDials)
    rememberDial(id, name, preview, watch!.serial);
    // …and only now does the merged dial list know about it, so refresh it
    watch!.mergeDials();
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
  target: [$bleInfo, connected],
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
  source: $bleInfo,
  target: flashDone,
});
sample({
  clock: flashFx.failData,
  source: $bleInfo,
  // a full watch isn't a failure either — the slot dialog above turns it into another attempt
  filter: (_watch, e) => !(e instanceof NoFreeSlotError),
  fn: (watch, error) => ({ watch, error }),
  target: flashFailed,
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
