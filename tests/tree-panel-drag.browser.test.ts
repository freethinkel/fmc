// Real browser drag & drop on the layers tree — guards the DnD wiring, not just moveNode.
import { afterEach, test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import TreePanel from "$lib/modules/editor/components/TreePanel.svelte";
import { editorModel } from "$lib/modules/editor/model";
import type { Layer } from "$lib/modules/editor/core/document/doc";
import { along, centre, touch, touchScreen } from "./touch";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

// every test opens the face afresh, so none depends on what an earlier one left behind
async function open() {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "drag-test" });
  });
}

const layers = (): readonly Layer[] => editorModel.$doc.getState()!.screens[0].layers;

// the tree with the screen's accordion open; rows[0] is the screen itself, rows[1..] its layers,
// topmost first (reversed layer order)
async function tree() {
  render(TreePanel);
  await new Promise((r) => setTimeout(r, 50));
  if (document.querySelectorAll(".node-row").length < 2)
    document.querySelector(".chevron")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await new Promise((r) => setTimeout(r, 50));
  const rows = [...document.querySelectorAll<HTMLElement>(".node-row")];

  expect(rows.length).toBeGreaterThan(3);
  return rows;
}

const grip = (row: HTMLElement) => row.querySelector(".grip")!;

afterEach(() => touchScreen(false));

test("dragging a layer row onto its sibling reorders the tree", async () => {
  await open();
  const rows = await tree();
  // layer ids — sibling kinds repeat, so identity is what tells the order apart
  const before = layers().map((l) => l.id);
  const dragged = before.at(-1)!; // rows[1]
  const target = before.at(-3)!; // rows[3]

  // a mouse drags the whole row, so there's no grip in the way
  expect(getComputedStyle(grip(rows[1])).display).toBe("none");
  await userEvent.dragAndDrop(rows[1], rows[3]);

  const after = layers().map((l) => l.id);

  expect(after).not.toEqual(before);
  expect(after.length).toBe(before.length);
  // dropped onto the target row, so it lands next to it in subs
  expect(Math.abs(after.indexOf(dragged) - after.indexOf(target))).toBe(1);
});

test("a touch drag from a row's grip reorders the tree", async () => {
  await open();
  await touchScreen(true);
  const rows = await tree();
  const before = layers().map((l) => l.id);
  const dragged = before.at(-1)!; // rows[1]
  const target = before.at(-3)!; // rows[3]

  // centre() throws unless the grip is really there to put a finger on
  await touch("touchStart", [{ id: 1, ...centre(grip(rows[1])) }]);
  await touch("touchMove", [{ id: 1, ...along(rows[3], 0.1) }]);
  expect(rows[3].classList.contains("drop-before")).toBe(true);
  await touch("touchEnd");

  const after = layers().map((l) => l.id);

  // dropped on the target row's top edge, i.e. right above it: next after it in draw order
  expect(after.indexOf(dragged)).toBe(after.indexOf(target) + 1);
  expect(document.querySelector(".drop-before, .drop-after, .dragging")).toBeNull();
});

test("a second finger lifting doesn't drop, and a cancelled touch moves nothing", async () => {
  await open();
  await touchScreen(true);
  const rows = await tree();
  const before = layers().map((l) => l.id);
  const at = centre(grip(rows[1]));
  const drag = { id: 1, ...at };

  await touch("touchStart", [drag]);
  await touch("touchMove", [{ ...drag, ...along(rows[3], 0.1) }]);
  // the second finger lands on the same grip, the one place its up event would reach
  await touch("touchStart", [
    { ...drag, ...along(rows[3], 0.1) },
    { id: 2, ...at },
  ]);
  await touch("touchEnd", [{ id: 2, ...at }]); // finger 2 lifts
  expect(layers().map((l) => l.id)).toEqual(before);
  expect(rows[3].classList.contains("drop-before")).toBe(true); // still dragging

  // the browser takes the gesture over (a system swipe, say): the drag ends without a drop
  await touch("touchCancel");
  expect(layers().map((l) => l.id)).toEqual(before);
  expect(document.querySelector(".drop-before, .drop-after, .dragging")).toBeNull();
});

test("a touch drag onto a group's middle drops into the group", async () => {
  await open();
  editorModel.select(layers().at(-2)!.id);
  editorModel.groupRequested();
  await touchScreen(true);
  const rows = await tree();
  const group = layers().find((l) => l.kind === "group")!;
  const dragged = layers().at(-1)!.id;
  const groupRow = rows.find((r) => r.dataset.id === group.id)!;

  expect(dragged).not.toBe(group.id);
  await touch("touchStart", [{ id: 1, ...centre(grip(rows[1])) }]);
  await touch("touchMove", [{ id: 1, ...along(groupRow, 0.5) }]);
  expect(groupRow.classList.contains("drop-into")).toBe(true);
  await touch("touchEnd");

  const g = layers().find((l) => l.id === group.id)!;

  expect(g.kind === "group" && g.children.map((c) => c.id)).toContain(dragged);
  expect(layers().map((l) => l.id)).not.toContain(dragged);
});
