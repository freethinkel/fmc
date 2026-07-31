// hidden and locked are editor-only flags: hidden drops the layer from the render (so the canvas
// can't hit it either), locked keeps it drawn but stops it answering the canvas. Neither is
// written to the file.
import { test, expect } from "vitest";
import { parseBin } from "$lib/modules/editor/core/format";
import { renderDoc } from "$lib/modules/editor/core/render/render";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import { framesOf, isPlaced, type NodeId } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import { SCREEN } from "$lib/modules/editor/core/render/screen";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const byId = (id: NodeId) => findLayer(doc(), id)!;

const load = async (label: string) => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label });
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
};

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

const drawn = (id: NodeId) => draw().some((h) => h.layer.id === id);
const withFrames = () => doc().screens[0].layers.find((l) => framesOf(l).length > 0)!;

test("hiding a layer takes it out of the render, and the flag never reaches the file", async () => {
  await load("flags-hidden");
  const l = withFrames();

  expect(drawn(l.id)).toBe(true);

  editorModel.layerFlagsSet({ ids: [l.id], patch: { hidden: true } });
  expect(byId(l.id).hidden).toBe(true);
  expect(drawn(l.id)).toBe(false); // no hit either — the canvas can't select what isn't drawn

  // the format has no such field: a rebuilt file must still carry the layer
  const built = parseBin(await editorModel.buildCurrentBin());
  const tags = built.screens[0].subs!.map((n) => n.tag);

  expect(tags.filter((t) => t === l.tag).length).toBe(
    doc().screens[0].layers.filter((x) => x.tag === l.tag).length,
  );

  editorModel.layerFlagsSet({ ids: [l.id], patch: { hidden: false } });
  expect(drawn(l.id)).toBe(true);
});

test("locking a layer keeps it drawn but out of reach", async () => {
  await load("flags-locked");
  const l = withFrames();

  editorModel.layerFlagsSet({ ids: [l.id], patch: { locked: true } });

  expect(byId(l.id).locked).toBe(true);
  expect(drawn(l.id)).toBe(true); // unlike hidden, it still renders

  editorModel.undo();
  expect(byId(l.id).locked).toBeFalsy();
});

test("the flags apply to a whole selection at once", async () => {
  await load("flags-multi");
  const [a, b] = doc()
    .screens[0].layers.filter((x) => framesOf(x).length > 0)
    .slice(0, 2);

  editorModel.select(a.id);
  editorModel.selectToggled(b.id);
  editorModel.layerFlagsSet({
    ids: editorModel.$selected.getState().map((x) => x.id),
    patch: { hidden: true },
  });

  expect([byId(a.id).hidden, byId(b.id).hidden]).toEqual([true, true]);
});

test("a locked layer refuses every edit that would move or resize it", async () => {
  await load("flags-locked-edits");
  const l = withFrames();
  const at = isPlaced(l) ? { x: l.x, y: l.y } : null;
  const frame = framesOf(l)[0];
  const size = { w: doc().images.get(frame)!.w, h: doc().images.get(frame)!.h };

  editorModel.select(l.id);
  editorModel.layerFlagsSet({ ids: [l.id], patch: { locked: true } });

  // the props panel's inputs, the canvas drag and the arrow keys all land on layerPatched
  editorModel.layerPatched({ id: l.id, patch: { x: 5, y: 5 } });
  editorModel.resizeImageRequested({ layer: l.id, w: 12, h: 12 });
  editorModel.alignRequested("left");
  await new Promise((r) => setTimeout(r, 100));

  const after = byId(l.id);

  if (at)
    expect({
      x: (after as typeof after & { x: number }).x,
      y: (after as typeof after & { y: number }).y,
    }).toEqual(at);
  expect({ w: doc().images.get(frame)!.w, h: doc().images.get(frame)!.h }).toEqual(size);

  // unlocking restores normal service
  editorModel.layerFlagsSet({ ids: [l.id], patch: { locked: false } });
  editorModel.layerPatched({ id: l.id, patch: { x: 5, y: 5 } });
  expect((byId(l.id) as typeof after & { x: number }).x).toBe(5);
});
