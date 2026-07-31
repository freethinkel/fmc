// resizeImageRequested: the format draws a widget 1:1 from its asset, so a resize rescales the
// pixels. Checked against a re-render (the rendered bbox is the contract), and for hands
// additionally that the rotation center doesn't move.
import { test, expect, vi } from "vitest";
import { parseBin } from "$lib/modules/editor/core/format";
import { renderDoc, type ResizePreview } from "$lib/modules/editor/core/render/render";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import {
  framesOf,
  type HandLayer,
  type ImageId,
  type NodeId,
} from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const asset = (id: ImageId) => doc().images.get(id)!;
const bitmapOf = (id: ImageId) => editorModel.$cache.getState().get(id)?.bitmap;
const byId = (id: NodeId) => findLayer(doc(), id)!;

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

const draw = (preview?: ResizePreview) => {
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  return renderDoc(
    c.getContext("2d")!,
    doc(),
    editorModel.$store.getState(),
    "main",
    editorModel.$sim.getState(),
    preview,
  );
};

/** A single-frame image widget — the simplest thing to measure a rescale against. */
const singleFrameImage = () =>
  draw().find((h) => h.layer.kind === "image" && framesOf(h.layer).length === 1)!;

test("resizing an image widget resizes its asset and its rendered box", async () => {
  await load("resize-test");
  const h0 = singleFrameImage();

  expect(h0).toBeTruthy();
  const id = h0.layer.id;
  const frame = framesOf(h0.layer)[0];
  const data0 = asset(frame).data;
  const w = Math.round(h0.w / 2),
    h = Math.round(h0.h / 2);

  editorModel.select(id);
  editorModel.resizeImageRequested({ layer: id, w, h });
  await vi.waitFor(() => expect(asset(frame).w).toBe(w));

  expect(asset(frame).h).toBe(h);
  const after = draw().findLast((x) => x.layer.id === id)!;

  expect([after.w, after.h]).toEqual([w, h]);
  // encoded bytes stay untouched in the document — the re-encode happens on the way out only
  expect(asset(frame).data).toBe(data0);

  // still a valid file, and the asset it carries is the resized one (proves the re-encode
  // survives lz4 + rebuild)
  const built = parseBin(await editorModel.buildCurrentBin());

  expect(built.resources.some((r) => r.w === w && r.h === h)).toBe(true);
  // and building did not mutate the document behind the editor's back
  expect(asset(frame).data).toBe(data0);
});

test("shrinking then restoring the size costs no detail", async () => {
  await load("resize-lossless-test");
  const h0 = singleFrameImage();
  const id = h0.layer.id;
  const frame = framesOf(h0.layer)[0];
  const w0 = asset(frame).w,
    h0px = asset(frame).h;
  const pixels = (b: ImageBitmap) => {
    const c = document.createElement("canvas");

    c.width = b.width;
    c.height = b.height;
    c.getContext("2d")!.drawImage(b, 0, 0);
    return [...c.getContext("2d")!.getImageData(0, 0, b.width, b.height).data];
  };
  const before = pixels(bitmapOf(frame)!);

  editorModel.resizeImageRequested({ layer: id, w: 8, h: 8 });
  await vi.waitFor(() => expect(asset(frame).w).toBe(8));
  editorModel.resizeImageRequested({ layer: id, w: w0, h: h0px });
  await vi.waitFor(() => expect(asset(frame).w).toBe(w0));

  // rescaled off the pinned original, not off the 8x8 step
  expect(pixels(bitmapOf(frame)!)).toEqual(before);
});

// A corner drag fires one of these per pointermove, so the steps must not compound: every call
// is absolute (size off the pinned original, origin off the drag's start), and the anchored
// corner has to sit exactly where it started once the drag is over.
test("a live drag of the top-left corner keeps the bottom-right corner pinned", async () => {
  await load("resize-live-test");
  const h0 = singleFrameImage();
  const id = h0.layer.id;
  const frame = framesOf(h0.layer)[0];
  const rw0 = asset(frame).w,
    rh0 = asset(frame).h;
  const placed = byId(id) as { x: number; y: number };
  const x0 = placed.x,
    y0 = placed.y;
  const right = h0.x + h0.w,
    bottom = h0.y + h0.h;

  for (let i = 1; i <= 15; i++) {
    const scale = 1 - 0.04 * i;
    const gw = Math.max(1, Math.round(h0.w * scale)),
      gh = Math.max(1, Math.round(h0.h * scale));
    const w = Math.round(rw0 * scale);

    editorModel.resizeImageRequested({
      layer: id,
      w,
      h: Math.round(rh0 * scale),
      at: { x: x0 + Math.round(right - gw - h0.x), y: y0 + Math.round(bottom - gh - h0.y) },
    });
    await vi.waitFor(() => expect(asset(frame).w).toBe(w));
  }
  const after = draw().findLast((x) => x.layer.id === id)!;

  expect(after.x + after.w).toBe(right);
  expect(after.y + after.h).toBe(bottom);
});

test("resizing a hand scales its pivot and keeps the rotation center put", async () => {
  await load("resize-hand-test");
  const handHit = draw().find((h) => h.layer.kind === "hand")!;

  expect(handHit).toBeTruthy();
  const id = handHit.layer.id;
  const hand = byId(id) as HandLayer;
  const frame = framesOf(hand)[0];
  const center = { x: hand.x + hand.pivotX, y: hand.y + hand.pivotY };
  const pivot0 = { x: hand.pivotX, y: hand.pivotY };
  const w0 = asset(frame).w,
    h0 = asset(frame).h;

  editorModel.resizeImageRequested({ layer: id, w: w0 * 2, h: h0 * 2 });
  await vi.waitFor(() => expect(asset(frame).w).toBe(w0 * 2));

  const after = byId(id) as HandLayer;

  expect([after.pivotX, after.pivotY]).toEqual([pivot0.x * 2, pivot0.y * 2]);
  expect(after.x + after.pivotX).toBe(center.x);
  expect(after.y + after.pivotY).toBe(center.y);
});

// The live drag case for a hand: the pivot is rounded on every step, so scaling it off the
// current value compounds — the hand slides off the dial over a drag. Scaled off the pinned
// original instead, 12 steps have to land exactly where one step to the same size would.
test("a live drag of a hand doesn't compound its pivot", async () => {
  await load("resize-hand-live-test");
  const handHit = draw().find((h) => h.layer.kind === "hand")!;
  const id = handHit.layer.id;
  const hand = byId(id) as HandLayer;
  const frame = framesOf(hand)[0];
  const w0 = asset(frame).w,
    h0 = asset(frame).h;
  const pivot0 = { x: hand.pivotX, y: hand.pivotY };
  const center = { x: hand.x + hand.pivotX, y: hand.y + hand.pivotY };
  const end = 0.4;

  for (let i = 1; i <= 12; i++) {
    const k = 1 - ((1 - end) * i) / 12;
    const w = Math.round(w0 * k);

    editorModel.resizeImageRequested({ layer: id, w, h: Math.round(h0 * k) });
    await vi.waitFor(() => expect(asset(frame).w).toBe(w));
  }
  const after = byId(id) as HandLayer;

  expect([after.pivotX, after.pivotY]).toEqual([
    Math.round((pivot0.x * Math.round(w0 * end)) / w0),
    Math.round((pivot0.y * Math.round(h0 * end)) / h0),
  ]);
  // and the rotation center never moved, step after step
  expect(after.x + after.pivotX).toBe(center.x);
  expect(after.y + after.pivotY).toBe(center.y);
});

// What a corner drag draws while it lasts: the layer scaled on the canvas, assets untouched. The
// assets are only rescaled on release, so the two have to agree — a mismatch is a jump on mouseup.
test("the resize preview scales the layer on canvas without touching its asset", async () => {
  await load("resize-preview-test");
  const h0 = singleFrameImage();
  const frame = framesOf(h0.layer)[0];
  const w0 = asset(frame).w;
  const hits = draw({ id: h0.layer.id, kw: 2, kh: 1.5, ax: h0.x, ay: h0.y });
  const h = hits.findLast((x) => x.layer.id === h0.layer.id)!;

  expect([h.w, h.h]).toEqual([h0.w * 2, h0.h * 1.5]);
  expect([h.x, h.y]).toEqual([h0.x, h0.y]); // the anchor is where it was
  expect(asset(frame).w).toBe(w0); // and nothing was re-decoded to get there

  // the same preview around the opposite corner moves the box instead of the anchor
  const far = draw({ id: h0.layer.id, kw: 2, kh: 2, ax: h0.x + h0.w, ay: h0.y + h0.h });
  const g = far.findLast((x) => x.layer.id === h0.layer.id)!;

  expect(g.x + g.w).toBe(h0.x + h0.w);
  expect(g.y + g.h).toBe(h0.y + h0.h);
});
