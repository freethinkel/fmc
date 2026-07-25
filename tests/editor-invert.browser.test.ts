// invertColors: flips RGB of every image under the current screen, keeps alpha, and clones
// resources shared with another screen so the AOD invert can't repaint the main screen.
import { test, expect, vi } from "vitest";
import { TAG, decodePixels, type FaceNode } from "$lib/modules/editor/lib/wf";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const firstImage = (n: FaceNode): number | undefined =>
  n.images?.[0] ?? n.subs?.map(firstImage).find((v) => v != null);

test("invert flips the current screen's pixels without touching the other screen", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "invert-test" });
  });
  const face = editorModel.$editor.getState().face!;
  const aod = face.screens.find((s) => s.tag === TAG.aod)!;
  const main = face.screens.find((s) => s.tag === TAG.main)!;

  expect(aod).toBeTruthy();
  const aodIdx = firstImage(aod)!;
  const mainIdx = firstImage(main)!;
  const before = Uint8ClampedArray.from(decodePixels(face.resources[aodIdx])!);
  const mainBefore = Uint8ClampedArray.from(decodePixels(face.resources[mainIdx])!);

  // sample opaque pixels only — fully transparent ones carry no meaningful RGB through the encode
  const opaque: number[] = [];

  for (let i = 0; i < before.length && opaque.length < 5; i += 4)
    if (before[i + 3] === 255) opaque.push(i);
  expect(opaque.length).toBe(5);

  editorModel.screenTagSet(TAG.aod);
  editorModel.select(null);
  editorModel.invertColorsRequested();
  // the effect re-encodes asynchronously — wait for the pixels themselves, not the dirty flag
  await vi.waitFor(() =>
    expect(decodePixels(face.resources[firstImage(aod)!])![opaque[0]]).not.toBe(before[opaque[0]]),
  );

  const after = decodePixels(face.resources[firstImage(aod)!])!;

  // RGB565/indexed re-encode is lossy, so compare with tolerance
  for (const i of opaque) {
    expect(Math.abs(after[i] - (255 - before[i]))).toBeLessThan(12);
    expect(Math.abs(after[i + 1] - (255 - before[i + 1]))).toBeLessThan(12);
    expect(after[i + 3]).toBe(255); // alpha kept
  }

  // the main screen still sees its original pixels (cloned if the resource was shared)
  expect([...decodePixels(face.resources[firstImage(main)!])!.slice(0, 64)]).toEqual([
    ...mainBefore.slice(0, 64),
  ]);
});
