// Progress rings are the one widget that draws without any art (the stroked 0x5a fallback), so
// they resize through their spec rather than through their pixels — and the ones that DO have art
// carry a second size, meta.w/h, which is the circle the filled sector pivots around.
import { test, expect, vi } from "vitest";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import type { Layer, NodeId, RingLayer } from "$lib/modules/editor/core/document/doc";
import { FULL_BLEED_R } from "$lib/modules/editor/core/render/arc";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Default__276__Dichotomy.bin?url";

const doc = () => editorModel.$doc.getState()!;
const ringById = (id: NodeId) => findLayer(doc(), id) as RingLayer;

async function load() {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "ring-test" });
  });
}

/** A tiny opaque PNG, as a File — what the "use a ring bitmap" picker hands over. */
async function png(size: number): Promise<File> {
  const c = document.createElement("canvas");

  c.width = c.height = size;
  const ctx = c.getContext("2d")!;

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, size, size);
  const blob = await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png"));

  return new File([blob], "ring.png", { type: "image/png" });
}

/** The first ring in the fixture that has art — Dichotomy's are 0x5b half-rings. */
const imageRing = () => {
  const out: RingLayer[] = [];
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      if (l.kind === "ring" && l.frames.length) out.push(l);
      if (l.kind === "group") walk(l.children);
    }
  };

  doc().screens.forEach((s) => walk(s.layers));
  return out[0];
};

test("a ring with no art resizes through its spec, not its pixels", async () => {
  await load();
  editorModel.nodeAdded("ring");
  const id = editorModel.$sel.getState()!;
  const before = ringById(id);

  expect(before.frames.length).toBe(0);
  editorModel.ringResized({ layer: id, kw: 2, kh: 2 });
  const after = ringById(id);

  expect(after.spec.radius).toBe(before.spec.radius * 2);
  expect(after.spec.width).toBe(before.spec.width * 2);
  // meta.w/h is what the renderer falls back to when there's no explicit radius — it has to agree
  expect(after.meta.w).toBe(after.spec.radius * 2);
  expect(after.meta.h).toBe(after.spec.radius * 2);
});

test("resizing a ring's art scales meta.w/h with it — the sector pivot is that circle", async () => {
  await load();
  const ring = imageRing();

  expect(ring).toBeTruthy();
  const frame = ring.frames[0];
  const asset0 = doc().images.get(frame)!;
  const w0 = ring.meta.w;

  editorModel.resizeImageRequested({
    layer: ring.id,
    w: Math.round(asset0.w / 2),
    h: Math.round(asset0.h / 2),
  });
  await vi.waitFor(() => expect(ringById(ring.id).meta.w).not.toBe(w0));

  expect(ringById(ring.id).meta.w).toBe(Math.round(w0 / 2));
});

// The factors rescaleFrames reports are relative to the PINNED ORIGINAL bitmap, so a second resize
// that multiplies the already-scaled meta by them lands on a quarter instead of a half.
test("halving a ring's art twice halves its circle twice, not compounds", async () => {
  await load();
  const ring = imageRing();
  const asset0 = doc().images.get(ring.frames[0])!;
  const w0 = ring.meta.w;
  const half = (n: number) => {
    editorModel.resizeImageRequested({
      layer: ring.id,
      w: Math.round(asset0.w / n),
      h: Math.round(asset0.h / n),
    });
  };

  half(2);
  await vi.waitFor(() => expect(ringById(ring.id).meta.w).toBe(Math.round(w0 / 2)));
  half(4);
  await vi.waitFor(() =>
    expect(doc().images.get(ring.frames[0])!.w).toBe(Math.round(asset0.w / 4)),
  );

  expect(ringById(ring.id).meta.w).toBe(Math.round(w0 / 4));
});

// A circle takes one factor: the axis that actually moved. Reading it as max() froze every
// shrink (max(0.9, 1) === 1), which is what an arrow-key resize hands over.
test("a one-axis shrink shrinks a bare ring, and a no-op resize keeps the undo stack", async () => {
  await load();
  editorModel.nodeAdded("ring");
  const id = editorModel.$sel.getState()!;
  const r0 = ringById(id).spec.radius;

  editorModel.ringResized({ layer: id, kw: 0.5, kh: 1 });
  expect(ringById(id).spec.radius).toBe(Math.round(r0 / 2));

  const undos = editorModel.$undoN.getState();

  editorModel.ringResized({ layer: id, kw: 1, kh: 1 });
  expect(editorModel.$undoN.getState()).toBe(undos);
});

// drawProceduralArc draws a ring this big from the screen centre and ignores its x/y, so a drag
// that crossed the line would teleport the ring and throw its position away.
test("a bare ring can't be resized past the full-bleed radius", async () => {
  await load();
  editorModel.nodeAdded("ring");
  const id = editorModel.$sel.getState()!;

  editorModel.ringResized({ layer: id, kw: 8, kh: 8 });

  expect(ringById(id).spec.radius).toBe(FULL_BLEED_R - 1);
});

// Same rule one level up: a group drag rescales its children's pixels, and a ring's circle is not
// its pixels — a bare ring inside a group has none at all.
test("resizing a group scales a ring child's circle too", async () => {
  await load();
  editorModel.nodeAdded("ring");
  const id = editorModel.$sel.getState()!;
  const r0 = ringById(id).spec.radius;

  editorModel.select(id);
  editorModel.groupRequested();
  const group = editorModel.$sel.getState()!;

  editorModel.resizeGroupRequested({ layer: group, kw: 0.5, kh: 0.5 });
  await vi.waitFor(() => expect(ringById(id).spec.radius).toBe(Math.round(r0 / 2)));

  expect(ringById(id).meta.w).toBe(2 * Math.round(r0 / 2));
});

test("a ring with no art can be given one, and keeps the bitmap's circle", async () => {
  await load();
  editorModel.nodeAdded("ring");
  const id = editorModel.$sel.getState()!;

  editorModel.ringImageAdded({ id, file: await png(64) });
  await vi.waitFor(() => expect(ringById(id).frames.length).toBe(1));

  const l = ringById(id);

  expect(doc().images.get(l.frames[0])!.w).toBe(64);
  expect(l.meta.w).toBe(64);
  expect(l.meta.h).toBe(64);
});
