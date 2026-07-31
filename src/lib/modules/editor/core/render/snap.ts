// Drag snapping: the moved box's start/centre/end lines are pulled onto the same three lines
// of every other hitbox, plus the canvas edges and centre. Pure — the canvas page owns when
// to collect targets and how to draw the guides.
// ponytail: proximity snap only, no equal-spacing / distance guides — add if anyone asks.
import type { Layer, NodeId } from "../document/doc";
import { CENTER, SCREEN } from "./screen";
import type { LayerHit } from "./canvas";

export interface SnapTargets {
  xs: number[];
  ys: number[];
}

const idsUnder = (l: Layer, out = new Set<NodeId>()): Set<NodeId> => {
  out.add(l.id);
  if (l.kind === "group") l.children.forEach((c) => idsUnder(c, out));
  if (l.kind === "raw") l.children?.forEach((c) => idsUnder(c, out));
  return out;
};

/** Lines the drag can snap to: every other hitbox's edges/centre + the canvas's own. */
export function snapTargets(hits: readonly LayerHit[], dragged: readonly Layer[]): SnapTargets {
  // a group carries its children's boxes along with it, and a multi-selection every member's
  const skip = new Set<NodeId>();

  for (const l of dragged) idsUnder(l, skip);
  const xs = [0, CENTER, SCREEN],
    ys = [0, CENTER, SCREEN];

  for (const h of hits) {
    if (skip.has(h.layer.id)) continue;
    xs.push(h.x, h.x + h.w / 2, h.x + h.w);
    ys.push(h.y, h.y + h.h / 2, h.y + h.h);
  }
  return { xs, ys };
}

/** Nearest target line to this box's start/centre/end, or null if nothing is within `tol`. */
export function snapAxis(
  lo: number,
  size: number,
  targets: readonly number[],
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
