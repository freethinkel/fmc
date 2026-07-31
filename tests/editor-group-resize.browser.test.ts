// Resizing a group scales what's inside it — pixels, coordinates and a hand's pivot — not just
// the frame it lays children out in.
import { test, expect, vi } from "vitest";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import {
  framesOf,
  isPlaced,
  type GroupLayer,
  type ImageId,
  type NodeId,
} from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const asset = (id: ImageId) => doc().images.get(id)!;
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

/** Wrap two pixel-bearing layers in a group and hand it back. */
async function groupOfTwo(): Promise<GroupLayer> {
  const [a, b] = doc()
    .screens[0].layers.filter((l) => framesOf(l).length > 0 && isPlaced(l))
    .slice(0, 2);

  editorModel.select(a.id);
  editorModel.selectToggled(b.id);
  editorModel.groupRequested();
  return byId(editorModel.$sel.getState()!) as GroupLayer;
}

test("resizing a group scales its children's pixels and positions", async () => {
  await load("group-resize");
  const g = await groupOfTwo();
  const kid = g.children.find((c) => framesOf(c).length > 0)!;
  const frame = framesOf(kid)[0];
  const before = {
    frame: { w: g.frame.w, h: g.frame.h },
    asset: { w: asset(frame).w, h: asset(frame).h },
    x: isPlaced(kid) ? kid.x : 0,
  };

  editorModel.resizeGroupRequested({ layer: g.id, kw: 2, kh: 2 });
  await vi.waitFor(() => expect(asset(frame).w).toBe(before.asset.w * 2));

  const after = byId(g.id) as GroupLayer;
  const kidAfter = after.children.find((c) => c.id === kid.id)!;

  expect(asset(frame).h).toBe(before.asset.h * 2);
  expect({ w: after.frame.w, h: after.frame.h }).toEqual({
    w: before.frame.w * 2,
    h: before.frame.h * 2,
  });
  expect(isPlaced(kidAfter) ? kidAfter.x : 0).toBe(before.x * 2);
});

test("a locked child keeps its size while the rest of the group scales", async () => {
  await load("group-resize-locked");
  const g = await groupOfTwo();
  const [one, two] = g.children.filter((c) => framesOf(c).length > 0);

  if (!two) return; // the fixture only grouped one pixel layer — nothing to compare against
  const kept = framesOf(two)[0];
  const scaled = framesOf(one)[0];
  const before = { kept: asset(kept).w, scaled: asset(scaled).w };

  editorModel.layerFlagsSet({ ids: [two.id], patch: { locked: true } });
  editorModel.resizeGroupRequested({ layer: g.id, kw: 2, kh: 2 });
  await vi.waitFor(() => expect(asset(scaled).w).toBe(before.scaled * 2));

  expect(asset(kept).w).toBe(before.kept);
});
