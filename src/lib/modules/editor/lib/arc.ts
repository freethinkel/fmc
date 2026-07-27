// Progress rings: the 0x5a/0x5b arc spec that 0x80/0x81 widgets carry, and the two ways they
// are drawn — a ring image clipped to a sector, or a stroked arc when there is no image.
import { TAG, unhex, type FaceNode } from "./wf";
import { goalOf, idValue, metaInfo, type Sim, type TimeParts } from "./sources";
import type { Ctx, Drawable, Hit, Size } from "./canvas";

export interface ArcSpec {
  kind: number; // 0x5a procedural, 0x5b image-clipped
  min: number;
  max: number;
  start: number; // degrees, 0 = 12 o'clock, positive clockwise (see drawSector)
  end: number;
  width: number;
  radius: number; // 0x5a only — 0x5b takes its radius from the clipped image
}

/** 0x5a/0x5b body: min i32 ‖ max i32 ‖ start i16 (0.1°) ‖ end i16 ‖ width u16 ‖ radius u16. */
export function parseArcSpec(node: FaceNode): ArcSpec | null {
  const sp = node.subs?.find((n) => n.tag === 0x5a || n.tag === 0x5b);

  if (!sp) return null;
  const v = unhex(sp.hex || "");

  if (v.length < 14) return null;
  const i32 = (o: number) => v[o] | (v[o + 1] << 8) | (v[o + 2] << 16) | (v[o + 3] << 24);
  const i16 = (o: number) => {
    const x = v[o] | (v[o + 1] << 8);

    return x & 0x8000 ? x - 0x10000 : x;
  };

  return {
    kind: sp.tag,
    min: i32(0),
    max: i32(4),
    start: i16(8) / 10,
    end: i16(10) / 10,
    width: v[12] | (v[13] << 8),
    radius: sp.tag === 0x5a && v.length >= 16 ? v[14] | (v[15] << 8) : 0,
  };
}

/** How full the ring is, 0..1. */
export function progressFrac(id: number, sim: Sim, t: TimeParts, spec: ArcSpec): number {
  let v = idValue(id, sim, t);
  // goal rings count as percent of the goal (steps/kcal/stands), firmware divides on its own.
  // Battery (0x24/0x30) is already a percentage — no goal, so it falls through unscaled.
  const goal = spec.max <= 100 && v > spec.max ? goalOf(id, sim) : undefined;

  if (goal) v = (v / Number(goal)) * 100;
  if (spec.max === 3600) v *= 60; // scales in seconds of the hour

  return Math.max(0, Math.min(1, (v - spec.min) / (spec.max - spec.min || 1)));
}

// ponytail: image-backed arcs (0x5b) start at 12 o'clock, not the 3-o'clock/LVGL convention
// documented for procedural arcs (0x5a) — measured against Function's battery ring (id 0x24):
// our gap centered ~90° clockwise of the baked preview's at start=0. Confirmed again on Combo's
// 3 nested procedural goal rings, whose gaps must all land upper-left to look concentric.
const radians = (deg: number) => ((deg - 90) * Math.PI) / 180;
const sweepOf = (spec: ArcSpec) => ((spec.end - spec.start) * Math.PI) / 180;

/** 0x5b (and image-backed 0x5a): draw the ring bitmap clipped to the filled sector. */
export function drawSector(
  ctx: Ctx,
  b: Drawable,
  x: number,
  y: number,
  spec: ArcSpec,
  frac: number,
  mw = 0,
  mh = 0,
) {
  // meta.w/h is the widget's full circle diameter; the bitmap may be cropped to the arc's
  // bounding box (Dichotomy's 284x214 half-rings on a 284x284 circle). The sector pivot is
  // the CIRCLE's center, and a cropped bitmap anchors to the side of the circle its arc
  // midpoint lies on (top/bottom via cos, left/right via sin — angles are 12-o'clock-relative).
  // An uncropped (or oversized, e.g. Sport_Mode's 132px-on-128px) bitmap just centers on the
  // circle. Falls back to bitmap size when meta carries no w/h.
  const W = mw || b.width,
    H = mh || b.height;
  const mid = (((spec.start + spec.end) / 2) * Math.PI) / 180;
  const bx = x + (b.width >= W ? (W - b.width) / 2 : Math.sin(mid) > 0 ? W - b.width : 0);
  const by = y + (b.height >= H ? (H - b.height) / 2 : Math.cos(mid) > 0 ? 0 : H - b.height);
  const cx = x + W / 2,
    cy = y + H / 2;
  const a0 = radians(spec.start);
  const sweep = sweepOf(spec);

  ctx.save();
  if (frac < 0.999 || Math.abs(sweep) < 2 * Math.PI - 0.01) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.hypot(b.width, b.height), a0, a0 + sweep * frac, sweep < 0);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(b, bx, by);
  ctx.restore();
}

/** No ring image (short struct form with no image ref, or an undecoded bitmap) — stroke the arc. */
export function drawProceduralArc(
  ctx: Ctx | null,
  spec: ArcSpec,
  x: number,
  y: number,
  frac: number,
  hits: Hit[] | null,
  node: FaceNode,
  w = 0,
  rgb: [number, number, number] | null = null,
): Size {
  // radius: meta.w/h (the widget's own diameter) when known, spec.radius (0x5a only)
  // as an override, 60 as a last-resort guess for older/short structs with w=0
  const r = spec.radius || (w ? Math.round(w / 2) : 60);
  const cx = r >= 230 ? 233 : x + r,
    cy = r >= 230 ? 233 : y + r;
  const a0 = radians(spec.start);
  const sweep = sweepOf(spec);
  // no explicit meta color (byte 7 !== 1, e.g. the plain steps ring) — falls back to a
  // plain orange rather than white when there's no sim.accentColor either; confirmed
  // orange on Combo's ungrouped goal ring (Activity_Mood's identical byte pattern baked
  // blue on its own device — genuinely undecidable from the file, see the test comment).
  const [cr, cg, cb] = rgb ?? [255, 44, 0];
  const lw = spec.width || 6;
  // canvas strokes center on the path — drawing at r would bleed lw/2 past the widget's own
  // radius (meta.w/2), making the ring visibly bigger than its bounding box. Inset so the
  // OUTER edge lands on r instead, matching the baked preview's ring size.
  const ringR = r - lw / 2;

  if (ctx) {
    ctx.save();
    ctx.lineWidth = lw;
    // butt, not round — the baked preview cuts the arc's start/end with a flat radial
    // edge (visible on Combo's 270°-sweep goal rings), not a rounded stroke cap
    ctx.lineCap = "butt";
    ctx.strokeStyle = `rgba(${cr},${cg},${cb},0.03)`;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, a0, a0 + sweep, sweep < 0);
    ctx.stroke();
    if (frac > 0.002) {
      ctx.strokeStyle = `rgb(${cr},${cg},${cb})`;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, a0, a0 + sweep * frac, sweep < 0);
      ctx.stroke();
    }
    ctx.restore();
    hits?.push({ node, x: cx - r, y: cy - r, w: 2 * r, h: 2 * r });
  }
  return { w: 2 * r, h: 2 * r };
}

// ring stroke color for imageless progress rings: meta bytes 4-6 are an explicit RGB,
// gated by byte 7 === 1 (byte 7 === 4 on the plain steps ring means "no explicit color").
// Confirmed against Combo/SportPulse/ActiveTrio: the same metric id carries the same RGB
// across all three independent files (id 0x26 -> fb471f, id 0x6c -> e3e1e6).
export function ringRGB(struct: FaceNode): [number, number, number] | null {
  const m = unhex(struct.meta || "");

  return m.length >= 14 && m[7] === 1 ? [m[4], m[5], m[6]] : null;
}

// byte 7 !== 1 (no baked RGB) doesn't mean "no color" — it means "follow the device's own
// accent/theme setting", which isn't in the file at all: confirmed by Combo's plain steps
// ring baking orange while Activity_Mood's identical-pattern ring bakes blue — two different
// devices' accent choices, not two different renderers. Route it through sim.accentColor,
// same as hand/image sentinel recolor, so it stays consistent with the live editor's picker.
export function hexRGB(hex: string | null): [number, number, number] | null {
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);

  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// goal-relative ids (steps/calories "slot" aliases) read as a raw count everywhere, EXCEPT
// when a NUMBER shares the screen with a progress ring bound to the same id — there it must
// show that ring's own percent-of-goal (e.g. "80%"), not the raw counter, or it overflows the
// ring's digit budget (fmt caps it at ~3 digits) and no longer matches the design. The ring and
// its number aren't nested together (each is positioned independently by x/y), so the lookup
// is screen-wide, not just among the number's immediate siblings.
export function collectArcsById(nodes: FaceNode[]): Map<number, FaceNode> {
  const out = new Map<number, FaceNode>();
  const walk = (n: FaceNode) => {
    if (n.tag === 0x80 || n.tag === 0x81) {
      const struct = n.subs?.find((s) => s.tag === TAG.struct);
      const { id } = struct ? metaInfo(struct) : { id: 0 };

      if (id && !out.has(id)) out.set(id, n);
    }
    n.subs?.forEach(walk);
  };

  nodes.forEach(walk);
  return out;
}
