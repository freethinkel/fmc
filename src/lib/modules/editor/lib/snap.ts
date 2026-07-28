// Drag snapping: the moved box's start/centre/end lines are pulled onto the same three lines
// of every other hitbox, plus the canvas edges and centre. Pure — the canvas page owns when
// to collect targets and how to draw the guides.
// ponytail: proximity snap only, no equal-spacing / distance guides — add if anyone asks.
import type { Hit } from "./canvas";
import type { FaceNode } from "./wf";

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

const nodesUnder = (n: FaceNode, out = new Set<FaceNode>()): Set<FaceNode> => {
  out.add(n);
  n.subs?.forEach((s) => nodesUnder(s, out));
  return out;
};

/** Lines the drag can snap to: every other hitbox's edges/centre + the canvas's own. */
export function snapTargets(hits: Hit[], dragged: FaceNode): SnapTargets {
  const skip = nodesUnder(dragged); // a group carries its children's boxes along with it
  const xs = [0, 233, 466],
    ys = [0, 233, 466];

  for (const h of hits) {
    if (skip.has(h.node)) continue;
    xs.push(h.x, h.x + h.w / 2, h.x + h.w);
    ys.push(h.y, h.y + h.h / 2, h.y + h.h);
  }
  return { xs, ys };
}

/** Nearest target line to this box's start/centre/end, or null if nothing is within `tol`. */
export function snapAxis(
  lo: number,
  size: number,
  targets: number[],
  tol: number,
): { corr: number; line: number } | null {
  let best = tol,
    hit: { corr: number; line: number } | null = null;

  for (const e of [lo, lo + size / 2, lo + size]) {
    for (const t of targets) {
      if (Math.abs(t - e) < best) {
        best = Math.abs(t - e);
        hit = { corr: t - e, line: t };
      }
    }
  }
  return hit;
}
