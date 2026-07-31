// Multi-selection: `$sel` stays the primary layer, `$more` carries the rest, and the layer
// actions (group, delete) operate on the whole set — grouping several must not move any of them.
import { test, expect } from "vitest";
import { renderDoc } from "$lib/modules/editor/core/render/render";
import {
  isPlaced,
  type GroupLayer,
  type Layer,
  type NodeId,
} from "$lib/modules/editor/core/document/doc";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const layers = () => doc().screens[0].layers;
const selectedIds = () => editorModel.$selected.getState().map((l) => l.id);
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

function boxOf(id: NodeId) {
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  const hits = renderDoc(
    c.getContext("2d")!,
    doc(),
    editorModel.$store.getState(),
    editorModel.$screen.getState(),
    editorModel.$sim.getState(),
  );

  return hits.findLast((h) => h.layer.id === id) ?? null;
}

/** Two positioned widgets off the current screen (the sim clock is frozen, so even a hand's
 *  rotated bbox stays put between measurements). */
const twoWidgets = (): Layer[] =>
  layers()
    .filter((l) => isPlaced(l) && l.x)
    .slice(0, 2);

test("a modifier click adds to the selection and clicking it again removes it", async () => {
  await load("multi-toggle");
  const [a, b] = twoWidgets();

  editorModel.select(a.id);
  editorModel.selectToggled(b.id);
  expect(selectedIds()).toEqual([b.id, a.id]); // last picked is the primary
  expect(editorModel.$sel.getState()).toBe(b.id);

  editorModel.selectToggled(b.id);
  expect(selectedIds()).toEqual([a.id]);

  editorModel.select(a.id); // a plain click drops the extras
  editorModel.selectToggled(b.id);
  editorModel.select(a.id);
  expect(editorModel.$more.getState()).toEqual([]);
});

test("group and delete act on the whole selection", async () => {
  await load("multi-actions");
  const [a, b] = twoWidgets();
  const before = [boxOf(a.id)!, boxOf(b.id)!];

  editorModel.select(a.id);
  editorModel.selectToggled(b.id);
  editorModel.groupRequested();
  const groupId = editorModel.$sel.getState()!;
  const group = byId(groupId) as GroupLayer;

  expect(group.kind).toBe("group");
  expect(editorModel.$more.getState()).toEqual([]);
  // both moved in, and neither moved on screen
  expect(group.children.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
  expect(layers().map((l) => l.id)).not.toContain(a.id);
  expect(boxOf(a.id)).toMatchObject({ x: before[0].x, y: before[0].y });
  expect(boxOf(b.id)).toMatchObject({ x: before[1].x, y: before[1].y });

  editorModel.select(groupId);
  editorModel.ungroupRequested();
  const [c, d] = twoWidgets();
  const n = layers().length;

  editorModel.select(c.id);
  editorModel.selectToggled(d.id);
  editorModel.deleteRequested();
  expect(layers().length).toBe(n - 2);
  // the selection can't point at layers that are gone
  expect(editorModel.$sel.getState()).toBe(null);
});
