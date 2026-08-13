// The simulator offers one input per metric, not per data source — eight ids answer out of
// `steps` alone. That grouping is only honest while ID_METRIC and idValue agree about which
// metric each id reads, and they are two different pieces of code (the map, and the switch's
// derived cases), so the agreement is asserted rather than assumed.
import { test, expect } from "vitest";
import {
  ID_METRIC,
  defaultSim,
  goalOf,
  idValue,
  timeParts,
  type SimMetric,
} from "../src/lib/modules/editor/core/document/sources";

const at = (metric: SimMetric, value: number) => {
  const sim = { ...defaultSim(), live: false, time: new Date("2026-01-09T10:09:30").getTime() };

  return { sim: { ...sim, [metric]: value }, t: timeParts(sim) };
};

test.each(Object.entries(ID_METRIC))("0x%s reads its mapped metric", (idHex, metric) => {
  const id = Number(idHex);
  const low = at(metric, 0);
  const high = at(metric, 12345);

  // the value may be derived (distance's km/mi, integer and fraction splits) — what has to hold
  // is that this id moves when, and only when, the metric the panel groups it under moves
  expect(idValue(id, low.sim, low.t)).not.toBe(idValue(id, high.sim, high.t));
});

test("sunrise/sunset split one time each into the hour/minute pair the face reads", () => {
  const { sim, t } = at("steps", 0);
  const sun = { ...sim, sunrise: 5 * 60 + 41, sunset: 18 * 60 + 24 };

  expect([0x84, 0x85, 0x86, 0x87].map((id) => idValue(id, sun, t))).toEqual([5, 41, 18, 24]);
  // 12h device setting: the same evening sunset reads as 6, like the stock face's screenshot
  expect(idValue(0x86, { ...sun, is24h: false }, t)).toBe(6);
});

test("sleep splits into hours/minutes, and its ring reads the whole duration", () => {
  const { sim, t } = at("steps", 0);
  const slept = { ...sim, sleep: 7 * 60 + 36, sleepGoal: 8 * 60 };

  expect([0x42, 0x43, 0x46].map((id) => idValue(id, slept, t))).toEqual([7, 36, 456]);
  // the ring divides by the goal, so the duration and its denominator share one unit
  expect(goalOf(0x46, slept)).toBe(480);
});

test("an override still wins over the metric field — that's what the folded section is for", () => {
  const { sim, t } = at("steps", 100);

  expect(idValue(0x19, sim, t)).toBe(100);
  expect(idValue(0x19, { ...sim, overrides: { 0x19: 7 } }, t)).toBe(7);
});
