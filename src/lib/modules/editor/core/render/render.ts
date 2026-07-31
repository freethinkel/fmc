// The renderer, over the Doc model. Same pixels as `render.ts` — that equivalence is what
// `render-doc.browser.test.ts` pins down, fixture by fixture — but reading decoded layers
// instead of re-deriving everything from TLV children on every frame.
//
// Every device-verified layout rule lives in render.ts's comments; this file deliberately
// doesn't restate them, so there's one place to correct when the next face disagrees.
import {
  framesOf,
  ringColorOf,
  type Doc,
  type GroupLayer,
  type ImageId,
  type Layer,
  type NodeId,
} from "../document/doc";
import {
  idValue,
  timeParts,
  withSlotOverridesDoc,
  type Sim,
  type TimeParts,
} from "../document/sources";
import {
  bmpOf,
  ringBmpOf,
  type Ctx,
  type Drawable,
  type ImageStore,
  type LayerHit,
  type Point,
  type Size,
} from "./canvas";
import { drawProceduralArc, drawSector, hexRGB, progressFrac } from "./arc";
import { CENTER, SCREEN } from "./screen";

/** One layer drawn at a scale it doesn't have yet — what a corner drag shows while it lasts.
 *  Rescaling the assets per pointermove costs a decode per frame; this costs a matrix. `ax`/`ay`
 *  is the point that stays put: the anchored corner, or a hand's rotation centre. */
export interface ResizePreview {
  id: NodeId;
  kw: number;
  kh: number;
  ax: number;
  ay: number;
}

interface Env {
  ctx: Ctx | null;
  store: ImageStore;
  sim: Sim;
  t: TimeParts;
  hits: LayerHit[] | null;
  preview?: ResizePreview | null;
  /** screen-wide source id -> ring, so a number sharing an id shows that ring's percent */
  arcs: Map<number, Extract<Layer, { kind: "ring" }>>;
}

interface Place {
  offset?: Point;
  origin?: Point | null;
}

const ORIGIN: Point = { x: 0, y: 0 };

const visible = (l: Layer, sim: Sim, t: TimeParts): boolean => {
  if (l.hidden) return false; // editor-only, never written to the file
  const eq = l.conditions.filter((c) => c.op === "eq" || c.op === "noData");

  if (eq.length && !eq.some((c) => idValue(c.source, sim, t) === c.value)) return false;
  return l.conditions.every((c) =>
    c.op === "ne"
      ? idValue(c.source, sim, t) !== c.value
      : c.op === "gte"
        ? idValue(c.source, sim, t) >= c.value
        : c.op === "lte"
          ? idValue(c.source, sim, t) <= c.value
          : true,
  );
};

const measure = (env: Env, l: Layer): Size | null =>
  drawLayer({ ...env, ctx: null, hits: null }, l, { origin: ORIGIN });

function blit(env: Env, l: Layer, b: Drawable, x: number, y: number): Size {
  if (env.ctx) {
    env.ctx.drawImage(b, x, y);
    env.hits?.push({ layer: l, x, y, w: b.width, h: b.height });
  }
  return { w: b.width, h: b.height };
}

function drawLayer(env: Env, l: Layer, place: Place = {}): Size | null {
  const pv = env.preview?.id === l.id ? env.preview : null;

  if (!pv) return drawPlain(env, l, place);
  // scale the drawn pixels around the anchor, then move the hits the same way — the layer's own
  // draw code stays unaware it's being previewed
  const from = env.hits?.length ?? 0;

  env.ctx?.save();
  env.ctx?.translate(pv.ax, pv.ay);
  env.ctx?.scale(pv.kw, pv.kh);
  env.ctx?.translate(-pv.ax, -pv.ay);
  const size = drawPlain(env, l, place);

  env.ctx?.restore();
  for (let i = from; i < (env.hits?.length ?? 0); i++) {
    const h = env.hits![i];

    env.hits![i] = {
      ...h,
      x: pv.ax + (h.x - pv.ax) * pv.kw,
      y: pv.ay + (h.y - pv.ay) * pv.kh,
      w: h.w * pv.kw,
      h: h.h * pv.kh,
    };
  }
  return size && { w: size.w * pv.kw, h: size.h * pv.kh };
}

function drawPlain(env: Env, l: Layer, place: Place = {}): Size | null {
  if (!visible(l, env.sim, env.t)) return null;
  if (l.kind === "group") return drawGroup(env, l, place);
  if (l.kind === "raw") return null; // preview/name nodes aren't drawn

  const frames = framesOf(l);

  if (!frames.length && l.kind !== "ring") return null;
  const { offset = ORIGIN, origin } = place;
  const x = origin ? origin.x : offset.x + l.x;
  const y = origin ? origin.y : offset.y + l.y;

  if (l.kind === "hand") return drawHand(env, l, frames, x, y);
  if (l.kind === "ring") return drawRing(env, l, frames, x, y);
  if (l.kind === "number") return drawDigits(env, l, frames, x, y);
  if (l.kind === "slot") {
    if (!env.sim.showSlotPlaceholders) return null;
    const b = bmpOf(env.store, frames[0]);

    return b ? blit(env, l, b, x, y) : null;
  }
  return drawPicked(env, l, frames, x, y);
}

function drawHand(
  env: Env,
  l: Extract<Layer, { kind: "hand" }>,
  frames: readonly ImageId[],
  x: number,
  y: number,
): null {
  const b = bmpOf(env.store, frames[0]);
  const ctx = env.ctx;

  if (!b || !ctx) return null;
  const { source, max } = l.meta;
  const overridden = env.sim.overrides[source] !== undefined && env.sim.overrides[source] !== "";
  const v =
    (source === 0x0f || source === 0x12) && !overridden ? env.t.s : idValue(source, env.sim, env.t);
  const angle = (v / (max || 60)) * 2 * Math.PI;

  ctx.save();
  ctx.translate(x + l.pivotX, y + l.pivotY);
  ctx.rotate(angle);
  ctx.drawImage(b, -l.pivotX, -l.pivotY);
  ctx.restore();
  env.hits?.push({ layer: l, ...rotatedBox(b, l.pivotX, l.pivotY, angle, { x, y }) });
  return null;
}

function rotatedBox(b: Drawable, px: number, py: number, angle: number, at: Point): Point & Size {
  const cs = Math.cos(angle),
    sn = Math.sin(angle);
  const pts = [
    [0, 0],
    [b.width, 0],
    [0, b.height],
    [b.width, b.height],
  ].map(([x, y]) => [(x - px) * cs - (y - py) * sn, (x - px) * sn + (y - py) * cs]);
  const xs = pts.map((p) => p[0]),
    ys = pts.map((p) => p[1]);

  return {
    x: at.x + px + Math.min(...xs),
    y: at.y + py + Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };
}

function drawDigits(
  env: Env,
  l: Extract<Layer, { kind: "number" }>,
  frames: readonly ImageId[],
  x: number,
  y: number,
): Size {
  const ring = env.arcs.get(l.meta.source);
  const value = ring
    ? Math.round(progressFrac(l.meta.source, env.sim, env.t, ring.spec) * 100)
    : Math.round(idValue(l.meta.source, env.sim, env.t));
  const s = String(Math.abs(value));
  const str = l.padZero && l.digits ? s.padStart(l.digits, "0") : s;
  let width = 0,
    height = 0,
    cx = x;

  for (const ch of str) {
    const b = bmpOf(env.store, frames[Number(ch)] ?? frames[0]);

    if (!b) continue;
    width += b.width;
    height = Math.max(height, b.height);
    if (env.ctx) {
      env.ctx.drawImage(b, cx, y);
      cx += b.width;
    }
  }
  if (env.ctx) env.hits?.push({ layer: l, x, y, w: width, h: height });
  return { w: width, h: height };
}

function drawRing(
  env: Env,
  l: Extract<Layer, { kind: "ring" }>,
  frames: readonly ImageId[],
  x: number,
  y: number,
): Size | null {
  const frac = progressFrac(l.meta.source, env.sim, env.t, l.spec);
  const b = ringBmpOf(env.store, frames[0]);

  if (!b) {
    // drawProceduralArc's own hit list is FaceNode-shaped, so it's told to record nothing and
    // the layer hit is pushed here instead — same box it would have produced
    const size = drawProceduralArc(
      env.ctx,
      l.spec,
      x,
      y,
      frac,
      null,
      undefined as never,
      l.meta.w,
      ringColorOf(l.meta) ?? hexRGB(env.sim.accentColor),
    );
    const r = size.w / 2;
    const cx = r >= 230 ? CENTER : x + r,
      cy = r >= 230 ? CENTER : y + r;

    if (env.ctx) env.hits?.push({ layer: l, x: cx - r, y: cy - r, w: size.w, h: size.h });
    return size;
  }

  const isBar = l.tag === 0x80 && b.height > 3 * b.width;

  if (env.ctx && frac > 0.002) {
    if (isBar) {
      env.ctx.save();
      env.ctx.beginPath();
      env.ctx.rect(x, y + b.height * (1 - frac), b.width, b.height * frac);
      env.ctx.clip();
      env.ctx.drawImage(b, x, y);
      env.ctx.restore();
    } else {
      drawSector(env.ctx, b, x, y, l.spec, frac, l.meta.w, l.meta.h);
    }
  }
  if (env.ctx) env.hits?.push({ layer: l, x, y, w: b.width, h: b.height });
  return { w: b.width, h: b.height };
}

function drawPicked(
  env: Env,
  l: Extract<Layer, { kind: "image" }>,
  frames: readonly ImageId[],
  x: number,
  y: number,
): Size | null {
  const { source, sub } = l.meta;

  // sub 3/4 with a single frame is a "−" glyph the device only shows for a negative value
  if ((sub === 4 || sub === 3) && frames.length === 1 && idValue(source, env.sim, env.t) >= 0)
    return null;
  let idx = 0;

  if (frames.length > 1) {
    const v = Math.floor(idValue(source, env.sim, env.t));

    idx = ((v % frames.length) + frames.length) % frames.length;
  }
  const b = bmpOf(env.store, frames[idx]);

  return b ? blit(env, l, b, x, y) : null;
}

function drawGroup(env: Env, g: GroupLayer, place: Place): Size | null {
  const fr = g.frame;
  const { offset = ORIGIN, origin } = place;
  const x = origin ? origin.x : offset.x + fr.x;
  const y = origin ? origin.y : offset.y + fr.y;
  const kids = g.children;
  const isTrueAuto = (k: Layer) => k.kind !== "group" && k.kind !== "raw" && k.meta.auto;
  const hasTrueAutoSibling = kids.some(isTrueAuto);
  const isAuto = (k: Layer) => {
    if (isTrueAuto(k)) return true;
    if (!hasTrueAutoSibling || k.kind !== "number") return false;
    return !k.x;
  };
  const sizes = kids.map((k) => (isAuto(k) ? measure(env, k) : null));
  const shown = sizes.filter((z): z is Size => Boolean(z));
  const autoPlaced = kids
    .map((k, i) => (sizes[i] && isTrueAuto(k) && k.kind !== "group" && k.kind !== "raw" ? k : null))
    .filter((k): k is Exclude<Layer, GroupLayer | Extract<Layer, { kind: "raw" }>> => Boolean(k));
  const spread = (vals: number[]) => (vals.length ? Math.max(...vals) - Math.min(...vals) : 0);
  const vertical =
    autoPlaced.length > 1 &&
    spread(autoPlaced.map((s) => s.y)) > spread(autoPlaced.map((s) => s.x));
  const numberRow = kids.filter(
    (k, i) => Boolean(sizes[i]) && !isTrueAuto(k) && k.kind === "number",
  )[0] as Extract<Layer, { kind: "number" }> | undefined;
  const rowCross = !vertical && numberRow?.y ? y + numberRow.y : null;

  const total = shown.reduce((s, z) => s + (vertical ? z.h : z.w), 0);
  const mainAvail = Math.max(vertical ? fr.h : fr.w, total);
  let main = (vertical ? y : x) + (fr.main ? (mainAvail - total) / 2 : 0);
  const trackSize = shown.reduce((m, z) => Math.max(m, vertical ? z.w : z.h), 0);
  const cross = (vertical ? x : y) + (fr.track ? ((vertical ? fr.w : fr.h) - trackSize) / 2 : 0);

  if (env.ctx) {
    kids.forEach((k, i) => {
      const z = sizes[i];

      if (z) {
        const pos = vertical ? { x: cross, y: main } : { x: main, y: rowCross ?? cross };

        drawLayer(env, k, { origin: pos });
        main += vertical ? z.h : z.w;
      } else if (!isAuto(k)) {
        drawBoxedChild(env, k, fr, x, y);
      }
    });
    env.hits?.push({ layer: g, x, y, w: fr.w, h: fr.h });
  }
  return { w: vertical ? fr.w : mainAvail, h: vertical ? mainAvail : fr.h };
}

function drawBoxedChild(env: Env, k: Layer, fr: GroupLayer["frame"], x: number, y: number) {
  const isRing = k.kind === "ring";
  const ringPos =
    isRing && (!k.x || !k.y)
      ? { x: k.x || x + (fr.w - k.meta.w) / 2, y: k.y || y + (fr.h - k.meta.h) / 2 }
      : null;
  const o = isRing ? null : localOrigin(k);
  const measured = o && !o.x ? measure(env, k) : null;
  const pos = ringPos ?? (measured ? { x: x + (fr.w - measured.w) / 2, y: y + o!.y } : null);

  drawLayer(env, k, { offset: isRing ? ORIGIN : { x, y }, origin: pos });
}

function localOrigin(k: Layer): Point | null {
  if (k.kind === "group") return { x: k.frame.x, y: k.frame.y };
  if (k.kind === "raw") return null;
  return { x: k.x, y: k.y };
}

function collectArcs(
  layers: readonly Layer[],
  out = new Map<number, Extract<Layer, { kind: "ring" }>>(),
) {
  for (const l of layers) {
    if (l.kind === "ring" && l.meta.source && !out.has(l.meta.source)) out.set(l.meta.source, l);
    if (l.kind === "group") collectArcs(l.children, out);
    if (l.kind === "raw" && l.children) collectArcs(l.children, out);
  }
  return out;
}

/** Draw a screen; returns hitboxes in draw order (topmost last). */
export function renderDoc(
  ctx: Ctx,
  doc: Doc,
  store: ImageStore,
  screen: "main" | "aod",
  sim: Sim,
  preview?: ResizePreview | null,
): LayerHit[] {
  const hits: LayerHit[] = [];
  const scr = doc.screens.find((s) => s.kind === screen) ?? doc.screens[0];
  const layers = scr?.layers ?? [];
  const env: Env = {
    ctx,
    store,
    sim: withSlotOverridesDoc(layers, sim),
    t: timeParts(sim),
    hits,
    arcs: collectArcs(layers),
    preview,
  };

  ctx.clearRect(0, 0, SCREEN, SCREEN);
  for (const l of layers) drawLayer(env, l);
  return hits;
}
