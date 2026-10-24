// Canvas gesture geometry: what a pointer drag, a corner pull, the rotate handle or an arrow key
// does to a layer's box. Nothing here imports Svelte or the model — the page reads the pointer,
// calls these, and fires the model event the result names.
import { framesOf, type Doc, type Layer, type NodeId } from "../core/document/doc";
import type { LayerHit, Point, Size } from "../core/render/canvas";
import type { ResizePreview } from "../core/render/render";
import {
  CORNERS,
  HANDLE,
  boxOf,
  isBareRing,
  onDisc,
  resizable,
  rotatable,
  rotateHandle,
  type Box,
  type Guides,
} from "../core/render/overlay";
import { snapAxis, type SnapTargets } from "../core/render/snap";

export type DragItem = { layer: Layer; x0: number; y0: number };

export type Rz = {
  layer: Layer;
  dirX: number;
  dirY: number;
  ax: number;
  ay: number;
  w0: number;
  h0: number;
  x0: number;
  y0: number;
  bx: number;
  by: number;
  gx: number;
  gy: number;
  gw: number;
  gh: number;
  rw0: number; // the asset's size when the drag started — the target scales off it
  rh0: number;
  dx0: number; // anchor -> grab point. The scale is measured against THIS, not against the box:
  dy0: number; // a handle drawn off the true corner (see onDisc) would otherwise jump on move 1
  started: boolean; // the pointer actually moved — until then there's nothing to preview
};

export type Rot = {
  layer: Layer;
  cx: number;
  cy: number;
  a0: number;
  deg: number;
  started: boolean;
};
const ROT_STEP = 15; // ⇧ snap, the usual increment

/** One of the three resize events, with its payload — the page fires whichever this names. */
export type ResizeRequest =
  | { to: "group" | "ring"; p: { layer: NodeId; kw: number; kh: number; at?: Point } }
  | { to: "image"; p: { layer: NodeId; w: number; h: number; at?: Point } };

export function dragItem(l: Layer): DragItem | null {
  if (l.locked) return null;
  if (l.kind === "group") return { layer: l, x0: l.frame.x, y0: l.frame.y };
  return l.kind === "raw" ? null : { layer: l, x0: l.x, y0: l.y };
}

/** The `layerPatched` payload that puts a dragged item at x/y. */
export const movePatch = (it: DragItem, x: number, y: number) => ({
  id: it.layer.id,
  patch: (it.layer.kind === "group"
    ? { frame: { ...it.layer.frame, x, y } }
    : { x, y }) as Partial<Layer>,
});

export const firstAsset = (doc: Doc | null, l: Layer | null) => {
  const ids = l && l.kind !== "group" ? framesOf(l) : [];

  return ids.length ? doc?.images.get(ids[0]) : undefined;
};

export const onRotateHandle = (p: Point, h: LayerHit) => {
  const c = rotateHandle(h);

  return rotatable(h.layer) && Math.hypot(p.x - c.x, p.y - c.y) <= HANDLE;
};

export const handleAt = (p: Point, h: LayerHit) => {
  for (const [cx, cy] of CORNERS) {
    const c = onDisc(h.x + cx * h.w, h.y + cy * h.h);

    if (Math.abs(p.x - c.x) <= HANDLE && Math.abs(p.y - c.y) <= HANDLE) return { cx, cy };
  }
  return null;
};

/** The cursor a hover over the selected box asks for. */
export function cursorAt(p: Point, h: LayerHit) {
  const c = handleAt(p, h);

  if (c) return c.cx === c.cy ? "nwse-resize" : "nesw-resize";
  return onRotateHandle(p, h) ? "grab" : "";
}

export function startRotate(h: LayerHit, p: Point): Rot {
  const cx = h.x + h.w / 2,
    cy = h.y + h.h / 2;

  return { layer: h.layer, cx, cy, a0: Math.atan2(p.y - cy, p.x - cx), deg: 0, started: false };
}

export function rotateTo(r: Rot, p: Point, snap: boolean): Rot {
  const d = ((Math.atan2(p.y - r.cy, p.x - r.cx) - r.a0) * 180) / Math.PI;

  return { ...r, deg: snap ? Math.round(d / ROT_STEP) * ROT_STEP : Math.round(d), started: true };
}

/** A corner grab `c` on `h` at `p`; `r0` is the first asset's size (a group: the box itself). */
export function startResize(h: LayerHit, c: { cx: number; cy: number }, p: Point, r0: Size): Rz {
  const origin = dragItem(h.layer);
  const hand = h.layer.kind === "hand" ? h.layer : null;
  const ax = hand ? hand.x + hand.pivotX : c.cx ? h.x : h.x + h.w;
  const ay = hand ? hand.y + hand.pivotY : c.cy ? h.y : h.y + h.h;

  return {
    started: false,
    rw0: r0.w,
    rh0: r0.h,
    layer: h.layer,
    dirX: c.cx,
    dirY: c.cy,
    ax,
    ay,
    w0: h.w,
    h0: h.h,
    x0: origin?.x0 ?? 0,
    y0: origin?.y0 ?? 0,
    bx: h.x,
    by: h.y,
    gx: h.x,
    gy: h.y,
    gw: h.w,
    gh: h.h,
    dx0: Math.max(1, Math.abs(p.x - ax)),
    dy0: Math.max(1, Math.abs(p.y - ay)),
  };
}

/** The box with the pointer at `p`; `aspect` keeps both factors equal. */
export function resizeTo(z: Rz, p: Point, aspect: boolean): Rz {
  const rx = Math.abs(p.x - z.ax) / z.dx0,
    ry = Math.abs(p.y - z.ay) / z.dy0;
  const locked = isBareRing(z.layer) || aspect;
  const [sw, sh] = locked ? [Math.max(rx, ry), Math.max(rx, ry)] : [rx, ry];
  const gw = Math.max(1, Math.round(z.w0 * sw)),
    gh = Math.max(1, Math.round(z.h0 * sh));

  return {
    ...z,
    gw,
    gh,
    gx: z.dirX ? z.ax : z.ax - gw,
    gy: z.dirY ? z.ay : z.ay - gh,
    started: true, // from here the canvas draws the preview (resizePreview)
  };
}

/** The whole drag as one rescale. */
export function resizeRequest(z: Rz): ResizeRequest {
  const kw = z.gw / z.w0,
    kh = z.gh / z.h0;
  const pinned = z.layer.kind === "hand";
  const layer = z.layer.id;

  const at = pinned
    ? undefined
    : {
        x: z.x0 + Math.round(z.gx - z.bx),
        y: z.y0 + Math.round(z.gy - z.by),
      };

  if (z.layer.kind === "group") return { to: "group", p: { layer, kw, kh, at } };
  if (isBareRing(z.layer)) return { to: "ring", p: { layer, kw, kh, at } };
  return {
    to: "image",
    p: { layer, w: Math.round(z.rw0 * kw), h: Math.round(z.rh0 * kh), at },
  };
}

export const resizePreview = (rz: Rz | null, rot: Rot | null): ResizePreview | null =>
  rz && rz.started
    ? {
        id: rz.layer.id,
        kw: rz.gw / rz.w0,
        kh: rz.gh / rz.h0,
        ax: rz.ax,
        ay: rz.ay,
      }
    : rot && rot.started
      ? {
          id: rot.layer.id,
          kw: 1,
          kh: 1,
          ax: rot.cx,
          ay: rot.cy,
          deg: rot.deg,
        }
      : null;

/** A pointer drag from `from` to `p`, snapping `snap.box` onto the targets when given. One delta
 *  for the whole drag, so a multi-selection keeps its shape while it snaps. */
export function dragDelta(
  from: Point,
  p: Point,
  snap: { box: Box; targets: SnapTargets; tol: number } | null,
) {
  let dx = Math.round(p.x - from.x),
    dy = Math.round(p.y - from.y);
  const guides: Guides = { x: [], y: [] };

  if (snap) {
    const sx = snapAxis(snap.box.x + dx, snap.box.w, snap.targets.xs, snap.tol);
    const sy = snapAxis(snap.box.y + dy, snap.box.h, snap.targets.ys, snap.tol);

    if (sx) {
      dx += Math.round(sx.corr);
      guides.x = [sx.line];
    }
    if (sy) {
      dy += Math.round(sy.corr);
      guides.y = [sy.line];
    }
  }
  return { dx, dy, guides };
}

/** An arrow-key resize of the primary selection by dw/dh canvas px, or null if it can't. */
export function nudgeRequest(
  doc: Doc | null,
  hits: readonly LayerHit[],
  l: Layer | undefined,
  dw: number,
  dh: number,
): ResizeRequest | null {
  if (!l || !resizable(l)) return null;
  const b = boxOf(doc, hits, l.id);

  if (!b || b.w < 1 || b.h < 1) return null;
  const kw = Math.max(1, b.w + dw) / b.w,
    kh = Math.max(1, b.h + dh) / b.h;

  if (l.kind === "group") return { to: "group", p: { layer: l.id, kw, kh } };
  if (isBareRing(l)) return { to: "ring", p: { layer: l.id, kw, kh } };
  const r0 = firstAsset(doc, l);

  if (!r0) return null;
  return {
    to: "image",
    p: {
      layer: l.id,
      w: Math.max(1, Math.round(r0.w * kw)),
      h: Math.max(1, Math.round(r0.h * kh)),
    },
  };
}
