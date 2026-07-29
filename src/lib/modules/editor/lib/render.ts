// Watch face emulator: walk the face tree and render onto a 466×466 canvas.
// Tag semantics reversed from a corpus of 100 faces (see docs/cmf-protocol.md §9.6a);
// what each data source feeds lives in sources.ts, ring geometry in arc.ts.
import { TAG, unhex, type Face, type FaceNode, type Resource } from "./wf";
import { SCREEN } from "./screen";
import {
  idValue,
  isVisible,
  metaInfo,
  timeParts,
  withSlotOverrides,
  type Sim,
  type TimeParts,
} from "./sources";
import { bmp, ringBmp, type Ctx, type Drawable, type Hit, type Point, type Size } from "./canvas";
import {
  collectArcsById,
  drawProceduralArc,
  drawSector,
  hexRGB,
  parseArcSpec,
  progressFrac,
  ringRGB,
} from "./arc";

export interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  // byte 8 packs three lv_flex_align_t fields (0 = START, 2 = CENTER; END/SPACE_* never occur
  // in the corpus): main = bits 0-1, track = bits 2-3, cross = bits 4-5. The field order isn't
  // LVGL's own argument order (main, cross, track) — see drawGroup for the evidence that the
  // middle field is the track's placement in the frame, not the children's within the track.
  main: number;
  track: number;
  node: FaceNode;
}

export function parseFrame(node: FaceNode): Frame | null {
  const f = node.subs?.find((s) => s.tag === TAG.frame);

  if (!f) return null;
  const v = unhex(f.hex || "");

  if (v.length < 9) return null;
  // x/y are int16 like a struct's (see wf.ts's i16) — a group may hang off the left/top edge,
  // and reading that back unsigned turned x=-3 into 65533. w/h can't go negative, so they don't.
  const i16 = (o: number) => ((v[o] | (v[o + 1] << 8)) << 16) >> 16;

  return {
    x: i16(0),
    y: i16(2),
    w: v[4] | (v[5] << 8),
    h: v[6] | (v[7] << 8),
    main: v[8] & 3,
    track: (v[8] >> 2) & 3,
    node: f,
  };
}

/** Everything a draw pass carries around. `ctx: null` measures without drawing. */
interface DrawEnv {
  ctx: Ctx | null;
  res: Resource[];
  sim: Sim;
  t: TimeParts;
  hits: Hit[] | null;
  arcs: Map<number, FaceNode>; // screen-wide source id -> progress ring, see digitsOf
}

/** Where a widget goes: at `origin` when a group placed it, else its own x/y plus `offset`. */
interface Place {
  offset?: Point;
  origin?: Point | null;
}

/** A widget resolved down to what every draw function needs. */
interface Target {
  node: FaceNode;
  struct: FaceNode;
  imgs: number[];
  x: number;
  y: number;
}

const ORIGIN: Point = { x: 0, y: 0 };

const measure = (env: DrawEnv, node: FaceNode): Size | null =>
  drawWidget({ ...env, ctx: null, hits: null }, node, { origin: ORIGIN });

function blit(env: DrawEnv, w: Target, b: Drawable): Size {
  if (env.ctx) {
    env.ctx.drawImage(b, w.x, w.y);
    env.hits?.push({ node: w.node, x: w.x, y: w.y, w: b.width, h: b.height });
  }
  return { w: b.width, h: b.height };
}

function drawWidget(env: DrawEnv, node: FaceNode, place: Place = {}): Size | null {
  if (node.tag === TAG.preview || node.tag === TAG.name) return null;
  if (!isVisible(node, env.sim, env.t)) return null;
  if (node.tag === TAG.group) return drawGroup(env, node, place);

  const struct = node.subs?.find((s) => s.tag === TAG.struct);
  // progress rings (0x80/0x81) can be procedural — a short struct form carries no image ref at all
  const isRing = node.tag === 0x80 || node.tag === 0x81;

  if (!struct || (!struct.images && !isRing)) return null;
  const { offset = ORIGIN, origin } = place;
  const w: Target = {
    node,
    struct,
    imgs: struct.images ?? [],
    x: origin ? origin.x : offset.x + (struct.x || 0),
    y: origin ? origin.y : offset.y + (struct.y || 0),
  };

  if (node.tag === TAG.hand) return drawHand(env, w);
  if (isDigitStrip(node, w.imgs)) return drawDigits(env, w);
  if (isRing) return drawRing(env, w);
  if (node.tag === 0x85) return drawSlotPlaceholder(env, w);
  return drawPicked(env, w);
}

function drawHand(env: DrawEnv, w: Target): null {
  const pivot = w.node.subs?.find((s) => s.tag === TAG.pivot);
  const b = bmp(env.res, w.imgs[0]);
  const ctx = env.ctx;

  if (!b || !pivot || !ctx) return null;
  const { id, max } = metaInfo(w.struct);
  // hands on 0x0f/0x12 sweep smoothly on the real device (Elegant_Sweep vs Sundial,
  // verified on hardware) — every other widget/source ticks, see idValue
  const overridden = env.sim.overrides[id] !== undefined && env.sim.overrides[id] !== "";
  const v = (id === 0x0f || id === 0x12) && !overridden ? env.t.s : idValue(id, env.sim, env.t);
  const angle = (v / (max || 60)) * 2 * Math.PI;
  const px = pivot.pivotX!,
    py = pivot.pivotY!;

  ctx.save();
  ctx.translate(w.x + px, w.y + py);
  ctx.rotate(angle);
  ctx.drawImage(b, -px, -py);
  ctx.restore();
  env.hits?.push({ node: w.node, ...rotatedBox(b, px, py, angle, w) });
  return null;
}

/** AABB of the hand image rotated around its pivot. */
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

/** A live number: tagged 0x60, or anything carrying a digit-count byte over a 10-glyph atlas. */
const isDigitStrip = (node: FaceNode, imgs: number[]) =>
  node.tag === TAG.number || (node.subs?.some((s) => s.tag === TAG.fmt) && imgs.length >= 10);

function drawDigits(env: DrawEnv, w: Target): Size {
  const glyph = (ch: string) => bmp(env.res, w.imgs[Number(ch)] ?? w.imgs[0]);
  const str = digitsOf(env, w);
  let width = 0,
    height = 0,
    cx = w.x;

  for (const ch of str) {
    const b = glyph(ch);

    if (!b) continue;
    width += b.width;
    height = Math.max(height, b.height);
    if (env.ctx) {
      env.ctx.drawImage(b, cx, w.y);
      cx += b.width;
    }
  }
  if (env.ctx) env.hits?.push({ node: w.node, x: w.x, y: w.y, w: width, h: height });
  return { w: width, h: height };
}

function digitsOf(env: DrawEnv, w: Target): string {
  const { id } = metaInfo(w.struct);
  const fmt = w.node.subs?.find((s) => s.tag === TAG.fmt);
  const f = fmt ? unhex(fmt.hex!)[0] || 0 : 0;
  const digits = f & 0x1f,
    pad = f & 0x80;
  const ring = env.arcs.get(id);
  const spec = ring ? parseArcSpec(ring) : null;
  // a number sharing its id with a ring shows that ring's percent, not the raw count (see arc.ts)
  const value = spec
    ? Math.round(progressFrac(id, env.sim, env.t, spec) * 100)
    : Math.round(idValue(id, env.sim, env.t));
  const s = String(Math.abs(value));

  return pad && digits ? s.padStart(digits, "0") : s;
}

const ringColor = (struct: FaceNode, sim: Sim) => ringRGB(struct) ?? hexRGB(sim.accentColor);

// 0x81: ring image clipped to a sector by value. 0x80: the same, plus a vertical-bar form
// (a bitmap far taller than it is wide fills bottom-up) and min/max/radius in its 0x5a spec.
// Either tag falls back to a stroked arc when it carries no usable image.
function drawRing(env: DrawEnv, w: Target): Size | null {
  const spec = parseArcSpec(w.node);

  if (!spec) return null;
  const { id, w: mw, h: mh } = metaInfo(w.struct);
  const frac = progressFrac(id, env.sim, env.t, spec);
  const b = ringBmp(env.res, w.imgs[0]);

  if (!b)
    return drawProceduralArc(
      env.ctx,
      spec,
      w.x,
      w.y,
      frac,
      env.hits,
      w.node,
      mw,
      ringColor(w.struct, env.sim),
    );

  const isBar = w.node.tag === 0x80 && b.height > 3 * b.width;

  if (env.ctx && frac > 0.002) {
    if (isBar) {
      env.ctx.save();
      env.ctx.beginPath();
      env.ctx.rect(w.x, w.y + b.height * (1 - frac), b.width, b.height * frac);
      env.ctx.clip();
      env.ctx.drawImage(b, w.x, w.y);
      env.ctx.restore();
    } else {
      drawSector(env.ctx, b, w.x, w.y, spec, frac, mw, mh);
    }
  }
  if (env.ctx) env.hits?.push({ node: w.node, x: w.x, y: w.y, w: b.width, h: b.height });
  return { w: b.width, h: b.height };
}

// 0x85: widget slot — the user assigns one of several metrics to it in the companion app.
// sibling 0x5f: [slotIndex][count][activeIdx][count × metric id][zero padding]. slotIndex is
// this node's 0-based position among sibling 0x85 nodes (verified, zero exceptions in the
// corpus) — presumably how the companion app numbers slots in its settings UI; unused for
// rendering. struct.meta.id is always 0 for this tag across the corpus — it carries no live
// value of its own.
// imgs[1..count] are the per-metric icons shown in the companion app's OWN picker menu —
// confirmed against the real device, they never appear on the watch face itself, in any
// slot state; a sibling Group elsewhere in the tree is the real on-watch visual for the
// selected metric, gated by a bind on id 0x79+slotIndex (see withSlotOverrides — this node's
// activeIdx picks which sibling Group shows, not which image this node draws).
// imgs[0] is the "tap to configure" placeholder shown for every slot on-watch only in the
// widget-edit screen, never during normal time-telling — so this node draws nothing unless
// the sim's showSlotPlaceholders preview toggle is on, in which case it's always imgs[0],
// regardless of activeIdx.
function drawSlotPlaceholder(env: DrawEnv, w: Target): Size | null {
  if (!env.sim.showSlotPlaceholders) return null;
  const b = bmp(env.res, w.imgs[0]);

  return b ? blit(env, w, b) : null;
}

// sub===4 (and, seen only on Elaborate_2, a duplicated sub===3) with a single image: a "−"
// sign glyph for a value that can go negative — no bind sibling gates it, so the device must
// show it purely from the value's sign. Confirmed against Function's baked preview (sub===4
// only there) and Elaborate_2's (sub===4 plus two sub===3 copies of the same glyph): sim.temp
// =25 (positive) bakes with no minus sign at all on either file, not a blank glyph swapped in.
// ponytail: sub===3's own meaning is still unconfirmed (no other corpus face uses it on a
// single-image widget) — treated the same as sub===4 since that's what both real bakes show.
const isHiddenMinusSign = (env: DrawEnv, w: Target) => {
  const { id, sub } = metaInfo(w.struct);

  return (sub === 4 || sub === 3) && w.imgs.length === 1 && idValue(id, env.sim, env.t) >= 0;
};

/** 0x30 and friends: one static image, or one picked by value (7 days / 12 months / AM-PM). */
function drawPicked(env: DrawEnv, w: Target): Size | null {
  if (isHiddenMinusSign(env, w)) return null;
  let idx = 0;

  if (w.imgs.length > 1) {
    const { id } = metaInfo(w.struct);
    // index = value % frame count: lists start at "zero" (months [DEC,JAN..NOV], days [31,1..30])
    const v = Math.floor(idValue(id, env.sim, env.t));

    idx = ((v % w.imgs.length) + w.imgs.length) % w.imgs.length;
  }
  const b = bmp(env.res, w.imgs[idx]);

  return b ? blit(env, w, b) : null;
}

// 0x68: frame 0x48 (x,y,w,h,align) + children. Layout model (reversed from the 101-face
// corpus survey; bytes 9..20 are always zero, byte 8 is the flex alignment — see parseFrame):
// - struct meta w = 0x8000 (AUTO) — packs into a row/column placed per frame.main.
//   Byte 8 was read as a pixel row gap until AEGIS_Ground_Force (a community face, byte 8 = 0
//   on every group) turned up rendering its 200px-wide label frames left-aligned on the real
//   device where we centered them. Every corpus face with AUTO children carries 0x02 or 0x0a
//   there — both main=CENTER, which is why centering-everything held up until now; the gap
//   reading never had evidence of its own (forcing gap=0 moves no corpus preview by a pixel).
//   That file's own baked preview centers the rows, but it isn't a render of the file at all
//   (it also shows a weather icon and a "°F" unit glyph that exist nowhere in its tree) — a
//   third-party authoring tool's mock-up, i.e. exactly the tool whose output the device
//   disagrees with here. Corpus previews are device bakes; that one isn't evidence.
// - a NUMBER at x=0 with a true-AUTO sibling joins that row gapless (its width is dynamic,
//   so it can't carry the 0x8000 marker itself — Function/Elaborate_2 "80%");
// - progress rings (0x80/0x81) — struct x/y is already screen-absolute; a 0 on either axis
//   means "center me in the frame on that axis";
// - anything else — y is always literal frame.y + y (no vertical centering exists:
//   Dichotomy's ring labels at authored y=0/70); x=0 centers horizontally, nonzero is
//   literal frame.x + x (Progress_Day dot circle).
// ponytail: exact firmware direction rule for AUTO rows is unverified — guessed from the
// 0x8000 children's own x/y spread (bigger vertical spread = column); flip to a real flag
// if one turns up.
function drawGroup(env: DrawEnv, node: FaceNode, place: Place): Size | null {
  const fr = parseFrame(node);

  if (!fr) return null;
  const { offset = ORIGIN, origin } = place;
  const x = origin ? origin.x : offset.x + fr.x;
  const y = origin ? origin.y : offset.y + fr.y;
  const kids = (node.subs || []).filter((s) => s.tag !== TAG.frame && s.tag !== TAG.bind);
  const structOf = (k: FaceNode) => k.subs?.find((s) => s.tag === TAG.struct);
  const isTrueAuto = (k: FaceNode) => {
    const st = structOf(k);

    return st != null && metaInfo(st).w === 0x8000;
  };
  // a NUMBER's rendered width is inherently dynamic (digit count varies), so it doesn't carry
  // its own 0x8000 marker — but it still needs to pack into the same auto row as a genuine
  // auto sibling, not sit flush at the frame origin on its own axis (Function's "80%": the "%"
  // image is 0x8000-marked, the number beside it is meta.w=0 at the same x=0,y=0 origin).
  // ponytail: only confirmed on this one battery-percent group — gate on a real auto sibling
  // existing at all, so a lone origin-positioned number elsewhere keeps its prior behavior.
  const hasTrueAutoSibling = kids.some(isTrueAuto);
  // y isn't required — Elaborate_2's own battery tile pairs a NUMBER at a real y=46 with a
  // meta.w=0x8000 "%" glyph left at y=0 (an unused placeholder there, apparently: Function's
  // confirmed case has both at the same nonzero y instead), so matching y isn't reliable
  // either. Only x needs to read 0; the row's cross-axis position is resolved via
  // numberRowStruct below rather than trusted from the auto sibling's own y.
  const isAuto = (k: FaceNode) => {
    if (isTrueAuto(k)) return true;
    if (!hasTrueAutoSibling || k.tag !== TAG.number) return false;
    const st = structOf(k);

    return st != null && !st.x;
  };
  const sizes = kids.map((k) => (isAuto(k) ? measure(env, k) : null));
  const shown = sizes.filter((z): z is Size => Boolean(z));

  // only genuinely 0x8000-flagged structs feed direction inference — a hugged NUMBER's own
  // y (see isAuto above) may be real placement data (Elaborate_2) or may not even be read by
  // the firmware at all; either way it isn't a reliable row-direction signal by itself, and
  // mixing it in previously misread Elaborate_2's horizontal "80%" pairing as a vertical stack
  // (NUMBER y=46 vs "%" y=0 spread > 0).
  const autoStructs = kids
    .map((k, i) => (sizes[i] && isTrueAuto(k) ? structOf(k) : null))
    .filter((s): s is FaceNode => Boolean(s));
  const spread = (vals: number[]) => (vals.length ? Math.max(...vals) - Math.min(...vals) : 0);
  const vertical =
    autoStructs.length > 1 &&
    spread(autoStructs.map((s) => s.y || 0)) > spread(autoStructs.map((s) => s.x || 0));

  // a hugged NUMBER's own y, when nonzero, is real placement data (see isAuto) that beats
  // generic frame-centering for the whole packed row — confirmed needed on Elaborate_2's
  // battery tile, where the packed row must land at y=46 inside a 160-tall frame shared with
  // an unrelated "Battery" label at y=82, not centered across the full 160px height. Function's
  // own confirmed case has this NUMBER at y=0, so it's naturally skipped (falsy) and keeps its
  // prior (already-correct) frame-centered behavior untouched.
  const numberRowStruct = kids
    .filter((k, i) => Boolean(sizes[i]) && !isTrueAuto(k) && k.tag === TAG.number)
    .map(structOf)[0];
  const rowCross = !vertical && numberRowStruct?.y ? y + numberRowStruct.y : null;

  const total = shown.reduce((s, z) => s + (vertical ? z.h : z.w), 0);
  // frame.w/h === 0 on the packing axis means "auto-size to content" (seen on Function's
  // icon+digits+degree temperature row: frame w=0, 4 auto children) — centering
  // against a literal 0 shoved the whole packed row left by half its own width. Clamp the
  // available length to at least `total` so an auto-sized frame just starts flush at the
  // frame origin instead of drifting negative.
  const mainAvail = Math.max(vertical ? fr.h : fr.w, total);
  // ponytail: only START/CENTER exist in the corpus — END (1) and SPACE_* (3) would need
  // their own arm here, add one if a face ever carries them.
  let main = (vertical ? y : x) + (fr.main ? (mainAvail - total) / 2 : 0);
  // Cross axis: children sit at the START of their track, and the track is what gets centered
  // in the frame (fr.track). Centering each child on its own instead is indistinguishable
  // whenever the children are all the same height — which every corpus row is, e.g. Function's
  // "24%" battery row (two 26px children in a 48px frame, both readings put them at y=221).
  // A row of *unequal* children separates the two, and a real device disagreed with per-child
  // centering there: a Pebble blue 116px digit next to the 144px colon that fills the group's
  // 144px frame renders at the frame top on the watch (track 144 = frame 144, no slack to
  // center), not 14px down as per-child centering would have it.
  const trackSize = shown.reduce((m, z) => Math.max(m, vertical ? z.w : z.h), 0);
  const cross = (vertical ? x : y) + (fr.track ? ((vertical ? fr.w : fr.h) - trackSize) / 2 : 0);

  if (env.ctx) {
    kids.forEach((k, i) => {
      const z = sizes[i];

      if (z) {
        const pos = vertical ? { x: cross, y: main } : { x: main, y: rowCross ?? cross };

        drawWidget(env, k, { origin: pos });
        main += vertical ? z.h : z.w;
      } else if (!isAuto(k)) {
        drawBoxedChild(env, k, fr, x, y);
      }
    });
    env.hits?.push({ node, x, y, w: fr.w, h: fr.h });
  }
  // along the packing axis, an auto-sized frame (fr.w/h===0) reports its declared 0 here
  // unless we report the clamped mainAvail instead — otherwise a parent measuring this group
  // as one of ITS OWN boxed children would center it as if it had no content at all
  // (Function's temperature tile: the icon+digits+degree row measured as width 0,
  // over-centering it within the outer 128px tile).
  return { w: vertical ? fr.w : mainAvail, h: vertical ? mainAvail : fr.h };
}

/** A group child that isn't part of the packed auto row: positioned, centered or both. */
function drawBoxedChild(env: DrawEnv, k: FaceNode, fr: Frame, x: number, y: number) {
  // progress rings (0x80/0x81) inside a group carry already-absolute struct x/y —
  // confirmed on Combo, where a grouped ring's x/y is byte-identical to an ungrouped
  // sibling ring at the same screen position. Adding the frame origin on top (as the
  // other non-auto widgets need) pushes them off-canvas.
  const isRing = k.tag === 0x80 || k.tag === 0x81;
  // ...except when one axis reads a literal 0 — same "unset, center me" signal as the
  // boxed non-ring case below, just never seen on a ring until Elaborate_2's calorie/
  // steps widget-slot ring (frame 160x160, ring image also 160x160 meant to exactly
  // fill it): a raw x=0 left it flush against the canvas's left edge instead of
  // centered. Combo/Function's rings all carry real nonzero x AND y (the Combo evidence
  // above), so this only fires on the axis that's actually 0.
  const ringStruct = isRing ? k.subs?.find((s) => s.tag === TAG.struct) : null;
  const ringMeta = ringStruct ? metaInfo(ringStruct) : null;
  const ringPos =
    ringMeta && (!ringStruct!.x || !ringStruct!.y)
      ? {
          x: ringStruct!.x || x + (fr.w - ringMeta.w) / 2,
          y: ringStruct!.y || y + (fr.h - ringMeta.h) / 2,
        }
      : null;
  // any other non-auto child: y is always literal (frame.y + y — Dichotomy's ring
  // labels sit at authored y=0/y=70, never vertically centered; a real offset like
  // Progress_Day's dot circle is nonzero and kept). x===0 means "not positioned,
  // center me horizontally" — confirmed on Combo's weekday/day, Function's tiles,
  // Elaborate_2's Battery label and Glare_2's stacked kcal block, all x=0 + real y.
  // The declared meta.w isn't the widget's pixel width, so measure the drawn size.
  // Applies to nested Group children too (Function's icon+digits+degree row) via localOrigin.
  const o = isRing ? null : localOrigin(k);
  const measured = o && !o.x ? measure(env, k) : null;
  const pos = ringPos ?? (measured ? { x: x + (fr.w - measured.w) / 2, y: y + o!.y } : null);

  drawWidget(env, k, { offset: isRing ? ORIGIN : { x, y }, origin: pos });
}

// a nested Group child (e.g. the icon+digits+degree auto-row inside Function's temperature
// tile) has no TAG.struct of its own — its position is its OWN frame's x/y instead. Read
// either uniformly so a Group child can be measured/centered the same way a struct-bearing
// one is.
function localOrigin(k: FaceNode): Point | null {
  const st = k.subs?.find((s) => s.tag === TAG.struct);

  if (st) return { x: st.x || 0, y: st.y || 0 };
  if (k.tag === TAG.group) {
    const fr = parseFrame(k);

    return fr ? { x: fr.x, y: fr.y } : null;
  }
  return null;
}

/** Draw a screen; returns hitboxes in draw order (topmost last). */
export function render(ctx: Ctx, face: Face, screenTag: number, sim: Sim): Hit[] {
  const hits: Hit[] = [];
  const screen = face.screens.find((s) => s.tag === screenTag) || face.screens[0];
  const top = screen?.subs || [];
  const env: DrawEnv = {
    ctx,
    res: face.resources,
    sim: withSlotOverrides(top, sim),
    t: timeParts(sim),
    hits,
    arcs: collectArcsById(top),
  };

  ctx.clearRect(0, 0, SCREEN, SCREEN);
  for (const node of top) drawWidget(env, node);
  return hits;
}
