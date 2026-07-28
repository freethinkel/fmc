// Drag snapping through the real pointer path: snap.ts is unit tested on its own, the wiring
// here (targets taken on pointerdown, tolerance converted from screen px) is what breaks.
import { test, expect } from "vitest";
import { render as mount } from "vitest-browser-svelte";
import { EditorPage } from "$lib/modules/editor/pages";
import { editorModel } from "$lib/modules/editor/model";
import { render } from "$lib/modules/editor/lib/render";
import { structOf } from "$lib/modules/editor/lib/tree";
import { TAG } from "$lib/modules/editor/lib/wf";
import type { Hit } from "$lib/modules/editor/lib/canvas";
import { SNAP_THRESHOLD } from "$lib/modules/editor/shared/constants";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const boxes = (): Hit[] => {
  const s = editorModel.$editor.getState();
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  return render(c.getContext("2d")!, s.face!, TAG.main, s.sim);
};

test("dragging a widget snaps its edge onto another widget's edge", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "snap-test" });
  });
  // frozen clock: the hands are what this face is made of, and their boxes are rotated AABBs
  editorModel.simPatched({
    live: false,
    time: new Date("2026-01-09T10:09:30").getTime(),
  });
  mount(EditorPage);
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  const canvas = document.querySelector("canvas.canvas") as HTMLCanvasElement;

  canvas.setPointerCapture = () => {}; // synthetic events have no active pointer to capture

  const hits = boxes();
  const me = hits[hits.length - 1]; // topmost — pointerdown picks it wherever they overlap
  const other = hits.find((h) => h.node.tag === 0x60)!; // the one small widget on this face

  expect(structOf(me.node)?.x).toBeTypeOf("number");

  const r = canvas.getBoundingClientRect();
  const k = r.width / 466; // canvas units -> client px
  const tol = (SNAP_THRESHOLD * 466) / r.width;
  const off = 3; // inside the snap window, so the drag must land flush instead

  expect(off).toBeLessThan(tol);
  const dx = other.x + off - me.x; // aim my left edge just short of the other box's left edge
  const at = (cx: number, cy: number) => ({
    clientX: r.left + cx * k,
    clientY: r.top + cy * k,
    pointerId: 1,
    bubbles: true,
  });
  const start = { x: me.x + me.w / 2, y: me.y + me.h / 2 };

  canvas.dispatchEvent(new PointerEvent("pointerdown", at(start.x, start.y)));
  expect(editorModel.$editor.getState().sel).toBe(me.node);
  canvas.dispatchEvent(new PointerEvent("pointermove", at(start.x + dx, start.y)));
  const moved = boxes().findLast((h) => h.node === me.node)!;

  // x/y are integers, so a fractional box (a rotated hand) lands within a unit of the line
  expect(Math.abs(moved.x - other.x)).toBeLessThan(1);

  // …and the guide is on screen while the pointer is still down
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const px = canvas.getContext("2d")!.getImageData(Math.round(other.x), 0, 1, 466).data;
  // magenta-ish rather than exactly GUIDE_COLOR: the guide is drawn over the face and may carry
  // alpha, so what identifies it is red+blue far above green
  let magenta = false;

  for (let i = 0; i < px.length; i += 4) {
    if (px[i] > 120 && px[i + 2] > 120 && px[i] - px[i + 1] > 90 && px[i + 2] - px[i + 1] > 90)
      magenta = true;
  }

  expect(magenta).toBe(true);
  canvas.dispatchEvent(new PointerEvent("pointerup", at(start.x + dx, start.y)));
});
