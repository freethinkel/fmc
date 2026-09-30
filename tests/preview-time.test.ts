import { test, expect } from "vitest";
import {
  defaultSim,
  idValue,
  previewSim,
  timeParts,
} from "../src/lib/modules/editor/core/document/sources";

test("previewSim pins the clock, keeping the rest of the simulator", () => {
  const sim = { ...defaultSim(), steps: 4242 };

  expect(sim.live).toBe(true);
  expect(timeParts(previewSim(sim))).toEqual({ h: 10, m: 9, s: 36, day: 8, wd: 4, mon: 1 });
  expect(previewSim(sim).steps).toBe(4242);
});

test("previewSim drops the editing aids that would leak into a published preview", () => {
  const sim = {
    ...defaultSim(),
    is24h: false,
    showSlotPlaceholders: true,
    overrides: { 0x01: 3 },
  };
  const p = previewSim(sim);

  expect(p.showSlotPlaceholders).toBe(false);
  expect(idValue(0x01, p, timeParts(p))).toBe(10);
});
