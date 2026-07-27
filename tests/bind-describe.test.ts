// describeBind() must say the same thing visible() does — the panel text is the only readable
// view of a condition, so a wrong word there sends people editing the wrong widget.
// Runs in the "unit" (node) vitest project.
import { describe, test, expect } from "vitest";
import { describeBind } from "$lib/modules/editor/lib/sources";

// count u8 ‖ count × (id u8, op u8, val u24 LE)
const bind = (...entries: [number, number, number][]) =>
  [
    entries.length,
    ...entries.flatMap(([id, op, v]) => [id, op, v & 0xff, (v >> 8) & 0xff, v >> 16]),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

describe("describeBind", () => {
  test("equality, hide, no-data, range and slot ids", () => {
    expect(
      describeBind(
        bind(
          [0x19, 0x01, 1], // steps == 1
          [0x5f, 0x02, 1000], // hide when temperature == 1000
          [0x5f, 0x03, 1000], // temperature == no-data marker
          [0x0b, 0x05, 6], // minute >= 6
          [0x7a, 0x81, 4], // slot 1's selection == 4 (0x80 bit = plain equality)
        ),
      ),
    ).toEqual([
      "show if steps = 1",
      "hide if temperature = 1000",
      "show if temperature = 1000 (no-data marker)",
      "only if minute ≥ 6",
      "show if slot 1 selection = 4",
    ]);
  });

  test("unknown op is reported, not silently dropped", () => {
    expect(describeBind(bind([0x19, 0x04, 3]))).toEqual(["steps op 0x4 3 — unknown, ignored"]);
  });
});
