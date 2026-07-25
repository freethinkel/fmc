// Image adjust sliders: the filter is preview-only until build, lands in the exported .bin,
// and is non-destructive — back to 100% restores the original pixels.
import { test, expect, vi } from "vitest";
import { TAG, parseBin, decodePixels, type FaceNode } from "$lib/modules/editor/lib/wf";
import { editorModel } from "$lib/modules/editor/model";
import { buildCurrentBin } from "$lib/modules/editor/model/editor.model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const NEUTRAL = { brightness: 100, contrast: 100, saturate: 100, hue: 0 };

test("brightness lands in the built .bin and 100% gives the original back", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "adjust-test" });
  });
  const face = editorModel.$editor.getState().face!;
  const main = face.screens.find((s) => s.tag === TAG.main)!;
  // a widget with its own frames — the hand at the end of the screen's subs
  const widget = main.subs!.find((n) => n.tag === TAG.hand)!;
  const st = widget.subs!.find((s: FaceNode) => s.tag === TAG.struct)!;
  const resIdx = st.images![0];
  const before = Uint8ClampedArray.from(decodePixels(face.resources[resIdx])!);
  // brightness scales RGB, so measure on a lit, fully opaque pixel
  let lit = -1;

  for (let i = 0; i < before.length && lit < 0; i += 4)
    if (before[i + 3] === 255 && before[i] > 80) lit = i;
  expect(lit).toBeGreaterThan(-1);

  editorModel.select(widget);
  editorModel.adjustImageRequested({ node: widget, adjust: { ...NEUTRAL, brightness: 50 } });
  await vi.waitFor(() => expect(face.resources[resIdx].adjust?.brightness).toBe(50));

  // the resource bytes stay untouched until the file is built
  expect(decodePixels(face.resources[resIdx])!.slice(0, 32)).toEqual(before.slice(0, 32));

  const dimmed = parseBin(await buildCurrentBin()).resources[resIdx];

  expect(decodePixels(dimmed)![lit]).toBeLessThan(before[lit] - 20);

  // back to neutral: the filter re-applies from the pinned original, no compounding
  editorModel.adjustImageRequested({ node: widget, adjust: NEUTRAL });
  await vi.waitFor(() => expect(face.resources[resIdx].adjust?.brightness).toBe(100));

  const restored = decodePixels(parseBin(await buildCurrentBin()).resources[resIdx])!;

  for (const i of [lit, lit + 1, lit + 2])
    expect(Math.abs(restored[i] - before[i])).toBeLessThan(6);
});
