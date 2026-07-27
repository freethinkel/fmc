// Data sources: what the watch feeds a widget, and the simulated values the editor feeds it
// instead. A source id is meta[9] of a struct (see docs/cmf-protocol.md §9.6a), the id of a
// visibility condition, and an entry of a widget slot's metric menu.
import { TAG, unhex, type Face, type FaceNode } from "./wf";

// "?" = guess, not confirmed.
// 0x1c/0x24/0x48/0x76/0x8b — labels corrected against Function's widget-slot menu (companion-app
// icons: flame/calories, standing figure/stands, lightning/battery, road/distance, cloud-sun/aqi).
// idValue() feeds each of them from the matching sim field; the unit of 0x1c/0x76/0x8b is a
// guess (no corpus face binds a live widget to them), tweak per-face via an override.
// The time/date half is cross-checked against the protocol repo's §16, whose hand-angle and
// tens/units ids come from disassembling the firmware getter table
// (github.com/joshuapassos/CMF-Watch-Pro-2-BLE-Protocol). Ids added from there that no corpus
// face binds are labelled from that reading alone.
export const ID_LABELS: Record<number, string> = {
  0x01: "hour",
  0x02: "hour tens (12h)",
  0x03: "hour ones (12h)",
  0x04: "hour (24h)",
  0x05: "hour tens",
  0x06: "hour ones",
  0x07: "hour (24h)",
  0x08: "hour tens",
  0x09: "hour ones",
  0x0a: "hour (hand)",
  0x0b: "minute",
  0x0c: "min tens",
  0x0d: "min ones",
  0x0e: "minute (hand)",
  0x0f: "second (smooth hand)",
  0x10: "sec tens",
  0x11: "sec ones",
  0x12: "second (smooth hand)",
  0x13: "AM/PM",
  0x15: "month",
  0x16: "month",
  0x17: "day of month",
  0x18: "weekday",
  0x19: "steps",
  0x1a: "heart rate",
  0x1c: "calories",
  0x1e: "calories",
  0x22: "distance km int",
  0x23: "distance mi int",
  0x24: "battery",
  0x25: "steps (slot)?",
  0x26: "steps (slot)",
  0x27: "calories (slot)?",
  0x30: "battery",
  0x36: "temperature",
  0x48: "stand hours",
  0x49: "steps (slot)",
  0x5f: "temperature",
  0x6a: "steps (slot)?",
  0x6c: "steps (slot)?",
  0x6f: "steps (slot)?",
  0x70: "hour (hand)",
  // 0x71 reads as the MINUTE hand angle (m·6° + s·0.1°) in the firmware getter table, not a
  // second source — which is what "hands on 0x71 look broken" (see PropsPanel's SECOND_IDS)
  // was all along. No corpus face binds it, so nothing here rendered on it before.
  0x71: "minute (hand)",
  0x72: "second (ticking hand)",
  0x73: "24h/metric flag",
  0x74: "distance km frac",
  0x75: "distance mi frac",
  0x76: "distance km (slot)",
  // Activity_Mood's fan gauge (0x80 ring, max 100). Undocumented anywhere — a goal percentage
  // by shape, metric unknown, so it reads steps like the other unlabelled slot ids.
  0x82: "goal % ?",
  0x8b: "aqi",
};

// Value-indexed frame sets: the firmware picks images[value % count], so frame order is part
// of the format. What each index MUST hold, for the sources where the value isn't the frame's
// own meaning (see drawPicked in render.ts) — shown next to the thumbnails in PropsPanel so a
// wrong order is visible instead of only showing up on the watch.
export const FRAME_LABELS: Record<number, string[]> = {
  0x13: ["AM", "PM"],
  0x15: ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
  0x16: ["Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov"],
  0x18: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

// 0x79 + slotIndex is synthetic — not a metric but the widget slot's own selection index
// (0x5f byte 2), only ever seen in visibility conditions.
export const sourceLabel = (id: number) =>
  ID_LABELS[id] ??
  (id >= 0x79 && id <= 0x7e ? `slot ${id - 0x79} selection` : `id 0x${id.toString(16)}`);

export type SimValue = number | "";

export interface Sim {
  live: boolean;
  time: number;
  is24h: boolean;
  steps: SimValue;
  hr: SimValue;
  battery: SimValue;
  calories: SimValue;
  temp: SimValue;
  distance: SimValue;
  aqi: SimValue;
  stands: SimValue; // hours stood (0x48) — see ID_LABELS/idValue note, corrected from "calories"
  stepsGoal: SimValue;
  calGoal: SimValue;
  standsGoal: SimValue; // ring denominator for 0x48, the watch's default stand goal is 12 h
  overrides: Record<number, number | string>;
  // preview override for accent-flagged widgets (see metaInfo's `accent` field / "Accent
  // color" in docs/cmf-protocol.md); null = draw the baked default. Applied async in
  // editor.model.ts's accentFx.
  accentColor: string | null;
  // widget-slot (0x85) imgs[0] is an on-watch "tap to configure" placeholder — the real
  // device only draws it in its own edit mode, never during normal time-telling, so the
  // live sim skips it by default. This is an editor-only preview toggle, not real data.
  showSlotPlaceholders: boolean;
}

export interface TimeParts {
  h: number;
  m: number;
  s: number;
  day: number;
  wd: number;
  mon: number;
}

export function defaultSim(): Sim {
  return {
    live: true,
    time: Date.now(),
    is24h: true,
    steps: 6789,
    hr: 72,
    battery: 80,
    calories: 321,
    distance: 4520,
    temp: 25,
    aqi: 42,
    stands: 5,
    stepsGoal: 10000,
    calGoal: 500,
    standsGoal: 12,
    overrides: {}, // id -> number, manual override of any source
    accentColor: null,
    showSlotPlaceholders: false,
  };
}

export function timeParts(sim: Sim): TimeParts {
  const d = sim.live ? new Date() : new Date(sim.time);

  return {
    h: d.getHours(),
    m: d.getMinutes(),
    s: d.getSeconds() + d.getMilliseconds() / 1000,
    day: d.getDate(),
    wd: d.getDay(),
    mon: d.getMonth() + 1,
  };
}

const h12 = (h: number) => ((h + 11) % 12) + 1;

export function idValue(id: number, sim: Sim, t: TimeParts): number {
  if (sim.overrides[id] !== undefined && sim.overrides[id] !== "") return Number(sim.overrides[id]);
  const dh = sim.is24h ? t.h : h12(t.h);

  switch (id) {
    case 0x01:
      return dh;
    case 0x02:
      return Math.floor(h12(t.h) / 10);
    case 0x03:
      return h12(t.h) % 10;
    case 0x04:
    case 0x07:
      return t.h;
    case 0x05:
    case 0x08:
      return Math.floor(dh / 10);
    case 0x06:
    case 0x09:
      return dh % 10;
    case 0x0a:
    case 0x70:
      return (t.h % 12) * 5 + t.m / 12;
    case 0x0b:
      return t.m;
    case 0x0c:
      return Math.floor(t.m / 10);
    case 0x0d:
      return t.m % 10;
    case 0x0e:
    case 0x71:
      return t.m + t.s / 60;
    // Second sources tick at 1 Hz here — HANDS on 0x0f/0x12 are the one exception, they
    // sweep smoothly (device-verified: Elegant_Sweep's 0x12 hand is smooth, Sundial's 0x72
    // hand ticks, rings tick on every id) — drawHand un-quantizes them.
    case 0x0f:
    case 0x12:
    case 0x72:
      return Math.floor(t.s);
    case 0x10:
      return Math.floor(t.s / 10);
    case 0x11:
      return Math.floor(t.s) % 10;
    case 0x13:
      return t.h < 12 ? 0 : 1;
    case 0x15:
    case 0x16:
      return t.mon;
    case 0x17:
      return t.day;
    case 0x18:
      // 0=Sunday: stock Combo/Elaborate_2 weekday sprite lists start at "Sun", so the
      // firmware's index for this source is plain getDay()
      return t.wd;
    case 0x19:
      return Number(sim.steps);
    case 0x1a:
      return Number(sim.hr);
    case 0x1c:
    case 0x1e:
    case 0x27:
      return Number(sim.calories);
    case 0x22:
      return Math.floor(Number(sim.distance) / 1000);
    case 0x23:
      return Math.floor(Number(sim.distance) / 1609.34);
    // 0x48/0x24 corrected against Function's widget-slot menu icons (standing figure/lightning
    // bolt, not calories/steps) — 0x48 is stand hours, 0x24 is battery.
    case 0x24:
      return Number(sim.battery);
    case 0x25:
    case 0x26:
    case 0x49:
      return Number(sim.steps);
    case 0x48:
      return Number(sim.stands);
    case 0x6a:
    case 0x6c:
    case 0x6f:
    case 0x82:
      return Number(sim.steps); // unlabelled complication-slot / goal metrics
    case 0x30:
      return Number(sim.battery);
    case 0x36:
    case 0x5f:
      return Number(sim.temp);
    case 0x73:
      return sim.is24h ? 1 : 0;
    case 0x74:
      return Math.floor(Number(sim.distance) / 100) % 10;
    case 0x75:
      return Math.floor(Number(sim.distance) / 160.934) % 10;
    // ponytail: slot-menu labels only, unit unverified — km int / plain AQI, override per face
    case 0x76:
      return Math.floor(Number(sim.distance) / 1000);
    case 0x8b:
      return Number(sim.aqi);
    default:
      return 0;
  }
}

/** The goal a percentage-style ring divides by, for the sources that count up instead of to 100. */
export function goalOf(id: number, sim: Sim): SimValue | undefined {
  return {
    0x19: sim.stepsGoal,
    0x25: sim.stepsGoal,
    0x26: sim.stepsGoal,
    0x49: sim.stepsGoal,
    0x6a: sim.stepsGoal,
    0x6c: sim.stepsGoal,
    0x6f: sim.stepsGoal,
    0x82: sim.stepsGoal,
    0x1c: sim.calGoal,
    0x1e: sim.calGoal,
    0x27: sim.calGoal,
    0x48: sim.standsGoal,
  }[id];
}

export interface Meta {
  w: number;
  h: number;
  id: number;
  sub: number;
  max: number;
  accent: boolean;
}

/** A struct's meta[14]: geometry, data source and the accent-tint flag. */
export function metaInfo(node: FaceNode): Meta {
  const m = unhex(node.meta || "");

  if (m.length < 14) return { w: 0, h: 0, id: 0, sub: 0, max: 0, accent: false };
  return {
    w: m[0] | (m[1] << 8),
    h: m[2] | (m[3] << 8),
    id: m[9],
    sub: m[10],
    max: m[11] | (m[12] << 8) | (m[13] << 16),
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

export interface BindEntry {
  id: number;
  op: number;
  val: number;
}

/** Visibility conditions (tag 0x02): count × (id u8, op u8, val u24 LE signed). */
export function parseBind(hexStr?: string): BindEntry[] {
  const v = unhex(hexStr || "");

  if (!v.length) return [];
  const out: BindEntry[] = [];

  for (let k = 0; k < v[0] && 1 + 5 * k + 5 <= v.length; k++) {
    const e = v.subarray(1 + 5 * k, 6 + 5 * k);
    let val = e[2] | (e[3] << 8) | (e[4] << 16);

    if (val & 0x800000) val -= 0x1000000;
    out.push({ id: e[0], op: e[1], val });
  }
  return out;
}

// Same conditions as isVisible() reads, in words — the raw hex is unreadable and these gates are
// what makes half a face look "broken" (a widget silently hidden). Equality lines OR together,
// the rest must all hold.
export function describeBind(hexStr?: string): string[] {
  return parseBind(hexStr).map(({ id, op, val }) => {
    const s = sourceLabel(id);

    switch (op & 0x7f) {
      case 0x01:
        return `show if ${s} = ${val}`;
      case 0x02:
        return `hide if ${s} = ${val}`;
      case 0x03:
        return `show if ${s} = ${val} (no-data marker)`;
      case 0x05:
        return `only if ${s} ≥ ${val}`;
      case 0x06:
        return `only if ${s} ≤ ${val}`;
      default:
        return `${s} op 0x${op.toString(16)} ${val} — unknown, ignored`;
    }
  });
}

export function isVisible(node: FaceNode, sim: Sim, t: TimeParts): boolean {
  const bind = node.subs?.find((s) => s.tag === TAG.bind);

  if (!bind) return true;
  // bit 0x80 in op shows up on exclusive variants (0x81) — semantically the same equality.
  // op 0x03 = "value == no-data marker" (e.g. heart rate 1000), also equality.
  // op 0x05/0x06 = inclusive range bounds (>=/<=) — seen paired on minute-bucket highlights
  // (e.g. Digital__281__Metaball's metaball chain, each node lit for its 5-minute window).
  const entries = parseBind(bind.hex).map((e) => ({ ...e, op: e.op & 0x7f }));
  const of = (...ops: number[]) => entries.filter((e) => ops.includes(e.op));
  const value = (e: BindEntry) => idValue(e.id, sim, t);
  const equals = of(0x01, 0x03);

  if (equals.length && !equals.some((e) => value(e) === e.val)) return false;
  return (
    of(0x02).every((e) => value(e) !== e.val) &&
    of(0x05).every((e) => value(e) >= e.val) &&
    of(0x06).every((e) => value(e) <= e.val)
  );
}

// widget-slot (0x85) tiles: each slot's sibling "skin" Groups (per-metric alternates sharing one
// frame position, e.g. Function's temperature/steps/heart-rate tiles) are gated by a bind
// condition on a synthetic id — confirmed on the real device: 0x79 + slotIndex (0x5f's own
// byte 0), compared for equality against the metric's position in that slot's own list (0x5f's
// activeIdx). Neither side is a real sim data source, so synthesize it as an override before
// drawing — the existing isVisible()/parseBind machinery does the rest, unchanged.
export function withSlotOverrides(nodes: FaceNode[], sim: Sim): Sim {
  const extra: Record<number, number> = {};
  const walk = (n: FaceNode) => {
    if (n.tag === 0x85) {
      const sf = n.subs?.find((s) => s.tag === 0x5f);
      const v = sf ? unhex(sf.hex || "") : null;

      if (v && v.length >= 3) extra[0x79 + v[0]] = v[2]; // v[0]=slotIndex, v[2]=activeIdx
    }
    n.subs?.forEach(walk);
  };

  nodes.forEach(walk);
  return Object.keys(extra).length ? { ...sim, overrides: { ...extra, ...sim.overrides } } : sim;
}

/** All data sources appearing in the face — the list the simulator panel offers to override. */
export function collectIds(face: Face): { id: number; max: number }[] {
  const ids = new Map<number, number>();
  const walk = (n: FaceNode) => {
    if (n.tag === TAG.struct && n.meta) {
      const { id, max } = metaInfo(n);

      if (id) ids.set(id, max || ids.get(id) || 0);
    }
    if (n.tag === TAG.bind)
      for (const e of parseBind(n.hex)) if (e.id) ids.set(e.id, ids.get(e.id) || 0);
    n.subs?.forEach(walk);
  };

  face.screens.forEach(walk);
  return [...ids.entries()].map(([id, max]) => ({ id, max })).sort((a, b) => a.id - b.id);
}
