import { expect, test } from "vitest";
import { resourceFromFile } from "$lib/modules/editor/core/render/pixels";

// the face that boot-looped a Watch 3 Pro carried a 1386x1386 image: one never gets in again
test("a dropped image past the panel is scaled down to it, keeping its ratio", async () => {
  const c = new OffscreenCanvas(1386, 693);
  c.getContext("2d");
  const file = new File([await c.convertToBlob({ type: "image/png" })], "big.png");
  const r = await resourceFromFile(file, 5);

  expect([r.w, r.h]).toEqual([466, 233]);
});

test("a small image keeps its size", async () => {
  const c = new OffscreenCanvas(96, 48);
  c.getContext("2d");
  const file = new File([await c.convertToBlob({ type: "image/png" })], "small.png");
  const r = await resourceFromFile(file, 5);

  expect([r.w, r.h]).toEqual([96, 48]);
});
