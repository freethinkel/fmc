// Real browser drag & drop on the layers tree — guards the DnD wiring, not just moveNode.
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import TreePanel from "$lib/modules/editor/components/TreePanel.svelte";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

test("dragging a layer row onto its sibling reorders the tree", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "drag-test" });
  });
  render(TreePanel);
  // layer ids — sibling kinds repeat, so identity is what tells the order apart
  const before = editorModel.$doc.getState()!.screens[0].layers.map((l) => l.id);

  document.querySelector(".chevron")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); // expand
  await new Promise((r) => setTimeout(r, 50));
  const rows = document.querySelectorAll(".node-row");

  // rows[0] is the screen itself; rows[1..] are its layers, topmost first (reversed layer order)
  expect(rows.length).toBeGreaterThan(3);

  const dragged = before.at(-1)!; // rows[1]
  const target = before.at(-3)!; // rows[3]

  await userEvent.dragAndDrop(rows[1] as HTMLElement, rows[3] as HTMLElement);

  const after = editorModel.$doc.getState()!.screens[0].layers.map((l) => l.id);

  expect(after).not.toEqual(before);
  expect(after.length).toBe(before.length);
  // dropped onto the target row, so it lands next to it in subs
  expect(Math.abs(after.indexOf(dragged) - after.indexOf(target))).toBe(1);
});

test("a touch drag from a row's grip reorders the tree too", async () => {
  // the previous test left a document loaded
  render(TreePanel);
  document.querySelector(".chevron")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  const before = editorModel.$doc.getState()!.screens[0].layers.map((l) => l.id);
  const rows = [...document.querySelectorAll<HTMLElement>(".node-row")];
  const dragged = before.at(-1)!; // rows[1]
  const target = before.at(-3)!; // rows[3]
  const r = rows[3].getBoundingClientRect();
  const at = { clientX: r.left + r.width / 2, clientY: r.top + r.height * 0.1 };
  const touch = (type: string, init: PointerEventInit = {}) =>
    new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: 7, ...init });

  rows[1].querySelector(".grip")!.dispatchEvent(touch("pointerdown"));
  window.dispatchEvent(touch("pointermove", at));
  await new Promise((r) => setTimeout(r, 0));
  expect(rows[3].classList.contains("drop-before")).toBe(true);
  window.dispatchEvent(touch("pointerup", at));

  const after = editorModel.$doc.getState()!.screens[0].layers.map((l) => l.id);

  // dropped on the target row's top edge, i.e. right above it: next after it in draw order
  expect(after.indexOf(dragged)).toBe(after.indexOf(target) + 1);
});
