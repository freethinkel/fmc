// What the keyboard-only bindings do to the model: select-all, walking siblings, stepping in and
// out of a group, and nudging the draw order. The keymap itself is covered by editor-shortcuts.
import { test, expect } from "vitest";
import type { GroupLayer, NodeId } from "$lib/modules/editor/core/document/doc";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const layers = () => doc().screens[0].layers;
const sel = () => editorModel.$sel.getState();
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
};

test("select-all takes every top-level layer of the open screen", async () => {
  await load("kbd-all");
  editorModel.selectAllRequested();
  expect(editorModel.$selected.getState().map((l) => l.id)).toEqual(layers().map((l) => l.id));
});

test("Tab walks the siblings and wraps at the ends", async () => {
  await load("kbd-tab");
  const row = layers();

  editorModel.select(row[0].id);
  editorModel.siblingSelected(1);
  expect(sel()).toBe(row[1].id);

  editorModel.siblingSelected(-1);
  editorModel.siblingSelected(-1);
  expect(sel()).toBe(row.at(-1)!.id); // wrapped past the front

  editorModel.siblingSelected(1);
  expect(sel()).toBe(row[0].id);
});

test("Enter steps into a group and ⇧Enter back out", async () => {
  await load("kbd-nest");
  const first = layers()[0].id;

  editorModel.select(first);
  editorModel.groupRequested();
  const groupId = sel()!;

  editorModel.nestSelected(1);
  expect(sel()).toBe((byId(groupId) as GroupLayer).children[0].id);
  editorModel.nestSelected(-1);
  expect(sel()).toBe(groupId);
  editorModel.nestSelected(-1); // already at the top — nowhere to go
  expect(sel()).toBe(groupId);
});

test("⌘] / ⌘[ move one step along the row, and the ends cost no undo", async () => {
  await load("kbd-order");
  const row = layers();
  const [a, b] = [row[0].id, row[1].id];

  editorModel.select(a);
  editorModel.orderMoved(1);
  expect(
    layers()
      .map((l) => l.id)
      .slice(0, 2),
  ).toEqual([b, a]);
  editorModel.orderMoved(-1);
  expect(
    layers()
      .map((l) => l.id)
      .slice(0, 2),
  ).toEqual([a, b]);

  const undos = editorModel.$undoN.getState();

  editorModel.orderMoved(-1); // already first
  expect(editorModel.$undoN.getState()).toBe(undos);
});
