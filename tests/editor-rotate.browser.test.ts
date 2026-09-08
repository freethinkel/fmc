// rotateImageRequested: the format has no angle, so a turn is a pixel edit. What must not happen
// is a turn resampling an already-turned bitmap — that blurs the art a little more on every nudge.
// Every test here is about the pinned pre-rotation pixels (ImageCache.rot0) doing their job.
import { test, expect, vi } from "vitest";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import {
  framesOf,
  type ImageLayer,
  type ImageId,
  type NodeId,
} from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import { renderDoc } from "$lib/modules/editor/core/render/render";
import { SCREEN } from "$lib/modules/editor/core/render/screen";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const asset = (id: ImageId) => doc().images.get(id)!;
const bitmapOf = (id: ImageId) => editorModel.$cache.getState().get(id)!.bitmap!;

async function load(label: string) {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label });
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
}

const draw = () => {
  const c = document.createElement("canvas");

  c.width = c.height = SCREEN;
  return renderDoc(
    c.getContext("2d")!,
    doc(),
    editorModel.$store.getState(),
    "main",
    editorModel.$sim.getState(),
  );
};

/** A single-frame image widget — one asset to follow, like the resize suite uses. */
const singleFrameImage = () =>
  draw().find((h) => h.layer.kind === "image" && framesOf(h.layer).length === 1)!;

const pixels = (b: ImageBitmap) => {
  const c = document.createElement("canvas");

  c.width = b.width;
  c.height = b.height;
  c.getContext("2d")!.drawImage(b, 0, 0);
  return [...c.getContext("2d")!.getImageData(0, 0, b.width, b.height).data];
};

/** Turn `layer` by `deg` and wait for the document to carry the new total. */
async function rotate(layer: NodeId, deg: number, frame: ImageId) {
  const want = ((((asset(frame).rotate ?? 0) + deg) % 360) + 360) % 360;

  editorModel.rotateImageRequested({ layer, deg });
  await vi.waitFor(() => expect(asset(frame).rotate).toBe(want));
}

// The reported bug: dragging the angle handle fires a turn per pointermove, and each one used to
// resample the previous turn's pixels. Off the pinned original, twelve 5° steps have to land on
// exactly the bytes one 60° turn produces.
test("nudging an angle in small steps is as sharp as turning it once", async () => {
  await load("rotate-steps-test");
  const stepped = singleFrameImage();
  const stepFrame = framesOf(stepped.layer)[0];

  for (let i = 0; i < 12; i++) await rotate(stepped.layer.id, 5, stepFrame);
  const many = {
    w: asset(stepFrame).w,
    h: asset(stepFrame).h,
    px: pixels(bitmapOf(stepFrame)),
    at: findLayer(doc(), stepped.layer.id) as ImageLayer,
  };

  await load("rotate-once-test");
  const turned = singleFrameImage();
  const onceFrame = framesOf(turned.layer)[0];

  await rotate(turned.layer.id, 60, onceFrame);
  const once = {
    w: asset(onceFrame).w,
    h: asset(onceFrame).h,
    px: pixels(bitmapOf(onceFrame)),
    at: findLayer(doc(), turned.layer.id) as ImageLayer,
  };

  expect([many.w, many.h]).toEqual([once.w, once.h]);
  expect(many.px).toEqual(once.px);
  // and it sits where the one-shot turn put it — the per-step recentring must not drift either
  expect([many.at.x, many.at.y]).toEqual([once.at.x, once.at.y]);
});

test("turning back to where it started restores the pixels exactly", async () => {
  await load("rotate-return-test");
  const hit = singleFrameImage();
  const frame = framesOf(hit.layer)[0];
  const before = { w: asset(frame).w, h: asset(frame).h, px: pixels(bitmapOf(frame)) };

  await rotate(hit.layer.id, 37, frame);
  expect(asset(frame).w).toBeGreaterThan(before.w); // the box grew to the leaning bbox
  await rotate(hit.layer.id, -37, frame);

  expect(asset(frame).rotate).toBe(0);
  expect([asset(frame).w, asset(frame).h]).toEqual([before.w, before.h]);
  expect(pixels(bitmapOf(frame))).toEqual(before.px);
  // and the layer is back where it was, since the box shrank by exactly what it grew
  const l0 = hit.layer as ImageLayer;

  expect(findLayer(doc(), hit.layer.id)).toMatchObject({ x: l0.x, y: l0.y });
});

/** Resize a widget's first frame and wait for the document to carry the new size. */
async function resize(layer: NodeId, w: number, h: number, frame: ImageId) {
  editorModel.resizeImageRequested({ layer, w, h });
  await vi.waitFor(() => expect(asset(frame).w).toBe(w));
}

// A turn grows the art to its leaning bounding box, transparent corners and all. If a resize in
// between dropped the pin, the turn back would re-pin from THAT — the box could never shrink to
// what it was, and the art would be squeezed and resampled once per round. So: turn, resize to
// half, turn back, and the widget has to be exactly the halved original, pixel for pixel.
test("a resize between two turns doesn't cost the pinned original", async () => {
  await load("rotate-resize-ref");
  const ref = singleFrameImage();
  const refFrame = framesOf(ref.layer)[0];
  const full = asset(refFrame);
  const half = { w: Math.round(full.w / 2), h: Math.round(full.h / 2) };

  await resize(ref.layer.id, half.w, half.h, refFrame);
  const halved = pixels(bitmapOf(refFrame)); // the same widget, only ever resized

  await load("rotate-resize-test");
  const hit = singleFrameImage();
  const frame = framesOf(hit.layer)[0];

  await rotate(hit.layer.id, 30, frame);
  const grown = asset(frame);
  const k = half.w / full.w;

  await resize(hit.layer.id, Math.round(grown.w * k), Math.round(grown.h * k), frame);
  await rotate(hit.layer.id, -30, frame);

  expect([asset(frame).w, asset(frame).h]).toEqual([half.w, half.h]);
  expect(pixels(bitmapOf(frame))).toEqual(halved);
});
