// The editor chrome drawn over a rendered screen: selection boxes, corner and rotate handles,
// a hand's pivot cross and the snap guides. Pure — the page hands in the hitboxes renderDoc
// returned plus its own drag state. The handle geometry lives here too, because where a handle
// is drawn is where shared/drag.ts hit-tests it.
import { framesOf, isPlaced, type Doc, type Layer, type NodeId } from "../document/doc";
import { containerOrigin, findLayer, parentOf } from "../document/edits";
import type { LayerHit, Point, Size } from "./canvas";
import { CENTER, SCREEN } from "./screen";

export type Box = Point & Size;
export type Guides = { x: number[]; y: number[] };

export const HANDLE = 10;
export const CORNERS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
] as const;

/** Pull a handle back inside the round screen, so a corner off the disc stays grabbable. */
export const onDisc = (x: number, y: number): Point => {
  const dx = x - CENTER,
    dy = y - CENTER,
    d = Math.hypot(dx, dy),
    max = CENTER - HANDLE;

  return d <= max ? { x, y } : { x: CENTER + (dx / d) * max, y: CENTER + (dy / d) * max };
};

const hasArt = (l: Layer): boolean =>
  framesOf(l).length > 0 || (l.kind === "group" && l.children.some(hasArt));
export const isBareRing = (l: Layer): boolean => l.kind === "ring" && !l.frames.length;
export const resizable = (l: Layer | null): boolean =>
  Boolean(l) && (hasArt(l!) || isBareRing(l!)) && !l!.locked;
export const rotatable = (l: Layer | null): boolean =>
  Boolean(l) && framesOf(l!).length > 0 && !l!.locked;
export const rotateHandle = (h: LayerHit): Point => onDisc(h.x + h.w / 2, h.y - HANDLE * 1.5);

export const hitOf = (hits: readonly LayerHit[], id: NodeId | null) =>
  id ? hits.findLast((h) => h.layer.id === id) : undefined;

/** Where a placed layer that drew nothing this frame would sit — still worth a dashed box. */
export function ghostBox(doc: Doc | null, id: NodeId | null) {
  const l = id && doc ? findLayer(doc, id) : null;

  if (!l || !isPlaced(l) || !l.meta.w || !l.meta.h) return null;
  const o = containerOrigin(doc!, parentOf(doc!, l.id)?.id ?? null);

  return {
    x: o.x + l.x,
    y: o.y + l.y,
    w: l.meta.w,
    h: l.meta.h,
    ghost: true as const,
  };
}

export const boxOf = (doc: Doc | null, hits: readonly LayerHit[], id: NodeId | null) =>
  hitOf(hits, id) ?? ghostBox(doc, id);

function outline(ctx: CanvasRenderingContext2D, b: Box, color: string, ghost = false) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.setLineDash(ghost ? [2, 5] : [6, 4]);
  ctx.strokeRect(b.x - 1, b.y - 1, b.w + 2, b.h + 2);
  ctx.restore();
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  doc: Doc,
  hits: readonly LayerHit[],
  id: NodeId | null,
  color: string,
) {
  const h = hitOf(hits, id);

  if (!h) {
    const g = ghostBox(doc, id);

    if (g) outline(ctx, g, color, true);
    return;
  }
  outline(ctx, h, color);
  ctx.save();

  if (h.layer.locked) {
    ctx.restore();
    return;
  }
  if (resizable(h.layer)) {
    ctx.setLineDash([]);
    ctx.fillStyle = color;
    for (const [cx, cy] of CORNERS) {
      const p = onDisc(h.x + cx * h.w, h.y + cy * h.h);

      ctx.fillRect(p.x - HANDLE / 2, p.y - HANDLE / 2, HANDLE, HANDLE);
    }
  }
  // round, and off the box, so it doesn't read as a fifth corner
  if (rotatable(h.layer)) {
    const p = rotateHandle(h);

    ctx.setLineDash([]);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, HANDLE / 2, 0, 2 * Math.PI);
    ctx.fill();
  }
  // a hand rotates around x+pivot — mark that point, it's what the user aims when centring
  if (h.layer.kind === "hand") {
    const px = h.layer.x + h.layer.pivotX,
      py = h.layer.y + h.layer.pivotY;

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(px - 8, py);
    ctx.lineTo(px + 8, py);
    ctx.moveTo(px, py - 8);
    ctx.lineTo(px, py + 8);
    ctx.stroke();
  }
  ctx.restore();
}

function drawGuides(
  ctx: CanvasRenderingContext2D,
  guides: Guides,
  style: { color: string; width: number },
) {
  if (!guides.x.length && !guides.y.length) return;
  ctx.save();
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.width;
  ctx.beginPath();
  for (const x of guides.x) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, SCREEN);
  }
  for (const y of guides.y) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(SCREEN, y + 0.5);
  }
  ctx.stroke();
  ctx.restore();
}

export interface Overlay {
  doc: Doc;
  hits: readonly LayerHit[];
  sel: NodeId | null;
  selected: readonly Layer[];
  guides: Guides;
  /** the selection colour, `--color-selection` */
  color: string;
  guide: { color: string; width: number };
}

export function drawOverlay(ctx: CanvasRenderingContext2D, o: Overlay) {
  // extra picks get a plain box; the primary one carries the handles and the pivot cross
  for (const l of o.selected.slice(1)) {
    const b = boxOf(o.doc, o.hits, l.id);

    if (b) outline(ctx, b, o.color, "ghost" in b);
  }
  drawSelection(ctx, o.doc, o.hits, o.sel, o.color);
  drawGuides(ctx, o.guides, o.guide);
}
