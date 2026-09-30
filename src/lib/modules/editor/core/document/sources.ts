// Data sources: what the watch feeds a widget, and the simulated values the editor feeds it
// instead. A source id is meta[9] of a struct (see docs/cmf-protocol.md §9.6a), the id of a
// visibility condition, and an entry of a widget slot's metric menu.
import { hex, unhex, type FaceNode } from "../format";
import type { Condition, Doc, Layer } from "./doc";

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
  // Same face again (see 0x84 below): the widget beside its heart rate, reading 98 under a
  // blood-oxygen icon on the screenshot.
  0x1b: "blood oxygen",
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
  // Last night's sleep, on the same face: an hours/minutes pair reading "7.36" inside a ring
  // that gauges the same value against the wearer's sleep goal (0x81 ring, spec max 100).
  0x42: "sleep hours",
  0x43: "sleep min",
  0x46: "sleep (ring)",
  0x48: "stand hours",
  0x49: "steps (slot)",
  0x5f: "temperature",
  0x6a: "steps (slot)?",
  // slot-menu ids seen in the corpus with nothing to pin them to: a face's picker icons are its
  // own art and aren't laid out in metric order, so they can't name these
  0x6d: "slot metric 0x6d ?",
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
  // Sunrise/sunset, read off the stock `Default__280__Multifunction` face — the only corpus file
  // that binds them. Each is an hour/minute pair inside one auto-layout group flanking the sun
  // arc (sunrise left at x=41, sunset right at x=377), laid out exactly like the face's own
  // hour/minute clock group: hour first, separator image, then the minute, whose widget declares
  // max=60. That, and the 05:41 / 06:24 the face renders on either side of the arc, is what
  // names them.
  0x84: "sunrise hour",
  0x85: "sunrise min",
  0x86: "sunset hour",
  0x87: "sunset min",
  0x8b: "aqi",
};

/** The four sunrise/sunset sources, in the order a face lays them out. */
export const SUN_IDS = [0x84, 0x85, 0x86, 0x87];
/** Sleep: the hours/minutes pair and the ring gauging the same duration. */
export const SLEEP_IDS = [0x42, 0x43, 0x46];

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
  (isSlotSel(id) ? `slot ${id - SLOT_SEL_ID} selection` : `id 0x${id.toString(16)}`);

// The firmware exposes several aliases under one name — two `month`, two `battery`, four
// `steps (slot)?`. Those are the only entries where the raw id is doing any work, so it's the
// only place a picker shows one.
const AMBIGUOUS = new Set(Object.values(ID_LABELS).filter((l, i, all) => all.indexOf(l) !== i));

/** What a source picker shows: the plain name, disambiguated by id only where it has to be. */
export const pickerLabel = (id: number) => {
  const label = ID_LABELS[id];

  if (!id) return "none — static"; // meta byte 9 left at 0: the widget reads no live value
  if (!label) return sourceLabel(id); // unknown id — the number is all we have to go on
  return AMBIGUOUS.has(label) ? `${label} (0x${id.toString(16)})` : label;
};

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
  spo2: SimValue; // blood oxygen, % (0x1b)
  stands: SimValue; // hours stood (0x48) — see ID_LABELS/idValue note, corrected from "calories"
  stepsGoal: SimValue;
  calGoal: SimValue;
  standsGoal: SimValue; // ring denominator for 0x48, the watch's default stand goal is 12 h
  // Minutes since midnight, feeding the 0x84..0x87 hour/minute pair each. ponytail: two numbers
  // the user types, not a computed almanac — the watch gets these from the phone, and a preview
  // has no location to compute them from. If one is ever wanted, sunrise/sunset from a lat/lon
  // is a dozen lines of trigonometry that would replace exactly these two fields.
  sunrise: number;
  sunset: number;
  // Last night's sleep and the goal its ring divides by, both in minutes — same hour/minute
  // split, so the panel offers them the same way.
  sleep: number;
  sleepGoal: number;
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

// The watch's own accent picker offers a fixed set, not a free color wheel — so does ours, or
// the preview would show a tint the device can never produce. Which HUES are on offer is
// confirmed against the watch (notably: there is no teal, and there is a dark grey).
// ponytail: the exact hex of each swatch is still eyeballed, only the two marked below come from
// bytes in the corpus — match them to a screenshot of the watch's settings screen if a preview
// ever has to be shade-accurate.
export const ACCENT_PALETTE = [
  "#ff2c00", // orange — the factory default, confirmed baked on Combo's plain steps ring
  "#ffd60a", // yellow
  "#34c759", // green
  "#64d2ff", // light blue
  "#0a84ff", // blue
  "#bf5af2", // lilac
  "#ff375f", // pink
  "#e3e1e6", // near-white, confirmed baked on id 0x6c across three independent faces
  "#48484a", // dark grey
];

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
    spo2: 98,
    stands: 5,
    stepsGoal: 10000,
    calGoal: 500,
    standsGoal: 12,
    sunrise: 5 * 60 + 41, // the times the stock Multifunction face's own screenshot shows
    sunset: 18 * 60 + 24,
    sleep: 7 * 60 + 36, // ditto, against the watch's own 8-hour default goal
    sleepGoal: 8 * 60,
    overrides: {}, // id -> number, manual override of any source
    accentColor: null,
    showSlotPlaceholders: false,
  };
}

export const PREVIEW_TIME = new Date(2026, 0, 8, 10, 9, 36).getTime();

export const previewSim = (sim: Sim): Sim => ({
  ...sim,
  live: false,
  time: PREVIEW_TIME,
  is24h: true,
  showSlotPlaceholders: false,
  overrides: {},
});

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

/** The simulator fields that stand for a real metric — everything else it holds is time or a
 *  display option. */
export type SimMetric =
  | "steps"
  | "hr"
  | "battery"
  | "calories"
  | "distance"
  | "temp"
  | "aqi"
  | "spo2"
  | "stands";

/** Which metric each data source reads. The firmware exposes one metric under a pile of ids —
 *  `steps` alone answers eight of them — so this is what lets the simulator offer ONE input per
 *  metric instead of one per id, and what idValue reads for every source that is a plain
 *  passthrough. The derived ones (distance's km/mi, integer/fraction splits) are listed here for
 *  the panel's sake but still compute their own value in the switch below. */
export const ID_METRIC: Record<number, SimMetric> = {
  0x19: "steps",
  0x25: "steps",
  0x26: "steps",
  0x49: "steps",
  // unlabelled complication-slot / goal metrics — they behave like a steps goal ring
  0x6a: "steps",
  0x6c: "steps",
  0x6f: "steps",
  0x82: "steps",
  0x1a: "hr",
  0x1b: "spo2",
  // 0x48/0x24 corrected against Function's widget-slot menu icons (standing figure/lightning
  // bolt, not calories/steps) — 0x48 is stand hours, 0x24 is battery.
  0x24: "battery",
  0x30: "battery",
  0x48: "stands",
  0x1c: "calories",
  0x1e: "calories",
  0x27: "calories",
  0x36: "temp",
  0x5f: "temp",
  0x8b: "aqi",
  0x22: "distance", // derived below: km/mi, integer and fraction
  0x23: "distance",
  0x74: "distance",
  0x75: "distance",
  0x76: "distance",
};

/** The goal a metric's ring divides by, where it has one. */
export const METRIC_GOAL: Partial<Record<SimMetric, "stepsGoal" | "calGoal" | "standsGoal">> = {
  steps: "stepsGoal",
  calories: "calGoal",
  stands: "standsGoal",
};

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
    case 0x22:
      return Math.floor(Number(sim.distance) / 1000);
    case 0x23:
      return Math.floor(Number(sim.distance) / 1609.34);
    case 0x73:
      return sim.is24h ? 1 : 0;
    case 0x74:
      return Math.floor(Number(sim.distance) / 100) % 10;
    case 0x75:
      return Math.floor(Number(sim.distance) / 160.934) % 10;
    // ponytail: slot-menu labels only, unit unverified — km int / plain AQI, override per face
    case 0x76:
      return Math.floor(Number(sim.distance) / 1000);
    // Sunrise/sunset. The hour follows the device's 12/24h setting the way 0x01 does — the stock
    // face's screenshot prints an evening sunset as "06:24" — so the sim's own 24-hour switch
    // drives it; flip it, or override the id, if a device ever says otherwise.
    case 0x84:
      return sim.is24h ? Math.floor(sim.sunrise / 60) : h12(Math.floor(sim.sunrise / 60));
    case 0x85:
      return sim.sunrise % 60;
    case 0x86:
      return sim.is24h ? Math.floor(sim.sunset / 60) : h12(Math.floor(sim.sunset / 60));
    case 0x87:
      return sim.sunset % 60;
    // Sleep: the pair splits the duration, the ring reads it whole and divides by the goal
    // (see goalOf) — the same shape as a steps ring.
    case 0x42:
      return Math.floor(sim.sleep / 60);
    case 0x43:
      return sim.sleep % 60;
    case 0x46:
      return sim.sleep;
    default: {
      // every source that just hands its metric back, from the one table the panel groups by
      const metric = ID_METRIC[id];

      return metric ? Number(sim[metric]) : 0;
    }
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
    0x46: sim.sleepGoal,
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

/** Inverse of parseBind. */
export function buildBind(entries: BindEntry[]): string {
  const v = new Uint8Array(1 + 5 * entries.length);

  v[0] = entries.length;
  entries.forEach((e, i) => {
    const o = 1 + 5 * i;

    v[o] = e.id;
    v[o + 1] = e.op;
    v[o + 2] = e.val;
    v[o + 3] = e.val >> 8;
    v[o + 4] = e.val >> 16;
  });
  return hex(v);
}

// Slot selection lives on a synthetic id per slot — see withSlotOverrides. It's the one bind id
// that isn't a metric, so the inspector can offer it as a picker instead of raw hex.
export const SLOT_SEL_ID = 0x79;
export const SLOT_SEL_MAX = 0x7e;
export const isSlotSel = (id: number) => id >= SLOT_SEL_ID && id <= SLOT_SEL_MAX;

export interface SlotInfo {
  /** 0x5f byte 0 — what the widget's own condition id is offset by. */
  index: number;
  activeIdx: number;
  ids: number[];
}

/** withSlotOverrides over the Doc model — same synthetic 0x79 + slotIndex, read off SlotLayers. */
export function withSlotOverridesDoc(layers: readonly Layer[], sim: Sim): Sim {
  const extra: Record<number, number> = {};
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      if (l.kind === "slot") extra[SLOT_SEL_ID + l.index] = l.active;
      if (l.kind === "group") walk(l.children);
      if (l.kind === "raw" && l.children) walk(l.children);
    }
  };

  walk(layers);
  return Object.keys(extra).length ? { ...sim, overrides: { ...extra, ...sim.overrides } } : sim;
}

/** collectSlots over the Doc model — a SlotLayer already carries what the 0x5f body encodes. */
export function collectSlotsDoc(layers: readonly Layer[]): SlotInfo[] {
  const out: SlotInfo[] = [];
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      if (l.kind === "slot") out.push({ index: l.index, activeIdx: l.active, ids: [...l.metrics] });
      if (l.kind === "group") walk(l.children);
      if (l.kind === "raw" && l.children) walk(l.children);
    }
  };

  walk(layers);
  return out.sort((a, b) => a.index - b.index);
}

/** describeBind over decoded conditions — same wording, no hex to parse. */
export function describeConditions(conditions: readonly Condition[]): string[] {
  return conditions.map(({ source, op, value }) => {
    const s = sourceLabel(source);

    switch (op) {
      case "eq":
        return `show if ${s} = ${value}`;
      case "ne":
        return `hide if ${s} = ${value}`;
      case "noData":
        return `show if ${s} = ${value} (no-data marker)`;
      case "lt":
        return `only if ${s} < ${value}`;
      case "gte":
        return `only if ${s} ≥ ${value}`;
      case "lte":
        return `only if ${s} ≤ ${value}`;
    }
  });
}

/** collectIds over the Doc model: a layer's own source plus every source its conditions gate on. */
export function collectIdsDoc(doc: Doc): { id: number; max: number }[] {
  const ids = new Map<number, number>();
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      if (l.kind !== "group" && l.kind !== "raw" && l.meta.source)
        ids.set(l.meta.source, l.meta.max || ids.get(l.meta.source) || 0);
      for (const c of l.conditions) if (c.source) ids.set(c.source, ids.get(c.source) || 0);
      if (l.kind === "group") walk(l.children);
      if (l.kind === "raw" && l.children) walk(l.children);
    }
  };

  doc.screens.forEach((s) => walk(s.layers));
  return [...ids.entries()].map(([id, max]) => ({ id, max })).sort((a, b) => a.id - b.id);
}
