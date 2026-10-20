import { readFileSync } from "node:fs";
import { expect, test } from "vitest";
import {
  assertFlashable,
  buildBin,
  flashWarning,
  parseBin,
  TAG,
} from "$lib/modules/editor/core/format";
import { fromLegacy, toLegacy } from "$lib/modules/editor/core/document/doc";
import { withPreviews } from "$lib/modules/editor/core/document/factory";

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

// one Pro 3 factory face ships a 576x530 image, so that size installs, but only once confirmed
test("an image past every factory face but under the limit asks first", () => {
  const face = parseBin(bytes);

  expect(flashWarning(bytes)).toBeNull();
  face.resources[0] = { ...face.resources[0], w: 576, h: 530 };
  const big = buildBin(face);

  expect(() => assertFlashable(big)).not.toThrow();
  expect(flashWarning(big)).toMatch(/576×530/);
});

// #49: the FMC face that crash-looped a Watch 3 Pro on AOD was the one whose AOD screen had lost
// its 0x28 thumbnail, which every stock AOD screen has. The raw file is refused; the same face
// rebuilt by the editor gets the thumbnail back and goes through.
test("an AOD screen without its preview is refused, and the editor's export restores it", () => {
  const face = parseBin(bytes);
  const aod = face.screens.find((s) => s.tag === TAG.aod)!;

  aod.subs = aod.subs!.filter((n) => n.tag !== TAG.preview);
  const bare = buildBin(face);

  expect(() => assertFlashable(bare)).toThrow(/always-on screen has no preview/);
  const { doc } = fromLegacy(parseBin(bare));
  const fixed = withPreviews(doc, face.resources[0]);

  expect(withPreviews(fixed, face.resources[0])).toBe(fixed); // nothing left to restore
  expect(() => assertFlashable(buildBin(toLegacy(fixed)))).not.toThrow();
});
