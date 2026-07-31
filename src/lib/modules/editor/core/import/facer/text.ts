// Facer's text templates: the tag language ("#DmZ#", "$#DMM#=01?JAN:$", digit-splitting
// expressions) mapped onto CMF widgets. The glyph rasterizer that bakes each value of a field
// into an equal-sized sprite moved to ../../render/glyphs — the editor generates the same sets
// from a font now, and re-exported here so the importer's own imports stay in one place.
export { DIGITS, fontOf, glyphCell, renderGlyphs, type Cell } from "../../render/glyphs";
// Sunday-first — device order, read off the stock Combo/Elaborate_2 weekday sprite lists
// (frame 0 = "Sun"), i.e. the watch indexes with JS getDay().
export const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
export const MONTHS = [
  "DEC",
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
];

// Facer spells a per-value thing out as one layer (or one conditional) per value: seven
// weekday sprites stacked at one spot, twelve month names chained in a template. That's
// exactly the watch's select widget — one widget holding N images, indexed by a data
// source — so it carries over whenever the tag maps to a source we know, mapping Facer's
// value to the index the watch counts from. #WCCI# (weather condition) has no source, so
// those icon sets still drop.
export const SEL_SRC: Record<string, { id: number; n: number; index: (v: string) => number }> = {
  DOWB: { id: 0x18, n: 7, index: (v) => (Number(v) + 6) % 7 }, // 1 = Sun -> WEEKDAYS (0 = Sun)
  DE: { id: 0x18, n: 7, index: (v) => WEEKDAYS.indexOf(v.toUpperCase()) },
  DMM: { id: 0x16, n: 12, index: (v) => Number(v) % 12 }, // 12 = Dec -> MONTHS (0 = Dec)
  DMMM: { id: 0x16, n: 12, index: (v) => MONTHS.indexOf(v.toUpperCase()) },
};

export type Live =
  | { type: "number"; id: number; digits: number; fmt: string; sub?: number; max?: number }
  | { type: "select"; id: number; labels: string[] };
// A field is a row of parts — literal sprites and live widgets in template order, packed
// into one auto-width group: "#WCT#°" is a value plus a unit, "(floor(#Db#/10))(#Db#%10):
// #DmZ#" is hour, colon, minute. dropped: tags with no CMF data source, left out of the row.
export type Part = { text: string } | Live;
export type FieldClass =
  | { type: "static"; text: string }
  | { type: "row"; parts: Part[]; dropped: string[] };

// Tags with no data source that still always render the same glyph: the weather unit
// follows the watch's own setting, and we bake Celsius rather than lose the "°C".
const LITERAL: Record<string, string> = { WM: "C", WMS: "C" };

export const isLive = (p: Part): p is Live => !("text" in p);

// A face built on a digit-sprite font spells a value out one expression per digit:
// "(floor(#Dm#/10))(#Dm#-(10*(floor(#Dm#/10))))". Collapse such a run back into the plain
// tag — the widget's fmt byte does the padding. Only when the run reaches the ones place
// (some divisor is 1 or 10): "(floor(#ZSC#/10000))(...)K" shows a slice of the number
// instead, and there is no data source for "steps / 1000". Text around the run survives
// (":#DmZ#"), text inside it doesn't — that would reorder the row.
function collapseDigits(t: string): string | null {
  const toks: { group: boolean; s: string }[] = [];
  let depth = 0,
    start = 0;

  for (let i = 0; i < t.length; i++) {
    if (t[i] === "(") {
      if (depth++ === 0) start = i;
    } else if (t[i] === ")") {
      if (--depth === 0) toks.push({ group: true, s: t.slice(start, i + 1) });
    } else if (depth === 0) toks.push({ group: false, s: t[i] });
  }
  const at = toks.map((x, i) => (x.group ? i : -1)).filter((i) => i >= 0);
  const groups = at.map((i) => toks[i].s);

  if (depth || groups.length < 2 || at[at.length - 1] - at[0] !== at.length - 1) return null;
  const tags = new Set([...groups.join("").matchAll(/#([^#]+)#/g)].map((m) => m[1]));
  const divs = [...groups.join("").matchAll(/\/(\d+)\)/g)].map((m) => Number(m[1]));

  if (tags.size !== 1 || Math.min(...divs) > 10) return null;
  if (!groups.every((g) => /floor\(|%10/.test(g))) return null;
  const lit = (from: number, to: number) =>
    toks
      .slice(from, to)
      .map((x) => x.s)
      .join("");

  return `${lit(0, at[0])}#${[...tags][0]}#${lit(at[at.length - 1] + 1, toks.length)}`;
}

// classifyText: a Facer text template -> a CMF widget descriptor, or null (skip).
// number: digit-sprite field; select: image-per-value; static: bake into the background.
export function classifyText(raw?: string): FieldClass | null {
  const src = raw || "";
  const t = src.replace(/\s+/g, "");

  if (!t.includes("#")) return { type: "static", text: src };
  const splitTens = t.match(/^\(floor\(#([^#]+)#\/10\)\)$/);
  const splitOnes =
    t.match(/^\(#([^#]+)#-\(*floor\(#\1#\/10\)\)*\*10\)$/) || t.match(/^\(#([^#]+)#%10\)$/);
  const inner = splitTens?.[1] || splitOnes?.[1];

  if (inner) {
    const S: Record<string, [number, number]> = {
      Dm: [0x0c, 0x0d],
      Dh: [0x08, 0x09],
      Db: [0x08, 0x09],
      Dk: [0x08, 0x09],
    };
    const ids = S[inner];

    if (ids)
      return {
        type: "row",
        parts: [{ type: "number", id: splitTens ? ids[0] : ids[1], fmt: "01", digits: 1 }],
        dropped: [],
      };
  }
  const N = (id: number, digits: number, fmt: string, sub = 0, max = 0): Live => ({
    type: "number",
    id,
    digits,
    fmt,
    sub,
    max,
  });
  const SEL = (id: number, labels: string[]): Live => ({ type: "select", id, labels });
  // ids picked by frequency across the stock corpus in ../watchfaces: minutes are 0x0b
  // (47 faces) not 0x04, temperature 0x5f (15) not 0x36, battery 0x24 (17) not 0x30.
  const map: Record<string, Live> = {
    Dk: N(0x07, 2, "82"),
    DK: N(0x07, 2, "82"), // 24h hour
    Dh: N(0x01, 2, "82"),
    Db: N(0x01, 2, "82"),
    DB: N(0x01, 2, "82"), // 12h hour
    Dm: N(0x0b, 2, "82"),
    DM: N(0x0b, 2, "82"), // minute
    Ds: N(0x0f, 2, "82"),
    DS: N(0x0f, 2, "82"), // second
    Dd: N(0x17, 2, "82"),
    DdL: N(0x17, 2, "02"), // day of month
    ZSC: N(0x19, 5, "05"), // steps
    ZHR: N(0x1a, 3, "03"),
    ZHRR: N(0x1a, 3, "03"), // heart rate
    BLP: N(0x24, 3, "03"),
    BLN: N(0x24, 3, "03"), // battery %
    WCT: N(0x5f, 3, "03"),
    WCCT: N(0x5f, 3, "03"), // temperature
    Da: SEL(0x13, ["AM", "PM"]),
    DA: SEL(0x13, ["AM", "PM"]),
    DE: SEL(0x18, WEEKDAYS),
    DdS: SEL(0x18, WEEKDAYS),
    DdW: SEL(0x18, WEEKDAYS),
    DMMM: SEL(0x16, MONTHS),
    DMM: SEL(0x16, MONTHS),
    DMMMM: SEL(0x16, MONTHS),
  };

  // "$#DMM#=01?JAN:$$#DMM#=02?FEB:$…" — a face without a month tag it likes spells the name
  // out as one equality per value. Same widget as #DMMM#, with the labels taken from the
  // template rather than from MONTHS.
  const chain = [...t.matchAll(/\$#([^#]+)#=(\w+)\?([^:$]*):\$/g)];
  const src0 = chain.length > 1 ? SEL_SRC[chain[0][1]] : null;

  if (src0 && t.replace(/\$#[^#]+#=\w+\?[^:$]*:\$/g, "") === "") {
    const labels = Array(src0.n).fill("");

    for (const m of chain) labels[src0.index(m[2])] = m[3];
    if (chain.every((m) => m[1] === chain[0][1] && src0.index(m[2]) >= 0))
      return { type: "row", parts: [{ type: "select", id: src0.id, labels }], dropped: [] };
  }

  // a trailing Z on a time tag is Facer's "zero-padded" variant (#DbZ#, #DmZ#, #DsZ#) —
  // padding is the fmt byte's job here, so it resolves to the same source
  const lookup = (tag: string): Live | null => map[tag] ?? map[tag.replace(/Z$/, "")] ?? null;
  // Split the template so literal text keeps its place in the row ("84" + "°"). Literals
  // carrying expression syntax are leftovers of a wrapper we only half understand
  // ("(pad(" + "#ZSC#" + ",5))") — the value is right, the parens aren't text.
  const parts: Part[] = [];
  const dropped: string[] = [];
  const isTag = (p: string) => /^#[^#]+#$/.test(p);

  for (const p of (collapseDigits(t) ?? src).split(/(#[^#]+#)/)) {
    const tag = isTag(p) ? p.slice(1, -1) : "";
    const live = tag ? lookup(tag) : null;
    const last = parts[parts.length - 1];
    const text = tag ? LITERAL[tag] : /[()]/.test(p) ? "" : p;

    if (live) parts.push(live);
    else if (!text) {
      if (tag) dropped.push(p);
    } else if (last && !isLive(last))
      last.text += text; // adjacent literals share one sprite
    else parts.push({ text });
  }
  // the same source twice in one template is an expression collapseDigits couldn't fold
  // ("(floor(#ZSC#/10000))(…)K" — steps / 1000), not a row of two fields
  const ids = parts.filter(isLive).map((p) => p.id);

  if (ids.length) return new Set(ids).size === ids.length ? { type: "row", parts, dropped } : null;
  // nothing live left: pure text once the fixed tags resolved ("°" + #WM# -> "°C") bakes in
  return dropped.length || !parts.length
    ? null
    : { type: "static", text: parts.map((p) => (isLive(p) ? "" : p.text)).join("") };
}
