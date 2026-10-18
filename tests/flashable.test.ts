import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import { assertFlashable, buildBin, parseBin } from "$lib/modules/editor/core/format";

const bytes = new Uint8Array(
  readFileSync(new URL("./__fixtures__/Analog__287__Simple_Dial.bin", import.meta.url)),
);

test("an official face passes", () => {
  expect(() => assertFlashable(bytes)).not.toThrow();
});

// the face that boot-looped a Watch 3 Pro had a 1386x1386 AOD image
test("an image far past the panel is refused", () => {
  const face = parseBin(bytes);

  face.resources[0] = { ...face.resources[0], w: 1386, h: 1386 };
  expect(() => assertFlashable(buildBin(face))).toThrow(/1386×1386/);
});
