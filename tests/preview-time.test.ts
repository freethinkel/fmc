// Previews must be a function of the face alone: whatever the editor's simulator is showing —
// and it defaults to the live clock — a preview always renders the same pose.
import { test, expect } from "vitest";
import {
  defaultSim,
  idValue,
  previewSim,
  timeParts,
} from "../src/lib/modules/editor/core/document/sources";

test("previewSim pins the clock, keeping the rest of the simulator", () => {
  const sim = { ...defaultSim(), steps: 4242 };

  expect(sim.live).toBe(true); // the editor canvas follows the real time
  expect(timeParts(previewSim(sim))).toEqual({ h: 10, m: 9, s: 36, day: 8, wd: 1, mon: 1 });
  expect(previewSim(sim).steps).toBe(4242);
});

test("previewSim drops the editing aids that would leak into a published preview", () => {
  const sim = {
    ...defaultSim(),
    is24h: false,
    showSlotPlaceholders: true,
    overrides: { 0x01: 3 }, // a pinned hour — SimPanel offers the same for a hand
  };
  const p = previewSim(sim);

  expect(p.showSlotPlaceholders).toBe(false); // no placeholder art baked into the PNG
  expect(idValue(0x01, p, timeParts(p))).toBe(10); // 24h hour, not the pinned 3
});
