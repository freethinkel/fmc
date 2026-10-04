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

// `$cache` is outside the undo history — `undo` only swaps `$doc` — so an undone resize leaves a
// bitmap of the previous size behind. A turn that sized itself off that bitmap would resize the
// widget on the canvas, so the pin records the asset's box and the box is what the turn measures.
test("a turn after an undone resize keeps the size the document says", async () => {
  await load("rotate-undo-ref");
  const ref = singleFrameImage();
  const refFrame = framesOf(ref.layer)[0];

  await rotate(ref.layer.id, 15, refFrame);
  const straight = {
    w: asset(refFrame).w,
    h: asset(refFrame).h,
    at: findLayer(doc(), ref.layer.id) as ImageLayer,
  };

  await load("rotate-undo-test");
  const hit = singleFrameImage();
  const frame = framesOf(hit.layer)[0];
  const w0 = asset(frame).w,
    h0 = asset(frame).h;

  await resize(hit.layer.id, w0 * 2, h0 * 2, frame);
  editorModel.undo();
  await vi.waitFor(() => expect(asset(frame).w).toBe(w0));
  expect(bitmapOf(frame).width).toBe(w0 * 2); // the stale bitmap the turn must not size off

  await rotate(hit.layer.id, 15, frame);

  expect([asset(frame).w, asset(frame).h]).toEqual([straight.w, straight.h]);
  const after = findLayer(doc(), hit.layer.id) as ImageLayer;

  expect([after.x, after.y]).toEqual([straight.at.x, straight.at.y]);
});

// Undo can restore a document the pin no longer describes: turn, resize (which rescales the pin's
// box) and undo — the two coalesce into one history entry, so the document goes back to unturned
// while the pin keeps the halved box. Trusting it would halve the widget on the next nudge.
test("a pin an undo left behind is re-pinned, not trusted", async () => {
  await load("rotate-stale-pin");
  const hit = singleFrameImage();
  const frame = framesOf(hit.layer)[0];

  await rotate(hit.layer.id, 30, frame);
  const turned = asset(frame);

  await resize(hit.layer.id, Math.round(turned.w / 2), Math.round(turned.h / 2), frame);
  editorModel.undo();
  await vi.waitFor(() => expect(asset(frame).w).not.toBe(Math.round(turned.w / 2)));
  const before = asset(frame);

  await rotate(hit.layer.id, 10, frame);
  // the art is square-ish: a 10° nudge forward from 0° or 30° grows the box, never halves it
  expect(asset(frame).w).toBeGreaterThanOrEqual(before.w);
  expect(asset(frame).h).toBeGreaterThanOrEqual(before.h);
});

const luma = (b: ImageBitmap) => {
  const px = pixels(b);
  let sum = 0,
    n = 0;

  for (let i = 0; i < px.length; i += 4)
    if (px[i + 3] > 0) {
      sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
      n++;
    }
  return sum / n;
};

// A turn bakes the adjust into the pixels and clears it, so the pin must not outlive it: drawing
// the unadjusted pin on the turn after would make the brightness vanish.
test("an adjust survives every turn after it, not just the first", async () => {
  await load("rotate-adjust");
  const hit = singleFrameImage();
  const frame = framesOf(hit.layer)[0];

  await rotate(hit.layer.id, 30, frame);
  const plain = luma(bitmapOf(frame));

  editorModel.adjustImageRequested({
    layer: hit.layer.id,
    adjust: { brightness: 300, contrast: 100, saturate: 100, hue: 0 },
  });
  await vi.waitFor(() => expect(asset(frame).adjust?.brightness).toBe(300));
  const adjusted = luma(bitmapOf(frame));

  expect(adjusted).toBeGreaterThan(plain + 2); // the fixture's art is dark enough to show it
  await rotate(hit.layer.id, 10, frame);
  await rotate(hit.layer.id, 10, frame);

  const after = luma(bitmapOf(frame));

  expect(Math.abs(after - adjusted)).toBeLessThan(Math.abs(after - plain));
});

// The pin's box only takes a uniform scale; a stretch has to drop it, or the next nudge would
// compute scale-then-rotate and reshape the art.
test("a one-degree nudge after a stretch keeps the stretched shape", async () => {
  await load("rotate-stretch");
  const hit = singleFrameImage();
  const frame = framesOf(hit.layer)[0];

  await rotate(hit.layer.id, 45, frame);
  const turned = asset(frame);

  await resize(hit.layer.id, Math.round(turned.w * 1.4), turned.h, frame);
  const stretched = asset(frame);

  await rotate(hit.layer.id, 1, frame);
  // a 1° turn of a box grows it by a few percent at most, and keeps its aspect
  expect(Math.abs(asset(frame).w / stretched.w - 1)).toBeLessThan(0.03);
  expect(Math.abs(asset(frame).h / stretched.h - 1)).toBeLessThan(0.03);
});

// Fresh art has never been turned: carrying the old running angle onto it would make the inspector
// lie, and typing 0 there would turn the new image backwards by the old angle.
test("replacing or clearing a turned frame resets its angle", async () => {
  await load("rotate-replace");
  const hit = singleFrameImage();
  const frame = framesOf(hit.layer)[0];

  await rotate(hit.layer.id, 30, frame);
  const c = document.createElement("canvas");

  c.width = c.height = 10;
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));

  editorModel.replaceImageRequested({ id: frame, file: new File([blob], "a.png") });
  await vi.waitFor(() => expect(asset(frame).w).toBe(10));
  expect(asset(frame).rotate).toBeUndefined();

  await rotate(hit.layer.id, 30, frame);
  editorModel.clearImageRequested({ id: frame });
  await vi.waitFor(() => expect(asset(frame).rotate).toBeUndefined());
});
