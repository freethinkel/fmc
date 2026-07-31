// describeConditions() must say the same thing the renderer's visibility check does — the panel
// text is the only readable view of a condition, so a wrong word there sends people editing the
// wrong widget. Runs in the "unit" (node) vitest project.
import { describe, test, expect } from "vitest";
import { describeConditions } from "$lib/modules/editor/core/document/sources";
import type { Condition } from "$lib/modules/editor/core/document/doc";

const c = (source: number, op: Condition["op"], value: number): Condition => ({
  source,
  op,
  value,
});

describe("describeConditions", () => {
  test("equality, hide, no-data, range and slot ids", () => {
    expect(
      describeConditions([
        c(0x19, "eq", 1), // steps == 1
        c(0x5f, "ne", 1000), // hide when temperature == 1000
        c(0x5f, "noData", 1000), // temperature == no-data marker
        c(0x0b, "gte", 6), // minute >= 6
        // slot 1's selection == 4. The file marks this variant with the 0x80 op bit, which decodes
        // to `exclusive` — semantically still equality, so it has to read the same way.
        { ...c(0x7a, "eq", 4), exclusive: true },
      ]),
    ).toEqual([
      "show if steps = 1",
      "hide if temperature = 1000",
      "show if temperature = 1000 (no-data marker)",
      "only if minute ≥ 6",
      "show if slot 1 selection = 4",
    ]);
  });
});
