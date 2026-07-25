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
  const subs = editorModel.$editor.getState().face!.screens[0].subs!;
  const before = [...subs]; // node refs — sibling tags repeat, so identity is what tells order apart

  document.querySelector(".chevron")!.dispatchEvent(new MouseEvent("click", { bubbles: true })); // expand
  await new Promise((r) => setTimeout(r, 50));
  const rows = document.querySelectorAll(".node-row");

  // rows[0] is the screen itself; rows[1..] are its children, topmost layer first (reversed subs)
  expect(rows.length).toBeGreaterThan(3);

  const dragged = before.at(-1)!; // rows[1]
  const target = before.at(-3)!; // rows[3]

  await userEvent.dragAndDrop(rows[1] as HTMLElement, rows[3] as HTMLElement);

  const after = editorModel.$editor.getState().face!.screens[0].subs!;

  expect(after).not.toEqual(before);
  expect(after.length).toBe(before.length);
  // dropped onto the target row, so it lands next to it in subs
  expect(Math.abs(after.indexOf(dragged) - after.indexOf(target))).toBe(1);
});
