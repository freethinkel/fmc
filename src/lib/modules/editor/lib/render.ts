// Watch face emulator: walk the face.json tree and render onto a 466×466 canvas.
// Tag/id semantics reversed from a corpus of 100 faces (see docs/cmf-protocol.md §9.6a).
import { TAG, unhex, type Face, type FaceNode, type Resource } from './wf';

// Known data sources (meta byte 9). "?" = guess, not confirmed.
export const ID_LABELS: Record<number, string> = {
  0x01: 'hour', 0x04: 'minute?', 0x07: 'hour (24h)',
  0x08: 'hour tens', 0x09: 'hour ones', 0x0a: 'minute (hand)', 0x0b: 'minute',
  0x0c: 'min tens', 0x0d: 'min ones', 0x0e: 'hour (hand)', 0x0f: 'second',
  0x12: 'second', 0x13: 'AM/PM', 0x16: 'month', 0x17: 'day of month', 0x18: 'weekday',
  0x19: 'steps', 0x1a: 'heart rate', 0x1e: 'calories', 0x22: 'distance km int', 0x23: 'distance mi int',
  0x24: 'steps (slot)', 0x26: 'steps (slot)', 0x30: 'battery', 0x36: 'temperature 2?', 0x48: 'calories', 0x49: 'steps (slot)',
  0x5f: 'temperature', 0x6a: 'metric (slot)?', 0x6c: 'metric (slot)?', 0x71: 'second?', 0x72: 'second (hand)',
  0x73: '24h/metric flag', 0x74: 'distance km frac', 0x75: 'distance mi frac', 0x8b: 'metric (slot)?',
};

type SimValue = number | '';
export interface Sim {
  live: boolean;
  time: number;
  is24h: boolean;
  steps: SimValue; hr: SimValue; battery: SimValue; calories: SimValue;
  temp: SimValue; distance: SimValue; stepsGoal: SimValue; calGoal: SimValue;
  overrides: Record<number, number | string>;
  // preview override for the accent sentinel range (see cmf-format-reference.md);
  // null = draw the baked default. Applied async in editor.model.ts's applyAccent().
  accentColor: string | null;
}

// firmware substitutes pixels in this baked range with the device's accent-color setting —
// see cmf-format-reference.md "Accent color sentinel". Range, not one exact triple: corpus
// scan found (255,44,0) on hands/rings and (255,60,0)/(255,80,24) on Digits_time's digits —
// all cluster at R=255, G 40-85, B<=25 with nothing else in the 100-file corpus nearby
// (a wider hue-based match pulled in 90/100 files — ordinary warm-colored digit strips —
// so this stays a tight RGB box, not a hue/saturation heuristic).
export function isAccentSentinel(r: number, g: number, b: number): boolean {
  return r === 255 && g >= 40 && g <= 85 && b <= 25;
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
    stepsGoal: 10000, calGoal: 500,
    overrides: {}, // id -> number, manual override of any source
    accentColor: null,
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
    case 0x0a: return t.m + t.s / 60;
    case 0x0b: return t.m;
    case 0x0c: return Math.floor(t.m / 10);
    case 0x0d: return t.m % 10;
    case 0x0e: return (t.h % 12) * 5 + t.m / 12;
    case 0x0f: case 0x12: case 0x71: case 0x72: return t.s;
    case 0x13: return t.h < 12 ? 0 : 1;
    case 0x16: return t.mon;
    case 0x17: return t.day;
    case 0x18: return t.wd; // ponytail: 0=Monday — not confirmed, tweak via override
    case 0x19: return Number(sim.steps);
    case 0x1a: return Number(sim.hr);
    case 0x1e: case 0x48: return Number(sim.calories);
    case 0x22: return Math.floor(Number(sim.distance) / 1000);
    case 0x23: return Math.floor(Number(sim.distance) / 1609.34);
    case 0x24: case 0x26: case 0x49: return Number(sim.steps);
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
  if (m.length < 14) return { w: 0, h: 0, id: 0, sub: 0, max: 0 };
  return {
    w: m[0] | m[1] << 8, h: m[2] | m[3] << 8,
    id: m[9], sub: m[10], max: m[11] | m[12] << 8 | m[13] << 16,
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
  const a0 = spec.start * Math.PI / 180;
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

// no ring image resolved (short struct form with no image ref, or undecoded bitmap) — stroke the arc instead
function drawProceduralArc(ctx: Ctx | null, spec: ArcSpec, x: number, y: number, frac: number, hits: Hit[] | null, node: FaceNode): Size {
  // ponytail: 0x5b (ring) carries no radius field at all — 60 is a generic guess, not derived from the file
  const r = spec.radius || 60;
  const cx = r >= 230 ? 233 : x + r, cy = r >= 230 ? 233 : y + r;
  const a0 = spec.start * Math.PI / 180;
  const sweep = (spec.end - spec.start) * Math.PI / 180;
  if (ctx) {
    ctx.save();
    ctx.lineWidth = Math.min(spec.width || 6, 24);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, a0, a0 + sweep, sweep < 0);
    ctx.stroke();
    if (frac > 0.002) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0, a0 + sweep * frac, sweep < 0);
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
    const { id } = metaInfo(struct);
    const frac = progressFrac(id, sim, t, spec);
    if (!b) return drawProceduralArc(ctx, spec, x, y, frac, hits, node);
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
    const { id } = metaInfo(struct);
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
    return drawProceduralArc(ctx, spec, x, y, frac, hits, node);
  }

  // 0x85: widget slot — user assigns one of several metrics to this slot in the companion app.
  // sibling 0x5f: [slotIndex][count][activeIdx][count × metric id][zero padding]. count === imgs.length-1,
  // the trailing image is the "nothing assigned" icon. Show images[activeIdx], not a value-driven pick —
  // struct.meta.id is always 0 for this tag across the corpus, so the generic branch below always drew images[0].
  // slotIndex is just this node's 0-based position among sibling 0x85 nodes (verified, zero exceptions in
  // the corpus) — presumably how the companion app numbers slots in its settings UI; unused for rendering.
  if (node.tag === 0x85) {
    const sf = node.subs?.find(s => s.tag === 0x5f);
    const v = sf ? unhex(sf.hex || '') : null;
    const activeIdx = v && v.length >= 3 ? v[2] : imgs.length - 1;
    const b = bmp(res, imgs[activeIdx] ?? imgs[imgs.length - 1]);
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
  const isAuto = (k: FaceNode) => {
    const st = k.subs?.find(s => s.tag === TAG.struct);
    return !!st && metaInfo(st).w === 0x8000;
  };
  const sizes = kids.map(k => isAuto(k) ? drawWidget(null, k, res, sim, t, 0, 0, { x: 0, y: 0 }, null, arcsById) : null);
  const shown = sizes.filter((z): z is Size => !!z);

  const autoStructs = kids
    .map((k, i) => sizes[i] ? k.subs?.find(s => s.tag === TAG.struct) : null)
    .filter((s): s is FaceNode => !!s);
  const spread = (vals: number[]) => vals.length ? Math.max(...vals) - Math.min(...vals) : 0;
  const vertical = autoStructs.length > 1
    && spread(autoStructs.map(s => s.y || 0)) > spread(autoStructs.map(s => s.x || 0));

  const total = shown.reduce((s, z) => s + (vertical ? z.h : z.w), 0) + fr.gap * Math.max(0, shown.length - 1);
  let c = (vertical ? y : x) + ((vertical ? fr.h : fr.w) - total) / 2;
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
        drawWidget(ctx, k, res, sim, t, x, y, null, hits, arcsById);
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
  for (const w of top) drawWidget(ctx, w, face.resources, sim, t, 0, 0, null, hits, arcsById);
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
