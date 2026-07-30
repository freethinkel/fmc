// The simulator: the fake watch state the canvas renders against (time, steps, accent colour)
// plus the list of data sources the current document actually reads, which is what the panel
// offers to override.
import { createEvent, createStore, sample } from "effector";
import { collectIdsDoc, defaultSim, type Sim } from "../core/document/sources";
import { $doc } from "./doc.model";

// ---- stores ----
export const $sim = createStore<Sim>(defaultSim());
/** Every data source appearing in the document, with the max its widget declares. */
export const $ids = createStore<{ id: number; max: number }[]>([]);

// ---- events ----
export const simPatched = createEvent<Partial<Sim>>();
export const overrideSet = createEvent<{ id: number; value: number | string }>();

// ---- business logic ----
sample({
  clock: simPatched,
  source: $sim,
  fn: (sim, patch) => ({ ...sim, ...patch }),
  target: $sim,
});
sample({
  clock: overrideSet,
  source: $sim,
  fn: (sim, { id, value }) => ({ ...sim, overrides: { ...sim.overrides, [id]: value } }),
  target: $sim,
});
// the source list follows the document: a new layer can introduce a source, deleting one can
// retire it, so it is recomputed rather than patched at every edit site
sample({
  clock: $doc,
  filter: Boolean,
  fn: collectIdsDoc,
  target: $ids,
});
