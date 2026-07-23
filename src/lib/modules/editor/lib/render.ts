// Watch face emulator: walk the face.json tree and render onto a 466×466 canvas.
// Tag/id semantics reversed from a corpus of 100 faces (see docs/cmf-protocol.md §9.6a).
import { TAG, unhex, type Face, type FaceNode, type Resource } from './wf';

// Known data sources (meta byte 9). "?" = guess, not confirmed.
// 0x1c/0x24/0x48/0x76/0x8b — labels corrected against Function's widget-slot menu (companion-app
// icons: flame/calories, standing figure/stands, lightning/battery, road/distance, cloud-sun/aqi).
// idValue() below matches for 0x24 (battery) and 0x48 (stands); 0x8b still returns steps (its
// pre-existing bucket) and 0x1c/0x76 aren't cased at all (default 0) — no face in the corpus
// binds a live widget to them directly, so only their widget-slot menu label was confirmed.
export const ID_LABELS: Record<number, string> = {
  0x01: 'hour', 0x04: 'minute?', 0x07: 'hour (24h)',
  0x08: 'hour tens', 0x09: 'hour ones', 0x0a: 'hour (hand)', 0x0b: 'minute',
  0x0c: 'min tens', 0x0d: 'min ones', 0x0e: 'minute (hand)', 0x0f: 'second',
  0x12: 'second', 0x13: 'AM/PM', 0x16: 'month', 0x17: 'day of month', 0x18: 'weekday',
  0x19: 'steps', 0x1a: 'heart rate', 0x1c: 'calories', 0x1e: 'calories', 0x22: 'distance km int', 0x23: 'distance mi int',
  0x24: 'battery', 0x26: 'steps (slot)', 0x30: 'battery', 0x36: 'temperature 2?', 0x48: 'stands', 0x49: 'steps (slot)',
  0x5f: 'temperature', 0x6a: 'metric (slot)?', 0x6c: 'metric (slot)?', 0x71: 'second?', 0x72: 'second (hand)',
  0x73: '24h/metric flag', 0x74: 'distance km frac', 0x75: 'distance mi frac', 0x76: 'distance', 0x8b: 'aqi',
};

type SimValue = number | '';
export interface Sim {
  live: boolean;
  time: number;
  is24h: boolean;
  steps: SimValue; hr: SimValue; battery: SimValue; calories: SimValue;
  temp: SimValue; distance: SimValue; stepsGoal: SimValue; calGoal: SimValue;
  stands: SimValue; // hours stood (0x48) — see ID_LABELS/idValue note, corrected from "calories"
  overrides: Record<number, number | string>;
  // preview override for accent-flagged widgets (see metaInfo's `accent` field / "Accent
  // color" in docs/cmf-protocol.md); null = draw the baked default. Applied async in
  // editor.model.ts's applyAccent().
  accentColor: string | null;
  // widget-slot (0x85) imgs[0] is an on-watch "tap to configure" placeholder — the real
  // device only draws it in its own edit mode, never during normal time-telling, so the
  // live sim skips it by default. This is an editor-only preview toggle, not real data.
  showSlotPlaceholders: boolean;
}

export interface TimeParts { h: number; m: number; s: number; day: number; wd: number; mon: number }

export interface Hit { node: FaceNode; x: number; y: number; w: number; h: number }

interface Size { w: number; h: number }

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function defaultSim(): Sim {
  return {
    live: true,
    time: Date.now(),
    is24h: true,
    steps: 6789, hr: 72, battery: 80, calories: 321, distance: 4520, temp: 25,
    stepsGoal: 10000, calGoal: 500, stands: 5,
    overrides: {}, // id -> number, manual override of any source
    accentColor: null,
    showSlotPlaceholders: false,
  };
}

export function timeParts(sim: Sim): TimeParts {
  const d = sim.live ? new Date() : new Date(sim.time);
  return {
    h: d.getHours(), m: d.getMinutes(), s: d.getSeconds() + d.getMilliseconds() / 1000,
    day: d.getDate(), wd: (d.getDay() + 6) % 7, mon: d.getMonth() + 1,
  };
}

const h12 = (h: number) => (h + 11) % 12 + 1;

// idValue: value of data source id for the simulation
export function idValue(id: number, sim: Sim, t: TimeParts): number {
  if (sim.overrides[id] !== undefined && sim.overrides[id] !== '') return +sim.overrides[id];
  const dh = sim.is24h ? t.h : h12(t.h);
  switch (id) {
    case 0x01: return dh;
    case 0x04: return t.m;
    case 0x07: return t.h;
    case 0x08: return Math.floor(dh / 10);
    case 0x09: return dh % 10;
    case 0x0a: return (t.h % 12) * 5 + t.m / 12;
    case 0x0b: return t.m;
    case 0x0c: return Math.floor(t.m / 10);
    case 0x0d: return t.m % 10;
    case 0x0e: return t.m + t.s / 60;
    case 0x0f: case 0x12: case 0x71: case 0x72: return t.s;
    case 0x13: return t.h < 12 ? 0 : 1;
    case 0x16: return t.mon;
    case 0x17: return t.day;
    case 0x18: return t.wd; // ponytail: 0=Monday — not confirmed, tweak via override
    case 0x19: return Number(sim.steps);
    case 0x1a: return Number(sim.hr);
    // 0x48/0x24 corrected against Function's widget-slot menu icons (standing figure/lightning
    // bolt, not calories/steps) — 0x48 is stand hours, 0x24 is battery.
    case 0x1e: return Number(sim.calories);
    case 0x22: return Math.floor(Number(sim.distance) / 1000);
    case 0x23: return Math.floor(Number(sim.distance) / 1609.34);
    case 0x24: return Number(sim.battery);
    case 0x26: case 0x49: return Number(sim.steps);
    case 0x48: return Number(sim.stands);
    case 0x6a: case 0x6c: case 0x8b: return Number(sim.steps); // unlabelled complication-slot metrics
    case 0x30: return Number(sim.battery);
    case 0x36: case 0x5f: return Number(sim.temp);
    case 0x73: return sim.is24h ? 1 : 0;
    case 0x74: return Math.floor(Number(sim.distance) / 100) % 10;
    case 0x75: return Math.floor(Number(sim.distance) / 160.934) % 10;
    default: return 0;
  }
}

export function metaInfo(node: FaceNode) {
  const m = unhex(node.meta || '');
  if (m.length < 14) return { w: 0, h: 0, id: 0, sub: 0, max: 0, accent: false };
  return {
    w: m[0] | m[1] << 8, h: m[2] | m[3] << 8,
    id: m[9], sub: m[10], max: m[11] | m[12] << 8 | m[13] << 16,
    // meta[7] (m[7], byte 11 of the struct) === 4 marks this widget's resource(s) as
    // accent-tintable — confirmed against 7 real-device test cases (Theatre, Digits_time,
    // Tumbler, Elaborate_2 positive; Trailing, Disc, Vortex negative), including cases where
    // the accent widget is baked plain white (Dots' hour hand, Large_Number's digits) — this
    // is a real per-widget capability flag, independent of baked pixel color. Supersedes the
    // old color-proximity guessing (isAccentSentinel/ACCENT_REFERENCES) entirely — see
    // docs/cmf-protocol.md "Accent color".
    accent: m[7] === 4,
  };
}

// Visibility conditions (tag 0x02): count × (id u8, op u8, val u24 LE).
// op 0x01 = show on equality (OR), 0x02 = hide on equality.
export function parseBind(hexStr?: string) {
  const v = unhex(hexStr || '');
  if (!v.length) return [];
  const out: { id: number; op: number; val: number }[] = [];
  for (let k = 0; k < v[0] && 1 + 5 * k + 5 <= v.length; k++) {
    const e = v.subarray(1 + 5 * k, 6 + 5 * k);
    let val = e[2] | e[3] << 8 | e[4] << 16;
    if (val & 0x800000) val -= 0x1000000;
    out.push({ id: e[0], op: e[1], val });
  }
  return out;
}

function visible(node: FaceNode, sim: Sim, t: TimeParts): boolean {
  const bind = node.subs?.find(s => s.tag === TAG.bind);
  if (!bind) return true;
  const eq: { id: number; val: number }[] = [], neq: { id: number; val: number }[] = [];
  const ge: { id: number; val: number }[] = [], le: { id: number; val: number }[] = [];
  for (const e of parseBind(bind.hex)) {
    // bit 0x80 in op shows up on exclusive variants (0x81) — semantically the same equality.
    // op 0x03 = "value == no-data marker" (e.g. heart rate 1000), also equality.
    // op 0x05/0x06 = inclusive range bounds (>=/<=) — seen paired on minute-bucket highlights
    // (e.g. Digital__281__Metaball's metaball chain, each node lit for its 5-minute window).
    const op = e.op & 0x7f;
    if (op === 0x01 || op === 0x03) eq.push(e);
    else if (op === 0x02) neq.push(e);
    else if (op === 0x05) ge.push(e);
    else if (op === 0x06) le.push(e);
  }
  let ok = true;
  if (eq.length) ok = eq.some(e => idValue(e.id, sim, t) === e.val);
  if (ok && neq.length) ok = neq.every(e => idValue(e.id, sim, t) !== e.val);
  if (ok && ge.length) ok = ge.every(e => idValue(e.id, sim, t) >= e.val);
  if (ok && le.length) ok = le.every(e => idValue(e.id, sim, t) <= e.val);
  return ok;
}

// Arcs 0x5a (procedural, on 0x80) and 0x5b (ring image, on 0x81):
// min i32 ‖ max i32 ‖ start i16 (0.1°) ‖ end i16 (0.1°) ‖ width u16 ‖ radius u16 (0x5a only).
// 0° = 3 o'clock, clockwise (LVGL). Reversed from corpus, checked against previews.
export interface ArcSpec { kind: number; min: number; max: number; start: number; end: number; width: number; radius: number }
export function parseArcSpec(node: FaceNode): ArcSpec | null {
  const sp = node.subs?.find(n => n.tag === 0x5a || n.tag === 0x5b);
  if (!sp) return null;
  const v = unhex(sp.hex || '');
  if (v.length < 14) return null;
  const i32 = (o: number) => v[o] | v[o + 1] << 8 | v[o + 2] << 16 | v[o + 3] << 24;
  const i16 = (o: number) => { const x = v[o] | v[o + 1] << 8; return x & 0x8000 ? x - 0x10000 : x; };
  return {
    kind: sp.tag, min: i32(0), max: i32(4),
    start: i16(8) / 10, end: i16(10) / 10,
    width: v[12] | v[13] << 8, radius: sp.tag === 0x5a && v.length >= 16 ? v[14] | v[15] << 8 : 0,
  };
}

function sectorImage(ctx: Ctx, b: ImageBitmap, x: number, y: number, spec: ArcSpec, frac: number) {
  const cx = x + b.width / 2, cy = y + b.height / 2;
  // ponytail: image-backed arcs (0x5b) start at 12 o'clock, not the 3-o'clock/LVGL convention
  // documented for procedural arcs (0x5a) near parseArcSpec — measured against Function's
  // battery ring (id 0x24): our gap centered ~90° clockwise of the baked preview's at start=0.
  // Only verified on this one ring; revisit if another 0x5b face disagrees.
  const a0 = (spec.start - 90) * Math.PI / 180;
  const sweep = (spec.end - spec.start) * Math.PI / 180;
  ctx.save();
  if (frac < 0.999 || Math.abs(sweep) < 2 * Math.PI - 0.01) {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, Math.hypot(b.width, b.height), a0, a0 + sweep * frac, sweep < 0);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(b, x, y);
  ctx.restore();
}

// ring stroke color for imageless progress rings: meta bytes 4-6 are an explicit RGB,
// gated by byte 7 === 1 (byte 7 === 4 on the plain steps ring means "no explicit color").
// Confirmed against Combo/SportPulse/ActiveTrio: the same metric id carries the same RGB
// across all three independent files (id 0x26 -> fb471f, id 0x6c -> e3e1e6).
function ringRGB(struct: FaceNode): [number, number, number] | null {
  const m = unhex(struct.meta || '');
  return m.length >= 14 && m[7] === 1 ? [m[4], m[5], m[6]] : null;
}

// byte 7 !== 1 (no baked RGB) doesn't mean "no color" — it means "follow the device's own
// accent/theme setting", which isn't in the file at all: confirmed by Combo's plain steps
// ring baking orange while Activity_Mood's identical-pattern ring bakes blue — two different
// devices' accent choices, not two different renderers. Route it through sim.accentColor,
// same as hand/image sentinel recolor, so it stays consistent with the live editor's picker.
function hexRGB(hex: string | null): [number, number, number] | null {
  if (!hex) return null;
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// no ring image resolved (short struct form with no image ref, or undecoded bitmap) — stroke the arc instead
function drawProceduralArc(
  ctx: Ctx | null, spec: ArcSpec, x: number, y: number, frac: number, hits: Hit[] | null, node: FaceNode,
  w = 0, rgb: [number, number, number] | null = null,
): Size {
  // radius: meta.w/h (the widget's own diameter) when known, spec.radius (0x5a only)
  // as an override, 60 as a last-resort guess for older/short structs with w=0
  const r = spec.radius || (w ? Math.round(w / 2) : 60);
  const cx = r >= 230 ? 233 : x + r, cy = r >= 230 ? 233 : y + r;
  const a0 = spec.start * Math.PI / 180;
  const sweep = (spec.end - spec.start) * Math.PI / 180;
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
    ctx.lineCap = 'butt';
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

function progressFrac(id: number, sim: Sim, t: TimeParts, spec: ArcSpec): number {
  let v = idValue(id, sim, t);
  if (spec.max <= 100 && v > spec.max) {
    // goal rings count as percent of the goal (steps/kcal), firmware divides on its own
    const goal = ({ 0x19: sim.stepsGoal, 0x24: sim.stepsGoal, 0x26: sim.stepsGoal, 0x49: sim.stepsGoal,
                    0x1e: sim.calGoal, 0x48: sim.calGoal } as Record<number, SimValue>)[id];
    if (goal) v = v / Number(goal) * 100;
  }
  if (spec.max === 3600) v *= 60; // scales in seconds of the hour
  const d = spec.max - spec.min || 1;
  return Math.max(0, Math.min(1, (v - spec.min) / d));
}

// align (byte 9): cross-axis alignment of auto-laid-out children, Flutter Row/Column
// crossAxisAlignment equivalent — 0 center (default, matches every real face in the corpus,
// where this byte is always zero), 1 start, 2 end. Not a real firmware field: the whole
// 12-byte tail after gap is always zero across the 100-face corpus, so this is an editor-only
// extension with no device-side meaning beyond "0 = same as stock".
export interface Frame { x: number; y: number; w: number; h: number; gap: number; align: number; node: FaceNode }
export function parseFrame(node: FaceNode): Frame | null {
  const f = node.subs?.find(s => s.tag === TAG.frame);
  if (!f) return null;
  const v = unhex(f.hex || '');
  if (v.length < 9) return null;
  return {
    x: v[0] | v[1] << 8, y: v[2] | v[3] << 8, w: v[4] | v[5] << 8, h: v[6] | v[7] << 8,
    gap: v[8], align: v[9] || 0, node: f,
  };
}

function crossOffset(align: number, avail: number, size: number): number {
  if (align === 1) return 0;
  if (align === 2) return avail - size;
  return (avail - size) / 2;
}

// accentBitmap (if set — see editor.model.ts's applyAccent) takes priority over the baked bitmap
const bmp = (res: Resource[], i: number) => res[i]?.accentBitmap ?? res[i]?.bitmap;

// goal-relative ids (steps/calories "slot" aliases) read as a raw count everywhere, EXCEPT
// when a NUMBER shares the screen with a progress ring bound to the same id — there it must
// show that ring's own percent-of-goal (e.g. "80%"), not the raw counter, or it overflows the
// ring's digit budget (fmt caps it at ~3 digits) and no longer matches the design. The ring and
// its number aren't nested together (each is positioned independently by x/y), so the lookup
// is screen-wide, not just among the number's immediate siblings.
function collectArcsById(nodes: FaceNode[]): Map<number, FaceNode> {
  const out = new Map<number, FaceNode>();
  const walk = (n: FaceNode) => {
    if ((n.tag === 0x80 || n.tag === 0x81)) {
      const struct = n.subs?.find(s => s.tag === TAG.struct);
      const { id } = struct ? metaInfo(struct) : { id: 0 };
      if (id && !out.has(id)) out.set(id, n);
    }
    n.subs?.forEach(walk);
  };
  nodes.forEach(walk);
  return out;
}

// widget-slot (0x85) tiles: each slot's sibling "skin" Groups (per-metric alternates sharing one
// frame position, e.g. Function's temperature/steps/heart-rate tiles) are gated by a bind
// condition on a synthetic id — confirmed on the real device: 0x79 + slotIndex (0x5f's own
// byte 0), compared for equality against the metric's position in that slot's own list (0x5f's
// activeIdx). Neither side is a real sim data source, so synthesize it as an override before
// drawing — the existing visible()/parseBind machinery does the rest, unchanged.
function withSlotOverrides(nodes: FaceNode[], sim: Sim): Sim {
  const extra: Record<number, number> = {};
  const walk = (n: FaceNode) => {
    if (n.tag === 0x85) {
      const sf = n.subs?.find(s => s.tag === 0x5f);
      const v = sf ? unhex(sf.hex || '') : null;
      if (v && v.length >= 3) extra[0x79 + v[0]] = v[2]; // v[0]=slotIndex, v[2]=activeIdx
    }
    n.subs?.forEach(walk);
  };
  nodes.forEach(walk);
  return Object.keys(extra).length ? { ...sim, overrides: { ...extra, ...sim.overrides } } : sim;
}

function numberString(node: FaceNode, sim: Sim, t: TimeParts, arcsById: Map<number, FaceNode>): string {
  const struct = node.subs?.find(s => s.tag === TAG.struct);
  const fmt = node.subs?.find(s => s.tag === TAG.fmt);
  const { id } = metaInfo(struct!);
  const f = fmt ? unhex(fmt.hex!)[0] || 0 : 0;
  const digits = f & 0x1f, pad = f & 0x80;
  const arcSpec = arcsById.has(id) ? parseArcSpec(arcsById.get(id)!) : null;
  const value = arcSpec ? Math.round(progressFrac(id, sim, t, arcSpec) * 100) : Math.round(idValue(id, sim, t));
  let s = String(Math.abs(value));
  if (pad && digits) s = s.padStart(digits, '0');
  return s;
}

// measure/draw a single widget. ctx=null — measure only (for group layout).
// origin: if set, draw at this point (auto-layout), otherwise at the struct's x/y.
// arcsById: screen-wide id -> progress-ring lookup, see numberString.
function drawWidget(
  ctx: Ctx | null, node: FaceNode, res: Resource[], sim: Sim, t: TimeParts,
  ox: number, oy: number, origin: { x: number; y: number } | null, hits: Hit[] | null,
  arcsById: Map<number, FaceNode>,
): Size | null {
  if (node.tag === TAG.preview || node.tag === TAG.name) return null;
  if (!visible(node, sim, t)) return null;

  if (node.tag === TAG.group) {
    return drawGroup(ctx, node, res, sim, t, ox, oy, origin, hits, arcsById);
  }

  const struct = node.subs?.find(s => s.tag === TAG.struct);
  // progress rings (0x80/0x81) can be procedural — a short struct form carries no image ref at all
  const isArc = node.tag === 0x80 || node.tag === 0x81;
  if (!struct || (!struct.images && !isArc)) return null;
  const imgs = struct.images ?? [];
  const x = origin ? origin.x : ox + (struct.x || 0);
  const y = origin ? origin.y : oy + (struct.y || 0);

  if (node.tag === TAG.hand) {
    const pivot = node.subs!.find(s => s.tag === TAG.pivot);
    const b = bmp(res, imgs[0]);
    if (!b || !pivot || !ctx) return null;
    const { id, max } = metaInfo(struct);
    const angle = idValue(id, sim, t) / (max || 60) * 2 * Math.PI;
    const px0 = pivot.pivotX!, py0 = pivot.pivotY!;
    ctx.save();
    ctx.translate(x + px0, y + py0);
    ctx.rotate(angle);
    ctx.drawImage(b, -px0, -py0);
    ctx.restore();
    if (hits) {
      // hitbox — AABB of the image rotated around the pivot
      const cs = Math.cos(angle), sn = Math.sin(angle);
      const pts = [[0, 0], [b.width, 0], [0, b.height], [b.width, b.height]]
        .map(([px, py]) => [(px - px0) * cs - (py - py0) * sn,
                            (px - px0) * sn + (py - py0) * cs]);
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      hits.push({
        node, x: x + px0 + Math.min(...xs), y: y + py0 + Math.min(...ys),
        w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys),
      });
    }
    return null;
  }

  if (node.tag === TAG.number || (node.subs?.some(s => s.tag === TAG.fmt) && imgs.length >= 10)) {
    const str = numberString(node, sim, t, arcsById);
    let w = 0, h = 0;
    for (const ch of str) {
      const b = bmp(res, imgs[+ch] ?? imgs[0]);
      if (b) { w += b.width; h = Math.max(h, b.height); }
    }
    if (ctx) {
      let cx = x;
      for (const ch of str) {
        const b = bmp(res, imgs[+ch] ?? imgs[0]);
        if (b) { ctx.drawImage(b, cx, y); cx += b.width; }
      }
      hits?.push({ node, x, y, w, h });
    }
    return { w, h };
  }

  // 0x81: progress ring — ring image clipped to a sector by value, procedural arc if imageless
  if (node.tag === 0x81) {
    const spec = parseArcSpec(node);
    if (!spec) return null;
    const b = bmp(res, imgs[0]);
    const { id, w } = metaInfo(struct);
    const frac = progressFrac(id, sim, t, spec);
    if (!b) return drawProceduralArc(ctx, spec, x, y, frac, hits, node, w, ringRGB(struct) ?? hexRGB(sim.accentColor));
    if (ctx && frac > 0.002) sectorImage(ctx, b, x, y, spec, frac);
    if (ctx) hits?.push({ node, x, y, w: b.width, h: b.height });
    return { w: b.width, h: b.height };
  }

  // 0x80: same progress image, but with min/max/radius fields in 0x5a;
  // vertical bars fill by height, rings by sector, no image — procedural arc
  if (node.tag === 0x80) {
    const spec = parseArcSpec(node);
    if (!spec) return null;
    const b = bmp(res, imgs[0]);
    const { id, w } = metaInfo(struct);
    const frac = progressFrac(id, sim, t, spec);
    if (b && b.height > 3 * b.width) { // vertical bar
      if (ctx && frac > 0.002) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x, y + b.height * (1 - frac), b.width, b.height * frac);
        ctx.clip();
        ctx.drawImage(b, x, y);
        ctx.restore();
      }
      if (ctx) hits?.push({ node, x, y, w: b.width, h: b.height });
      return { w: b.width, h: b.height };
    }
    if (b) {
      if (ctx && frac > 0.002) sectorImage(ctx, b, x, y, spec, frac);
      if (ctx) hits?.push({ node, x, y, w: b.width, h: b.height });
      return { w: b.width, h: b.height };
    }
    return drawProceduralArc(ctx, spec, x, y, frac, hits, node, w, ringRGB(struct) ?? hexRGB(sim.accentColor));
  }

  // 0x85: widget slot — user assigns one of several metrics to this slot in the companion app.
  // sibling 0x5f: [slotIndex][count][activeIdx][count × metric id][zero padding]. slotIndex is
  // this node's 0-based position among sibling 0x85 nodes (verified, zero exceptions in the
  // corpus) — presumably how the companion app numbers slots in its settings UI; unused for
  // rendering. struct.meta.id is always 0 for this tag across the corpus — it carries no live
  // value of its own.
  // imgs[1..count] are the per-metric icons shown in the companion app's OWN picker menu —
  // confirmed against the real device, they never appear on the watch face itself, in any
  // slot state; a sibling Group elsewhere in the tree is the real on-watch visual for the
  // selected metric, gated by a bind on id 0x79+slotIndex (see withSlotOverrides above — this
  // node's activeIdx picks which sibling Group shows, not which image this node draws).
  // imgs[0] is the "tap to configure" placeholder shown for every slot on-watch only in the
  // widget-edit screen, never during normal time-telling — so this node draws nothing unless
  // the sim's showSlotPlaceholders preview toggle is on, in which case it's always imgs[0],
  // regardless of activeIdx.
  if (node.tag === 0x85) {
    if (!sim.showSlotPlaceholders) return null;
    const b = bmp(res, imgs[0]);
    if (!b) return null;
    if (ctx) { ctx.drawImage(b, x, y); hits?.push({ node, x, y, w: b.width, h: b.height }); }
    return { w: b.width, h: b.height };
  }

  // 0x30 and others: a single image or a pick by value (7 days / 12 months / 2 AM-PM)
  let idx = 0;
  if (imgs.length > 1) {
    const { id } = metaInfo(struct);
    // index = value % frame count: lists start at "zero" (months [DEC,JAN..NOV], days [31,1..30])
    const v = Math.floor(idValue(id, sim, t));
    idx = ((v % imgs.length) + imgs.length) % imgs.length;
  }
  const b = bmp(res, imgs[idx]);
  if (!b) return null;
  if (ctx) {
    ctx.drawImage(b, x, y);
    hits?.push({ node, x, y, w: b.width, h: b.height });
  }
  return { w: b.width, h: b.height };
}

// 0x68: frame 0x48 (x,y,w,h,gap) + children. Two layout modes per child (docs §9.6a):
// struct meta w = 0x8000 — auto-layout, joins a row/column centered in the frame;
// anything else — absolute at frame origin + child x/y (verified: Progress_Day dot circle,
// Glare_2 stacked kcal block; no layout flag exists in frame 0x48 — bytes 9..20 are
// always zero across the 100-face corpus, byte 8 is just the row gap).
// ponytail: exact firmware direction rule is unverified — guessed from the original child
// x/y spread (bigger vertical spread = stacked column); flip to a real flag if one turns up.
function drawGroup(
  ctx: Ctx | null, node: FaceNode, res: Resource[], sim: Sim, t: TimeParts,
  ox: number, oy: number, origin: { x: number; y: number } | null, hits: Hit[] | null,
  arcsById: Map<number, FaceNode>,
): Size | null {
  const fr = parseFrame(node);
  if (!fr) return null;
  const x = origin ? origin.x : ox + fr.x;
  const y = origin ? origin.y : oy + fr.y;
  const kids = (node.subs || []).filter(s => s.tag !== TAG.frame && s.tag !== TAG.bind);
  const isTrueAuto = (k: FaceNode) => {
    const st = k.subs?.find(s => s.tag === TAG.struct);
    return !!st && metaInfo(st).w === 0x8000;
  };
  // a NUMBER's rendered width is inherently dynamic (digit count varies), so it doesn't carry
  // its own 0x8000 marker — but it still needs to pack into the same auto row as a genuine
  // auto sibling, not sit flush at the frame origin on its own axis (Function's "80%": the "%"
  // image is 0x8000-marked, the number beside it is meta.w=0 at the same x=0,y=0 origin).
  // ponytail: only confirmed on this one battery-percent group — gate on a real auto sibling
  // existing at all, so a lone origin-positioned number elsewhere keeps its prior behavior.
  const hasTrueAutoSibling = kids.some(isTrueAuto);
  const isAuto = (k: FaceNode) => {
    if (isTrueAuto(k)) return true;
    if (!hasTrueAutoSibling || k.tag !== TAG.number) return false;
    const st = k.subs?.find(s => s.tag === TAG.struct);
    return !!st && !st.x && !st.y;
  };
  const sizes = kids.map(k => isAuto(k) ? drawWidget(null, k, res, sim, t, 0, 0, { x: 0, y: 0 }, null, arcsById) : null);
  const shown = sizes.filter((z): z is Size => !!z);

  const autoStructs = kids
    .map((k, i) => sizes[i] ? k.subs?.find(s => s.tag === TAG.struct) : null)
    .filter((s): s is FaceNode => !!s);
  const spread = (vals: number[]) => vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  const vertical = autoStructs.length > 1
    && spread(autoStructs.map(s => s.y || 0)) > spread(autoStructs.map(s => s.x || 0));

  // boxed non-auto children (see below) need their own direction reading — pulling in
  // unrelated abs siblings (e.g. a lone icon at a different y) to decide `vertical` would
  // also skew the auto/shown centering above, which already worked. With only one boxed
  // sibling there's nothing to read a spread from, so fall back to the group's own axis.
  const boxedStructs = kids
    .filter(k => k.tag !== 0x80 && k.tag !== 0x81 && !isAuto(k))
    .map(k => k.subs?.find(s => s.tag === TAG.struct))
    .filter((s): s is FaceNode => !!s);
  const boxedVertical = boxedStructs.length > 1
    ? spread(boxedStructs.map(s => s.y || 0)) > spread(boxedStructs.map(s => s.x || 0))
    : vertical;

  const total = shown.reduce((s, z) => s + (vertical ? z.h : z.w), 0) + fr.gap * Math.max(0, shown.length - 1);
  // frame.w/h === 0 on the packing axis means "auto-size to content" (seen on Function's
  // icon+digits+degree temperature row: frame w=0, gap=10, 4 auto children) — centering
  // against a literal 0 shoved the whole packed row left by half its own width. Clamp the
  // available length to at least `total` so an auto-sized frame just starts flush at the
  // frame origin instead of drifting negative.
  const mainAvail = Math.max(vertical ? fr.h : fr.w, total);
  let c = (vertical ? y : x) + (mainAvail - total) / 2;
  if (ctx) {
    kids.forEach((k, i) => {
      const z = sizes[i];
      if (z) {
        const pos = vertical
          ? { x: x + crossOffset(fr.align, fr.w, z.w), y: c }
          : { x: c, y: y + crossOffset(fr.align, fr.h, z.h) };
        drawWidget(ctx, k, res, sim, t, 0, 0, pos, hits, arcsById);
        c += (vertical ? z.h : z.w) + fr.gap;
      } else if (!isAuto(k)) {
        // progress rings (0x80/0x81) inside a group carry already-absolute struct x/y —
        // confirmed on Combo, where a grouped ring's x/y is byte-identical to an ungrouped
        // sibling ring at the same screen position. Adding the frame origin on top (as the
        // other non-auto widgets need) pushes them off-canvas.
        const isRing = k.tag === 0x80 || k.tag === 0x81;
        // non-auto but still boxed: plenty of these siblings aren't 0x8000 auto-layout (no
        // row/column packing) yet are meant to be cross-axis centered, not flush against the
        // frame edge — Combo's weekday/day (meta.w>0, a declared-but-unused box size) and
        // Function's calorie/battery/heart-rate/temperature tiles (meta.w===0, no box at all)
        // both need it. The common signal in every corpus example so far: the struct's own
        // cross-axis coordinate is 0, i.e. "not positioned, center me" — a real deliberate
        // offset (verified: Progress_Day dot circle, Glare_2 stacked kcal block) is non-zero
        // and is left alone. Either way the box/declared size isn't the widget's actual pixel
        // size, so measure the real drawn size for centering rather than trust meta.w.
        // ponytail: only Combo/Function confirm this reading — revisit if a face turns up
        // where a non-auto child sits at cross-axis 0 on purpose without wanting centering.
        const kst = !isRing ? k.subs?.find(s => s.tag === TAG.struct) : null;
        const boxed = kst && (boxedVertical ? !kst.x : !kst.y);
        const measured = boxed ? drawWidget(null, k, res, sim, t, 0, 0, { x: 0, y: 0 }, null, arcsById) : null;
        const pos = measured
          ? (boxedVertical
              ? { x: x + crossOffset(fr.align, fr.w, measured.w), y: y + (kst!.y || 0) }
              : { x: x + (kst!.x || 0), y: y + crossOffset(fr.align, fr.h, measured.h) })
          : null;
        drawWidget(ctx, k, res, sim, t, isRing ? 0 : x, isRing ? 0 : y, pos, hits, arcsById);
      }
    });
    hits?.push({ node, x, y, w: fr.w, h: fr.h });
  }
  return { w: fr.w, h: fr.h };
}

// render: returns hitboxes (in draw order; topmost is last)
export function render(ctx: Ctx, face: Face, screenTag: number, sim: Sim): Hit[] {
  const t = timeParts(sim);
  const hits: Hit[] = [];
  ctx.clearRect(0, 0, 466, 466);
  const scr = face.screens.find(s => s.tag === screenTag) || face.screens[0];
  const top = scr?.subs || [];
  const arcsById = collectArcsById(top);
  const effSim = withSlotOverrides(top, sim);
  for (const w of top) drawWidget(ctx, w, face.resources, effSim, t, 0, 0, null, hits, arcsById);
  return hits;
}

// all data sources appearing in the face (for the overrides panel)
export function collectIds(face: Face): { id: number; max: number }[] {
  const ids = new Map<number, number>();
  const walk = (n: FaceNode) => {
    if (n.tag === TAG.struct && n.meta) {
      const { id, max } = metaInfo(n);
      if (id) ids.set(id, max || ids.get(id) || 0);
    }
    if (n.tag === TAG.bind) for (const e of parseBind(n.hex)) if (e.id) ids.set(e.id, ids.get(e.id) || 0);
    n.subs?.forEach(walk);
  };
  face.screens.forEach(walk);
  return [...ids.entries()].map(([id, max]) => ({ id, max })).sort((a, b) => a.id - b.id);
}
