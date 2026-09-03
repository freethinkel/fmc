// What the launch is measured by, in one place.
//
//   face_view      a face's showcase page was opened            { id, name }
//   editor_open    a document was loaded into the editor        { source }
//   import         a Facer/WatchMaker/Wear OS export was read   { format }
//   watch_connect  a watch paired over Web Bluetooth
//   watch_upload   a face was flashed onto the watch — the conversion everything else leads to
//   signup         a new account was created through the register form
//
// Pageviews (path + referrer) are the tracker script's own job, see ../lib/umami.
//
// Every moment above already has an event in the model that owns it, so this file subscribes to
// those rather than scattering track() calls through the feature models: the entire catalogue of
// what FMC reports about its users stays readable on one screen, which is the point of an
// analytics layer you can defend to a privacy-minded audience.
import { createEffect, createEvent, sample } from "effector";
import { authModel } from "$lib/modules/auth/model";
import { bleModel } from "$lib/modules/device/model";
import { editorModel } from "$lib/modules/editor/model";
import { marketModel } from "$lib/modules/market/model";
import { loadTracker, sendEvent } from "../lib/umami";

export type EventName =
  | "face_view"
  | "editor_open"
  | "import"
  | "watch_connect"
  | "watch_upload"
  | "signup";

// ---- events ----
/** Fired once from the root layout — nothing is loaded or sent before it. */
export const started = createEvent();

// ---- effects ----
const initFx = createEffect(loadTracker);
const trackFx = createEffect(
  ({ name, props }: { name: EventName; props?: Record<string, string> }) => sendEvent(name, props),
);

// ---- business logic ----
sample({
  clock: started,
  target: initFx,
});

// the showcase page nulls the store while the next face loads, so only a record is a view
sample({
  clock: marketModel.$watchface.updates,
  filter: Boolean,
  fn: (wf) => ({ name: "face_view" as const, props: { id: wf.id, name: String(wf.name ?? "") } }),
  target: trackFx,
});

// loadDone's label is a filename for a dropped .bin and the face's own name for a marketplace
// open — free-form either way. Fold it into a bounded set: a dashboard breakdown of arbitrary
// filenames is noise, and the filenames are the user's, not ours to collect.
const IMPORTERS: readonly string[] = ["facer", "watchmaker", "wff"];
const sourceOf = (key: string | null, label: string) =>
  key ? "market" : IMPORTERS.includes(label) || label === "new" ? label : "file";

sample({
  clock: editorModel.loadDone,
  source: editorModel.$faceKey,
  fn: (key, { label }) => ({
    name: "editor_open" as const,
    props: { source: sourceOf(key, label) },
  }),
  target: trackFx,
});
sample({
  clock: editorModel.loadDone,
  filter: ({ label }) => IMPORTERS.includes(label),
  fn: ({ label }) => ({ name: "import" as const, props: { format: label } }),
  target: trackFx,
});

// $bleInfo is reset to null on every connect attempt and on disconnect — a record means the
// handshake got all the way through
sample({
  clock: bleModel.$bleInfo.updates,
  filter: Boolean,
  fn: () => ({ name: "watch_connect" as const }),
  target: trackFx,
});
sample({
  clock: bleModel.flashDone,
  fn: () => ({ name: "watch_upload" as const }),
  target: trackFx,
});

// OAuth can't tell a first login from a returning one — the provider call is the same either
// way — so this counts registrations through the form only. See docs/analytics.md.
sample({
  clock: authModel.registered,
  fn: () => ({ name: "signup" as const }),
  target: trackFx,
});
