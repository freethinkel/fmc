// The simulator offers one input per metric, not per data source — eight ids answer out of
// `steps` alone. That grouping is only honest while ID_METRIC and idValue agree about which
// metric each id reads, and they are two different pieces of code (the map, and the switch's
// derived cases), so the agreement is asserted rather than assumed.
import { test, expect } from "vitest";
import {
  ID_METRIC,
  defaultSim,
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

test("an override still wins over the metric field — that's what the folded section is for", () => {
  const { sim, t } = at("steps", 100);

  expect(idValue(0x19, sim, t)).toBe(100);
  expect(idValue(0x19, { ...sim, overrides: { 0x19: 7 } }, t)).toBe(7);
});
