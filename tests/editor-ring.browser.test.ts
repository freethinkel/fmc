// Progress rings are the one widget that draws without any art (the stroked 0x5a fallback), so
// they resize through their spec rather than through their pixels — and the ones that DO have art
// carry a second size, meta.w/h, which is the circle the filled sector pivots around.
import { test, expect, vi } from "vitest";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import type { Layer, NodeId, RingLayer } from "$lib/modules/editor/core/document/doc";
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
