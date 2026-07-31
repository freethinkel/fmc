// Snapping is what a drag lands on, so the two rules that matter: only lines within the
// threshold pull, and the nearest one wins across all three edges. Runs in the "unit" project.
import { describe, test, expect } from "vitest";
import { snapAxis, snapTargets } from "$lib/modules/editor/core/render/snap";
import { SNAP_THRESHOLD } from "$lib/modules/editor/shared/constants";
import type { LayerHit } from "$lib/modules/editor/core/render/canvas";
import type { GroupLayer, Layer, NodeId } from "$lib/modules/editor/core/document/doc";

const hit = (layer: Layer, x: number, y: number, w: number, h: number): LayerHit => ({
  layer,
  x,
  y,
  w,
  h,
});

/** The bits of a layer snapping actually reads: an id, and children for a group. */
const leaf = (id: string): Layer => ({ id: id as NodeId, kind: "image" }) as unknown as Layer;
const group = (id: string, children: Layer[]): GroupLayer =>
  ({ id: id as NodeId, kind: "group", children }) as unknown as GroupLayer;

const TOL = SNAP_THRESHOLD;

describe("snapAxis", () => {
  test("nothing within tolerance — no pull", () => {
    expect(snapAxis(100, 40, [200], TOL)).toBeNull();
    expect(snapAxis(100, 40, [100 + TOL], TOL)).toBeNull(); // exactly tol away is already too far
  });

  test("centre snaps to the canvas centre", () => {
    // box 100..140, centre 120; target 122 is 2 away from the centre, 18 from the near edge
    expect(snapAxis(100, 40, [122], TOL)).toEqual({ corr: 2, line: 122 });
  });

  test("nearest of several targets wins, edges included", () => {
    // left edge 100 is 1 from 101; centre 120 is 3 from 123 — the edge is closer
    expect(snapAxis(100, 40, [101, 123], TOL)).toEqual({ corr: 1, line: 101 });
    // right edge 140 pulls backwards
    expect(snapAxis(100, 40, [138], TOL)).toEqual({ corr: -2, line: 138 });
  });

  test("butts up against a neighbour: right edge to that box's left edge", () => {
    const other = snapTargets([hit(leaf("a"), 200, 0, 60, 40)], [leaf("dragged")]);

    // box 158..198 lands flush at 160..200 — the neighbour's left edge, not a shared centre
    expect(snapAxis(158, 40, other.xs, TOL)).toEqual({ corr: 2, line: 200 });
  });
});

describe("snapTargets", () => {
  const child = leaf("child");
  const dragged = group("dragged", [child]);
  const other = leaf("other");

  test("canvas lines always, other boxes' edges/centre, never the dragged subtree", () => {
    const t = snapTargets(
      [hit(dragged, 10, 10, 100, 100), hit(child, 20, 20, 20, 20), hit(other, 200, 300, 60, 40)],
      [dragged],
    );

    expect(t.xs).toEqual([0, 233, 466, 200, 230, 260]);
    expect(t.ys).toEqual([0, 233, 466, 300, 320, 340]);
  });
});
