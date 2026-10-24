// A corner drag keeps the opposite corner anchored and lands as one rescale of the first frame.
// Runs in the "unit" project — shared/drag.ts is the geometry editor.svelte only wires up.
import { test, expect } from "vitest";
import { handleAt, resizeRequest, resizeTo, startResize } from "$lib/modules/editor/shared/drag";
import type { LayerHit } from "$lib/modules/editor/core/render/canvas";
import type { Layer, NodeId } from "$lib/modules/editor/core/document/doc";

/** An image layer at 100,100 whose first frame is half its 40x20 box. */
const layer = {
  id: "a" as NodeId,
  kind: "image",
  x: 100,
  y: 100,
  frames: ["f"],
} as unknown as Layer;
const hit: LayerHit = { layer, x: 100, y: 100, w: 40, h: 20 };

test("dragging the top-left corner doubles the box around the bottom-right one", () => {
  const c = handleAt({ x: 100, y: 100 }, hit);

  expect(c).toEqual({ cx: 0, cy: 0 });
  const z = resizeTo(
    startResize(hit, c!, { x: 100, y: 100 }, { w: 20, h: 10 }),
    { x: 60, y: 80 },
    false,
  );

  expect([z.gx, z.gy, z.gw, z.gh]).toEqual([60, 80, 80, 40]);
  expect(resizeRequest(z)).toEqual({
    to: "image",
    p: { layer: "a", w: 40, h: 20, at: { x: 60, y: 80 } },
  });
  // aspect lock takes the larger factor on both axes
  const k = resizeTo(
    startResize(hit, c!, { x: 100, y: 100 }, { w: 20, h: 10 }),
    { x: 60, y: 110 },
    true,
  );

  expect([k.gw, k.gh]).toEqual([80, 40]);
});
