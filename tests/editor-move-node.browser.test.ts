// moveNode: reorders a node among its siblings (subs order = draw order).
import { test, expect } from "vitest";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

test("moveNode reorders siblings and undo restores the order", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "move-test" });
  });
  const scr = editorModel.$editor.getState().face!.screens[0];
  const subs = scr.subs!;
  const [a, b] = subs;
  const before = subs.map((n) => n.tag);

  expect(subs.length).toBeGreaterThan(2);

  editorModel.moveNode(a, b, true); // drop a below b
  expect(subs.indexOf(a)).toBe(subs.indexOf(b) + 1);

  // reordering across parents is rejected — the screen itself is not a sibling
  editorModel.moveNode(a, scr, true);
  expect(subs.indexOf(a)).toBe(subs.indexOf(b) + 1);

  editorModel.undo();
  expect(editorModel.$editor.getState().face!.screens[0].subs!.map((n) => n.tag)).toEqual(before);
});
