// Image adjust sliders: the filter is preview-only until build, lands in the exported .bin, and is
// non-destructive — back to 100% restores the original pixels.
import { test, expect, vi } from "vitest";
import { parseBin, decodePixels } from "$lib/modules/editor/core/format";
import { framesOf, type ImageAsset, type ImageId } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const NEUTRAL = { brightness: 100, contrast: 100, saturate: 100, hue: 0 };

const doc = () => editorModel.$doc.getState()!;
const asset = (id: ImageId) => doc().images.get(id)!;
const pixels = (a: ImageAsset) => decodePixels({ cf: a.cf, w: a.w, h: a.h, data: a.data })!;

test("brightness lands in the built .bin and 100% gives the original back", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "adjust-test" });
  });
  const main = doc().screens.find((s) => s.kind === "main")!;
  const widget = main.layers.find((l) => l.kind === "hand")!;
  const frame = framesOf(widget)[0];
  const before = Uint8ClampedArray.from(pixels(asset(frame)));
  // toLegacy lays the resource table out from scratch, so the index this asset ends up at is not
  // the editor's business — find it in the built file by its shape instead
  const rebuilt = (bin: Uint8Array) => {
    const a = asset(frame);

    return parseBin(bin)
      .resources.filter((r) => r.cf === a.cf && r.w === a.w && r.h === a.h)
      .map((r) => decodePixels(r)!);
  };
  // brightness scales RGB, so measure on a lit, fully opaque pixel
  let lit = -1;

  for (let i = 0; i < before.length && lit < 0; i += 4)
    if (before[i + 3] === 255 && before[i] > 80) lit = i;
  expect(lit).toBeGreaterThan(-1);

  editorModel.select(widget.id);
  editorModel.adjustImageRequested({ layer: widget.id, adjust: { ...NEUTRAL, brightness: 50 } });
  await vi.waitFor(() => expect(asset(frame).adjust?.brightness).toBe(50));

  // the stored bytes stay untouched until the file is built
  expect(pixels(asset(frame)).slice(0, 32)).toEqual(before.slice(0, 32));

  expect(
    rebuilt(await editorModel.buildCurrentBin()).some((px) => px[lit] < before[lit] - 20),
  ).toBe(true);

  // back to neutral: the filter re-applies from the pinned original, no compounding
  editorModel.adjustImageRequested({ layer: widget.id, adjust: NEUTRAL });
  await vi.waitFor(() => expect(asset(frame).adjust?.brightness).toBe(100));

  const restored = rebuilt(await editorModel.buildCurrentBin());

  expect(
    restored.some((px) => [lit, lit + 1, lit + 2].every((i) => Math.abs(px[i] - before[i]) < 6)),
  ).toBe(true);
});
