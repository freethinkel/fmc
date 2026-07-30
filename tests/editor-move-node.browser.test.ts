// moveRequested: reorders a layer among its siblings (layer order = draw order).
import { test, expect } from "vitest";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

test("moveRequested reorders siblings and undo restores the order", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "move-test" });
  });
  const order = () => editorModel.$doc.getState()!.screens[0].layers.map((l) => l.id);
  const before = order();
  const [a, b] = before;

  expect(before.length).toBeGreaterThan(2);

  editorModel.moveRequested({ id: a, target: b, after: true }); // drop a below b
  expect(order().indexOf(a)).toBe(order().indexOf(b) + 1);

  const moved = order();

  // a screen is not a layer, so it can't be a move target — nothing happens
  editorModel.moveRequested({
    id: a,
    target: editorModel.$doc.getState()!.screens[0].id,
    after: true,
  });
  expect(order()).toEqual(moved);

  editorModel.undo();
  expect(order()).toEqual(before);
});
