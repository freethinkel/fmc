// Previews must be a function of the face alone: whatever the editor's simulator is showing —
// and it defaults to the live clock — a preview always renders the same pose.
import { test, expect } from "vitest";
import { defaultSim, previewSim, timeParts } from "../src/lib/modules/editor/core/document/sources";

test("previewSim pins the clock, keeping the rest of the simulator", () => {
  const sim = { ...defaultSim(), steps: 4242 };

  expect(sim.live).toBe(true); // the editor canvas follows the real time
  expect(timeParts(previewSim(sim))).toEqual({ h: 10, m: 9, s: 36, day: 8, wd: 1, mon: 1 });
  expect(previewSim(sim).steps).toBe(4242);
});
