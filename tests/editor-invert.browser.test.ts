// invertColors: flips RGB of every image under the current screen, keeps alpha, and copies assets
// shared with another screen so the AOD invert can't repaint the main screen.
import { test, expect, vi } from "vitest";
import { decodePixels } from "$lib/modules/editor/core/format";
import {
  framesOf,
  type ImageAsset,
  type ImageId,
  type Layer,
  type Screen,
} from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const asset = (id: ImageId) => doc().images.get(id)!;
const pixels = (a: ImageAsset) => decodePixels({ cf: a.cf, w: a.w, h: a.h, data: a.data })!;
const screen = (kind: Screen["kind"]) => doc().screens.find((s) => s.kind === kind)!;

/** The first asset anything on this screen draws — re-read after each edit, since inverting a
 *  shared asset gives the screen its own copy under a new id. */
function firstImage(kind: Screen["kind"]): ImageId {
  const walk = (ls: readonly Layer[]): ImageId | undefined => {
    for (const l of ls) {
      const own = framesOf(l)[0];

      if (own) return own;
      const kids = l.kind === "group" ? l.children : l.kind === "raw" ? (l.children ?? []) : [];
      const hit = walk(kids);

      if (hit) return hit;
    }
  };

  return walk(screen(kind).layers)!;
}

test("invert flips the current screen's pixels without touching the other screen", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "invert-test" });
  });

  expect(screen("aod")).toBeTruthy();
  const aodId = firstImage("aod");
  const mainId = firstImage("main");
  const before = Uint8ClampedArray.from(pixels(asset(aodId)));
  const mainBefore = Uint8ClampedArray.from(pixels(asset(mainId)));

  // sample opaque pixels only — fully transparent ones carry no meaningful RGB through the encode
  const opaque: number[] = [];

  for (let i = 0; i < before.length && opaque.length < 5; i += 4)
    if (before[i + 3] === 255) opaque.push(i);
  expect(opaque.length).toBe(5);

  editorModel.screenSet("aod");
  editorModel.select(null);
  editorModel.invertColorsRequested();
  // the effect re-encodes asynchronously — wait for the pixels themselves, not the dirty flag
  await vi.waitFor(() =>
    expect(pixels(asset(firstImage("aod")))[opaque[0]]).not.toBe(before[opaque[0]]),
  );

  const after = pixels(asset(firstImage("aod")));

  // RGB565/indexed re-encode is lossy, so compare with tolerance
  for (const i of opaque) {
    expect(Math.abs(after[i] - (255 - before[i]))).toBeLessThan(12);
    expect(Math.abs(after[i + 1] - (255 - before[i + 1]))).toBeLessThan(12);
    expect(after[i + 3]).toBe(255); // alpha kept
  }

  // the main screen still sees its original pixels (copied if the asset was shared)
  expect(pixels(asset(firstImage("main"))).slice(0, 64)).toEqual(mainBefore.slice(0, 64));
});
