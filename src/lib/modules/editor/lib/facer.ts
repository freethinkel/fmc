// Facer (facer.io) export -> editor face model (same shape as parseBin's output).
// A Facer export dir: description.json (canvas size, title), watchface.json
// (base64 JSON layer list), images/<hash> (base64 PNG; may be pre-decoded to
// <hash>.png), fonts/<name> (raw TTF). Supported: shapes, static images, literal
// text, hour/minute/second hands, and digital fields (time/date/battery/steps/…) whose
// template resolves to known #tag#s. Everything else is skipped and reported.
import { encodePixels, hex, TAG, type Face, type FaceNode, type Resource } from "./wf";

const W = 466; // CMF Watch Pro 2 screen

// Facer layer JSON — the schema isn't documented, fields are what the exports carry
/* eslint-disable @typescript-eslint/no-explicit-any */
type Layer = any;

// hand data sources: 0x0a = hour, 0x0e = minute (see handKinds in render.ts — these two
// were swapped in the old importer, before the geometry check on Simple_Dial settled it)
const HAND: Record<string, { id: number; kind: string; meta: string }> = {
  hour_hand: { id: 0x0a, kind: "hour", meta: "0000000000000000000a003c0000" },
  minute_hand: { id: 0x0e, kind: "minute", meta: "0000000000000000000e003c0000" },
  second_hand: { id: 0x72, kind: "second", meta: "00000000010000040072003c0000" },
  // 0x12 is the sweeping second source (see idValue in render.ts) — Facer's smooth tag
  second_smooth: { id: 0x12, kind: "second", meta: "00000000010000040012003c0000" },
};
// A hand is either a layer Facer typed as one, or any image whose rotation is bound to a
// clock tag — this face's sub-dial hands are plain images with r = "#DhoT#" / "#DWFM#".
// The trailing S spelling (#DWFMS#) is Facer's smooth sweep of the same hand.
// ponytail: #DWFK#/#DWFKS# is a 24h hand and lands on the 12h source — the watch has no
// 24h hand id, so it runs at double rate; drop the two entries if that reads worse than
// importing the face without an hour hand.
const ROT: Record<string, string> = {
  DWFH: "hour_hand",
  DWFHS: "hour_hand",
  DWFK: "hour_hand",
  DWFKS: "hour_hand",
  DhoT: "hour_hand",
  DhoTZ: "hour_hand",
  DWFM: "minute_hand",
  DWFMS: "minute_hand",
  DmoT: "minute_hand",
  DWFS: "second_hand",
  DsoT: "second_hand",
  DWFSS: "second_smooth",
};

const handRole = (l: Layer): string | null => {
  if (HAND[l.type_opt]) return l.type_opt;
  const m = String(l.r ?? "").match(/^#([^#]+)#$/);

  return m ? (ROT[m[1]] ?? null) : null;
};

const META0 = "0000000000000000000000000000";
const BG_META = "d201d20100000000000000000000"; // 466,466 LE + zeros

const num = (v: unknown) => (v == null || v === "" ? 0 : parseFloat(String(v)));
const argb = (v: number | string) => {
  const u = (typeof v === "string" ? parseInt(v) : v) >>> 0;

  return { r: (u >> 16) & 255, g: (u >> 8) & 255, b: u & 255, a: u >>> 24 };
};

type ARGB = ReturnType<typeof argb>;

const rgba = (c: ARGB, opacity = 100) =>
  `rgba(${c.r},${c.g},${c.b},${(c.a / 255) * (opacity / 100)})`;

// Facer opacity is a percentage, but it can also be an expression: a condition
// ("$#WCCI#=09?100:0$" on the per-condition weather icons) or an animation
// ("((sin(#DWE#*5))*50+50)" on a blinking colon). There's no expression engine on the
// watch, so a conditional layer only survives as an image select (see condOf) — null means
// "skip and report". An animated one has nothing to switch on, so it bakes in at full
// opacity: a colon that doesn't blink beats no colon.
function opacityOf(l: Layer): number | null {
  if (l.opacity == null || l.opacity === "") return 100;
  const n = parseFloat(String(l.opacity));

  if (!Number.isNaN(n)) return n;
  // a switch between two constants is what hides one of a stacked set (the weather icons)
  // and must be honoured; anything else is an animation with no off state
  return /\?\s*\d+(\.\d+)?\s*:\s*\d+(\.\d+)?\s*\$/.test(String(l.opacity)) ? null : 100;
}

// Facer spells a per-value thing out as one layer (or one conditional) per value: seven
// weekday sprites stacked at one spot, twelve month names chained in a template. That's
// exactly the watch's select widget — one widget holding N images, indexed by a data
// source — so it carries over whenever the tag maps to a source we know, mapping Facer's
// value to the index the watch counts from. #WCCI# (weather condition) has no source, so
// those icon sets still drop.
const SEL_SRC: Record<string, { id: number; n: number; index: (v: string) => number }> = {
  DOWB: { id: 0x18, n: 7, index: (v) => (Number(v) + 5) % 7 }, // 1 = Sun -> WEEKDAYS (0 = Mon)
  DE: { id: 0x18, n: 7, index: (v) => WEEKDAYS.indexOf(v.toUpperCase()) },
  DMM: { id: 0x16, n: 12, index: (v) => Number(v) % 12 }, // 12 = Dec -> MONTHS (0 = Dec)
  DMMM: { id: 0x16, n: 12, index: (v) => MONTHS.indexOf(v.toUpperCase()) },
};

function condOf(l: Layer): { id: number; n: number; index: number } | null {
  const m = String(l.opacity ?? "").match(/^\$#([^#]+)#=(\w+)\?(\d+):(\d+)\$$/);
  const s = m && SEL_SRC[m[1]];

  if (!m || !s || Number(m[3]) <= Number(m[4])) return null; // ...?0:100$ is an inverted set
  const index = s.index(m[2]);

  return index >= 0 && index < s.n ? { id: s.id, n: s.n, index } : null;
}

// Facer draws a layer in active mode unless state_active_1 clears it, and in ambient mode
// only when low_power is set. A face with a dedicated AOD design (a second full-screen
// image marked low_power) needs the two baked separately or they stack on one another.
const inActive = (l: Layer) => l.state_active_1 !== false;
const inAmbient = (l: Layer) => l.low_power === true;

// fileMap/encodeCanvas/encodeJpeg/cropOpaque are shared with ./watchmaker — this was the
// first importer written; if a third export format shows up, move them to their own module.
export function fileMap(files: File[]): Map<string, File> {
  const m = new Map<string, File>();

  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).split("/");

    m.set(parts.slice(-2).join("/"), f);
    m.set(parts[parts.length - 1], f);
  }
  return m;
}

// Facer stores the same image under several hashes; round faces sometimes only
// fill hash_square (or a cropped variant). Pick whichever is present.
const imgHash = (l: Layer): string | null =>
  l.hash_round ||
  l.hash_square ||
  l.hash_round_ambient ||
  l.hash_square_ambient ||
  l.hash_cropped ||
  null;

// Facer's base64 payloads ship unpadded, which atob rejects outright
function unb64(text: string): Uint8Array<ArrayBuffer> {
  const t = text.trim();

  return Uint8Array.from(atob(t + "=".repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function loadImage(map: Map<string, File>, hash: string): Promise<ImageBitmap> {
  const f =
    map.get(`images/${hash}`) ||
    map.get(`images/${hash}.png`) ||
    map.get(hash) ||
    map.get(`${hash}.png`);

  if (!f) throw new Error(`image ${hash} not found in the export`);
  const bytes = new Uint8Array(await f.arrayBuffer());

  if (bytes[0] === 0x89 && bytes[1] === 0x50) return createImageBitmap(new Blob([bytes]));
  return createImageBitmap(new Blob([unb64(new TextDecoder().decode(bytes))]));
}

// tint: multiply RGB, keep the source alpha (Facer is_tinted on white hands)
function tinted(
  img: ImageBitmap,
  w: number,
  h: number,
  tint: number | string | null,
): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext("2d")!;

  cx.drawImage(img, 0, 0, w, h);
  if (tint != null && tint !== -1 && tint !== "-1") {
    const t = argb(tint);

    cx.globalCompositeOperation = "multiply";
    cx.fillStyle = `rgb(${t.r},${t.g},${t.b})`;
    cx.fillRect(0, 0, w, h);
    cx.globalCompositeOperation = "destination-in";
    cx.drawImage(img, 0, 0, w, h);
  }
  return c;
}

export function encodeCanvas(canvas: OffscreenCanvas, cf: number): Promise<Resource> {
  const cx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const r = encodePixels(cx.getImageData(0, 0, w, h).data, w, h, cf);

  return createImageBitmap(canvas).then((b) => ((r.bitmap = b), r));
}

// Full-screen art used to go in as cf 1 (raw baseline JPEG) to save flash — a camo dial came
// out at 40 KB against 120 KB as cf 4. It reboots the watch: a 466×466 cf 1 on the MAIN screen
// is decoded on the AOD → normal transition and the firmware resets there (confirmed on a
// CMF Watch Pro 2 — same face with both backgrounds re-encoded as cf 4 is stable). No stock
// face carries a full-screen JPEG on the main screen either; the biggest is Metaball's
// 320×346, and the one 466×466 cf 1 in the corpus (Widgets) sits on the AOD screen only.
// Backgrounds are cf 4 now, which costs ~150 KB of flash per face.

export function cropOpaque(
  canvas: OffscreenCanvas,
): { canvas: OffscreenCanvas; x: number; y: number } | null {
  const cx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const px = cx.getImageData(0, 0, w, h).data;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;

  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[(y * w + x) * 4 + 3]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const c = new OffscreenCanvas(x1 - x0 + 1, y1 - y0 + 1);

  c.getContext("2d")!.drawImage(canvas, -x0, -y0);
  return { canvas: c, x: x0, y: y0 };
}

// ---- digital fields ----

// numMeta: struct 0x01 meta blob — bytes 0–1 = width (0x8000 marks an auto-width child of a
// centring group), 9 = data source id, 10 = sub, 11–13 = u24 max.
function numMeta(id: number, sub = 0, max = 0, auto = false): string {
  const b = new Uint8Array(14);

  if (auto) b[1] = 0x80;
  b[9] = id;
  b[10] = sub;
  b[11] = max & 255;
  b[12] = (max >> 8) & 255;
  b[13] = (max >> 16) & 255;
  return hex(b);
}

// frame 0x48: x, y, w, h (u16 LE) + byte 8 = two 2-bit alignment fields (main | cross << 2,
// 0 = START, 2 = CENTER — see parseFrame in render.ts), zero-padded to 21 bytes
const ALIGN_START = 0 | (2 << 2); // cross always centres: the row is exactly frame-height here
const ALIGN_CENTER = 2 | (2 << 2);

function frameHex(x: number, y: number, w: number, h: number, align: number): string {
  const v = new Uint8Array(21);

  v[0] = x;
  v[1] = x >> 8;
  v[2] = y;
  v[3] = y >> 8;
  v[4] = w;
  v[5] = w >> 8;
  v[6] = h;
  v[7] = h >> 8;
  v[8] = align;
  return hex(v);
}

const fontCache = new Map<string, string>();

async function loadFont(map: Map<string, File>, name?: string): Promise<string> {
  if (!name) return "bold sans-serif";
  if (fontCache.has(name)) return fontCache.get(name)!;
  const f = map.get(`fonts/${name}`) || map.get(name);

  if (!f) {
    fontCache.set(name, "bold sans-serif");
    return "bold sans-serif";
  }
  const family = `facer_${name.replace(/\W/g, "_")}`;

  try {
    const ff = new FontFace(family, await f.arrayBuffer());

    await ff.load();
    document.fonts.add(ff);
    fontCache.set(name, family);
    return family;
  } catch {
    fontCache.set(name, "bold sans-serif");
    return "bold sans-serif";
  }
}

// renderGlyphs: rasterize each label into an equal-size sprite (widest cell across all),
// so a digit font or a weekday selector never shifts when the value changes. `base` is the
// text baseline inside the cell — Facer positions text by its baseline, so a field's y is
// the layer's y minus this.
interface Cell {
  w: number;
  h: number;
  base: number;
}

function glyphCell(labels: string[], family: string, sizePx: number): Cell {
  const meas = new OffscreenCanvas(4, 4).getContext("2d")!;

  meas.font = `${sizePx}px ${family}`;
  let w = 1,
    asc = 0,
    desc = 0;

  for (const s of labels) {
    const m = meas.measureText(s);

    w = Math.max(w, Math.ceil(m.width));
    asc = Math.max(asc, m.actualBoundingBoxAscent || sizePx * 0.75);
    desc = Math.max(desc, m.actualBoundingBoxDescent || sizePx * 0.25);
  }
  const base = Math.ceil(asc) + 2;

  return { w: w + 4, h: base + Math.ceil(desc) + 2, base }; // +4: room for antialiasing
}

function renderGlyphs(labels: string[], family: string, sizePx: number, color: string, cell: Cell) {
  return labels.map((s) => {
    const c = new OffscreenCanvas(cell.w, cell.h);
    const cx = c.getContext("2d")!;

    cx.font = `${sizePx}px ${family}`;
    cx.fillStyle = color;
    cx.textAlign = "center";
    cx.textBaseline = "alphabetic";
    cx.fillText(s, cell.w / 2, cell.base);
    return c;
  });
}

const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const MONTHS = ["DEC", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV"];

type Live =
  | { type: "number"; id: number; digits: number; fmt: string; sub?: number; max?: number }
  | { type: "select"; id: number; labels: string[] };
// A field is a row of parts — literal sprites and live widgets in template order, packed
// into one auto-width group: "#WCT#°" is a value plus a unit, "(floor(#Db#/10))(#Db#%10):
// #DmZ#" is hour, colon, minute. dropped: tags with no CMF data source, left out of the row.
type Part = { text: string } | Live;
type FieldClass =
  | { type: "static"; text: string }
  | { type: "row"; parts: Part[]; dropped: string[] };

// Tags with no data source that still always render the same glyph: the weather unit
// follows the watch's own setting, and we bake Celsius rather than lose the "°C".
const LITERAL: Record<string, string> = { WM: "C", WMS: "C" };

const isLive = (p: Part): p is Live => !("text" in p);

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
function classifyText(raw?: string): FieldClass | null {
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

interface Hand {
  role: string;
  canvas: OffscreenCanvas;
  x: number;
  y: number;
  px: number;
  py: number;
  active: boolean;
  ambient: boolean;
}
interface Field {
  l: Layer;
  cls: FieldClass;
  active: boolean;
  ambient: boolean;
}
// one image-select widget: the cropped art of each value, in a shared box (see condOf)
interface Sel {
  id: number;
  n: number;
  active: boolean;
  ambient: boolean;
  cells: Map<number, { canvas: OffscreenCanvas; x: number; y: number }>;
}

// A screen's baked art: statics land on `base`, but anything declared after the first hand
// has to sit above it (the sub-dial centre cap), so it goes to `ov` and is emitted as a
// separate widget on top.
interface Sheet {
  base: OffscreenCanvas;
  ov: OffscreenCanvas;
  cur: OffscreenCanvas;
  used: boolean;
}

const newSheet = (): Sheet => {
  const base = new OffscreenCanvas(W, W);

  base.getContext("2d")!.fillStyle = "#000";
  base.getContext("2d")!.fillRect(0, 0, W, W);
  return { base, ov: new OffscreenCanvas(W, W), cur: base, used: false };
};

export async function facerToFace(files: File[]): Promise<{ face: Face; skipped: string[] }> {
  const map = fileMap(files);
  const readJSON = async (n: string) => JSON.parse(await map.get(n)!.text());

  if (!map.get("description.json") || !map.get("watchface.json"))
    throw new Error("not a Facer export: no description.json/watchface.json");
  const desc = await readJSON("description.json");
  const layers: Layer[] = JSON.parse(
    new TextDecoder().decode(unb64(await map.get("watchface.json")!.text())),
  );

  const s = W / (desc.size?.width || 320);
  const act = newSheet();
  const amb = newSheet();
  const hands: Hand[] = []; // a face may ship separate active/ambient art for the same role
  const fields: Field[] = [];
  const sels = new Map<string, Sel>();
  const skips = new Set<string>(); // deduped — a face can carry 18 near-identical weather icons
  const label = (l: Layer) => String(l.name || l.text || l.type_opt || l.type);

  // #WCCI# is the weather condition, and the watch has no source for it — checked across the
  // whole corpus in ../watchfaces: every meta id, every 0x5f slot menu, every 0x02 bind. So
  // the set can't switch; pick one frame and bake it, preferring the cloud — it reads as
  // "weather" whatever the sky is doing — over losing the icon altogether.
  const CLOUD = ["03", "04", "02", "50", "13", "09", "10", "11", "01"];
  const wcci = (l: Layer) =>
    l.type === "dynamic_image" ? String(l.opacity ?? "").match(/^\$#WCCI#=(\w+)\?\d+:0\$$/) : null;
  const baked = new Map<string, string>(); // one frame per icon set (a face can carry two)

  for (const l of layers) {
    const m = wcci(l);
    const rank = (v: string) => (CLOUD.indexOf(v) + 1 || CLOUD.length + 1) - 1;

    if (!m) continue;
    const k = `${l.x}:${l.y}:${inActive(l)}:${inAmbient(l)}`;
    const cur = baked.get(k);

    if (cur === undefined || rank(m[1]) < rank(cur)) baked.set(k, m[1]);
  }
  const oneFrame = (l: Layer): "keep" | "drop" | "" => {
    const m = wcci(l);

    if (!m) return "";
    return baked.get(`${l.x}:${l.y}:${inActive(l)}:${inAmbient(l)}`) === m[1] ? "keep" : "drop";
  };

  for (const l of layers) {
    let opacity = opacityOf(l);
    const cond = l.type === "dynamic_image" ? condOf(l) : null;
    const one = oneFrame(l);

    if (one === "drop") {
      skips.add(`${label(l)} (weather set — only the cloud frame is baked)`);
      continue;
    }
    if (one === "keep") opacity = 100;

    // a position can be an expression too ("(86+(#DOW#*24.8))" slides a marker along a
    // weekday row) — nothing to place it at, and NaN coordinates would drop it silently
    if (Number.isNaN(num(l.x) + num(l.y))) {
      skips.add(`${label(l)} (position expression)`);
      continue;
    }

    if (cond && imgHash(l)) {
      // draw it where Facer puts it, then crop — these sets are often full-canvas art with
      // one label in a corner, and a 466×466 sprite per value would eat the flash budget
      const img = await loadImage(map, imgHash(l)!);
      const w = num(l.width) * s || W,
        h = num(l.height) * s || W;
      const tmp = new OffscreenCanvas(W, W);

      const art = tinted(img, Math.round(w), Math.round(h), l.is_tinted ? l.tint_color : -1);

      tmp.getContext("2d")!.drawImage(art, num(l.x) * s - w / 2, num(l.y) * s - h / 2);
      const crop = cropOpaque(tmp);
      const key = `${cond.id}:${l.x}:${l.y}:${inActive(l)}:${inAmbient(l)}`;
      const sel = sels.get(key) ?? {
        id: cond.id,
        n: cond.n,
        active: inActive(l),
        ambient: inAmbient(l),
        cells: new Map(),
      };

      if (crop) sel.cells.set(cond.index, crop);
      sels.set(key, sel);
      continue;
    }
    if (opacity === null) {
      skips.add(`${label(l)} (conditional opacity)`);
      continue;
    }
    if (opacity <= 0) continue;
    const on = [inActive(l) ? act : null, inAmbient(l) ? amb : null].filter(Boolean) as Sheet[];

    if (l.type === "text") {
      const cls = classifyText(l.text);

      if (!cls) {
        skips.add(label(l));
        continue;
      }
      if (cls.type !== "static") {
        for (const d of cls.dropped) skips.add(`${d} in "${l.text}" (no CMF data source)`);
        if (on.length) fields.push({ l, cls, active: inActive(l), ambient: inAmbient(l) });
        continue;
      }
      const family = await loadFont(map, l.new_font_name);
      const text = l.transform === 1 ? cls.text.toUpperCase() : cls.text;

      for (const sh of on) {
        const cx = sh.cur.getContext("2d")!;

        cx.font = `${Math.round(num(l.size) * s) || 20}px ${family}`;
        cx.fillStyle = rgba(argb(sh === amb ? (l.low_power_color ?? l.color) : l.color), opacity);
        cx.textAlign = (["left", "center", "right"] as const)[l.alignment] || "center";
        cx.textBaseline = "alphabetic";
        cx.fillText(text, num(l.x) * s, num(l.y) * s);
        sh.used = true;
      }
    } else if (l.type === "shape") {
      for (const sh of on) {
        const cx = sh.cur.getContext("2d")!;

        cx.fillStyle = rgba(argb(l.color), opacity);
        if (l.shape_type === 0) {
          cx.beginPath();
          cx.arc(num(l.x) * s, num(l.y) * s, num(l.radius) * s, 0, 2 * Math.PI);
          cx.fill();
        } else {
          cx.fillRect(num(l.x) * s, num(l.y) * s, num(l.width) * s, num(l.height) * s);
        }
        sh.used = true;
      }
    } else if (l.type === "dynamic_image" && handRole(l)) {
      const hash = imgHash(l);

      if (!hash) {
        skips.add(`${label(l)} (empty)`);
        continue;
      }
      const img = await loadImage(map, hash);
      const w = Math.round(num(l.width) * s),
        h = Math.round(num(l.height) * s);

      hands.push({
        role: handRole(l)!,
        canvas: tinted(img, w, h, l.is_tinted ? l.tint_color : -1),
        x: Math.round(num(l.x) * s - w / 2),
        y: Math.round(num(l.y) * s - h / 2),
        px: w >> 1,
        py: h >> 1,
        active: inActive(l),
        ambient: inAmbient(l),
      });
      for (const sh of on) sh.cur = sh.ov; // statics after a hand go above it
    } else if (l.type === "dynamic_image") {
      const hash = imgHash(l);

      if (!hash) continue; // Facer keeps empty placeholder slots in every export
      if (String(l.r ?? "").includes("#")) {
        // rotates on something we can't express — baking it flat would freeze it mid-sweep
        skips.add(`${label(l)} (rotation ${l.r})`);
        continue;
      }
      const img = await loadImage(map, hash);
      let w = num(l.width) * s,
        h = num(l.height) * s;

      if (!w || !h) {
        w = W;
        h = W;
      } // Facer: 0 = full-canvas background
      const t = tinted(img, Math.round(w), Math.round(h), l.is_tinted ? l.tint_color : -1);

      for (const sh of on) {
        const cx = sh.cur.getContext("2d")!;

        cx.globalAlpha = opacity / 100;
        cx.drawImage(t, num(l.x) * s - w / 2, num(l.y) * s - h / 2); // alignment 4 = centred
        cx.globalAlpha = 1;
        sh.used = true;
      }
    }
  }

  const TIME_IDS = new Set([0x01, 0x07, 0x08, 0x09, 0x0b, 0x0c, 0x0d, 0x0f, 0x13]);
  const roles = new Set(hands.map((h) => h.role));
  const hasHands = roles.has("hour_hand") && roles.has("minute_hand");
  const hasTime = fields.some(
    (f) => f.cls.type === "row" && f.cls.parts.some((p) => isLive(p) && TIME_IDS.has(p.id)),
  );

  if (!hasHands && !hasTime)
    throw new Error("no clock layers found — need analog hands or a digital time field");

  // ---- resources + tree ----
  const resources: Resource[] = [];
  const addRes = async (canvas: OffscreenCanvas, cf: number) =>
    resources.push(await encodeCanvas(canvas, cf)) - 1;
  const scaled = (src: OffscreenCanvas, w: number, h: number) => {
    const c = new OffscreenCanvas(w, h);

    c.getContext("2d")!.drawImage(src, 0, 0, w, h);
    return c;
  };
  const imgWidget = (x: number, y: number, meta: string, res: number): FaceNode => ({
    tag: TAG.image,
    subs: [{ tag: TAG.struct, x, y, meta, refType: 0x61, images: [res] }],
  });
  const handWidget = (h: Hand, res: number): FaceNode => ({
    tag: TAG.hand,
    subs: [
      {
        tag: TAG.struct,
        x: h.x,
        y: h.y,
        meta: HAND[h.role].meta,
        refType: 0x61,
        images: [res],
        _kind: HAND[h.role].kind,
      },
      { tag: TAG.pivot, flag: 1, pivotX: h.px, pivotY: h.py },
    ],
  });
  // one widget, one image per value of the source: pad every cell into the union box so the
  // art stays where Facer had it whichever value is showing
  async function selWidget(sel: Sel): Promise<FaceNode> {
    const box = [...sel.cells.values()];
    const x = Math.min(...box.map((c) => c.x)),
      y = Math.min(...box.map((c) => c.y));
    const w = Math.max(...box.map((c) => c.x + c.canvas.width)) - x,
      h = Math.max(...box.map((c) => c.y + c.canvas.height)) - y;
    const images: number[] = [];

    for (let i = 0; i < sel.n; i++) {
      const c = new OffscreenCanvas(w, h);
      const cell = sel.cells.get(i);

      if (cell) c.getContext("2d")!.drawImage(cell.canvas, cell.x - x, cell.y - y);
      images.push(await addRes(c, 5));
    }
    return {
      tag: TAG.image,
      subs: [{ tag: TAG.struct, x, y, meta: numMeta(sel.id), refType: 0x61, images }],
    };
  }
  const preview = (res: number): FaceNode => ({
    tag: TAG.preview,
    subs: [{ tag: TAG.pvStruct, prefix: "0000000000", refType: 0x61, images: [res] }],
  });

  // buildField: a classified text layer -> a CMF widget node.
  // Everything goes in a 0x68 group whose 0x48 frame lays out auto-width (meta.w = 0x8000)
  // children — that's how the stock faces both centre a field and pack a value next to its
  // unit ("80" + "%"). A plain x can only be right for one digit count, and there is no other
  // way to keep literal text glued to a value whose width changes.
  async function buildField({ l, cls }: Field, ambient: boolean): Promise<FaceNode> {
    if (cls.type !== "row") throw new Error("unreachable");
    const family = await loadFont(map, l.new_font_name);
    const sizePx = Math.round(num(l.size) * s) || 20;
    const color = rgba(argb(ambient ? (l.low_power_color ?? l.color) : l.color));
    const labelsOf = (p: Part) => (!isLive(p) ? [p.text] : p.type === "select" ? p.labels : DIGITS);
    // one vertical metric across every part so the whole row shares a baseline
    const tall = glyphCell(cls.parts.flatMap(labelsOf), family, sizePx);
    const sprites = new Map<string, number[]>(); // hour and minute share one digit set
    const cellOf = async (p: Part) => {
      const labels = labelsOf(p);
      const cell = { ...glyphCell(labels, family, sizePx), h: tall.h, base: tall.base };
      const key = labels.join("|");

      if (!sprites.has(key)) {
        const res: number[] = [];

        for (const sp of renderGlyphs(labels, family, sizePx, color, cell))
          res.push(await addRes(sp, 5));
        sprites.set(key, res);
      }
      return { cell, images: sprites.get(key)! };
    };
    const auto = (meta: string, images: number[], node: (st: FaceNode) => FaceNode) =>
      node({ tag: TAG.struct, x: 0, y: 0, meta, refType: 0x61, images });
    const kids: FaceNode[] = [];
    let row = 0;

    for (const p of cls.parts) {
      const { cell, images } = await cellOf(p);

      if (!isLive(p)) {
        row += cell.w;
        kids.push(auto(numMeta(0, 0, 0, true), images, (st) => ({ tag: TAG.image, subs: [st] })));
        continue;
      }
      const meta = numMeta(p.id, p.type === "number" ? p.sub || 0 : 0, 0, true);

      row += cell.w * (p.type === "number" ? p.digits : 1);
      kids.push(
        auto(meta, images, (st) =>
          p.type === "number"
            ? { tag: TAG.number, subs: [st, { tag: TAG.fmt, hex: p.fmt }] }
            : { tag: TAG.image, subs: [st] },
        ),
      );
    }
    const ax = Math.round(num(l.x) * s);
    const y = Math.max(0, Math.round(num(l.y) * s - tall.base));

    // frame width 0 means "auto-size to content", so the row just starts at the frame origin —
    // that covers left align, and right align by shifting the origin back a typical row width.
    // widest box centred on ax that still fits the screen; too narrow means ax sits near an
    // edge, where there is nothing to centre against
    const gw = Math.min(2 * ax, 2 * (W - ax));
    const [fx, fw, al] =
      l.alignment === 1 && gw > row
        ? [ax - gw / 2, gw, ALIGN_CENTER]
        : l.alignment === 2
          ? [Math.max(0, ax - row), 0, ALIGN_START]
          : [ax, 0, ALIGN_START];

    return {
      tag: TAG.group,
      subs: [{ tag: TAG.frame, hex: frameHex(fx, y, fw, tall.h, al) }, ...kids],
    };
  }

  const name =
    (desc.title || "Facer")
      .replace(/[^ -~]/g, "")
      .trim()
      .slice(0, 14) || "Facer";
  const handRes: number[] = [];

  // Crop every hand to its ink before encoding, shifting x/y and the pivot by the same amount
  // so it still rotates around the same point. Facer hands are usually full-canvas PNGs: kept
  // whole, one 466×466 cf 5 sprite costs 650 KB of RAM on the watch (a 3-hand face imported
  // this way reboots it), against ~25 KB cropped. Same treatment as watchmaker.ts's hands.
  for (const h of hands) {
    const crop = cropOpaque(h.canvas);

    if (crop) {
      h.canvas = crop.canvas;
      h.x += crop.x;
      h.y += crop.y;
      h.px -= crop.x;
      h.py -= crop.y;
    }
    handRes.push(await addRes(h.canvas, 5));
  }

  // AOD falls back to a dimmed copy of the active art when the face has no low_power layers
  if (!amb.used) {
    const dcx = amb.base.getContext("2d")!;

    dcx.drawImage(act.base, 0, 0);
    dcx.fillStyle = "rgba(0,0,0,0.6)";
    dcx.globalCompositeOperation = "source-atop";
    dcx.fillRect(0, 0, W, W);
    dcx.globalCompositeOperation = "source-over";
    amb.ov.getContext("2d")!.drawImage(act.ov, 0, 0);
  }

  async function screen(tag: number, sh: Sheet, pick: (f: Field) => boolean, ambient: boolean) {
    const subs: FaceNode[] = tag === TAG.main ? [{ tag: TAG.name, text: name }] : [];

    subs.push(preview(await addRes(scaled(sh.base, 270, 270), 4)));
    subs.push(imgWidget(0, 0, BG_META, await addRes(sh.base, 4)));
    for (const f of fields) if (pick(f)) subs.push(await buildField(f, ambient));
    for (const sel of sels.values())
      if ((ambient ? sel.ambient : sel.active) && sel.cells.size) subs.push(await selWidget(sel));
    const drawn = new Set<string>(); // one hand per role per screen

    for (const [i, h] of hands.entries())
      if ((ambient ? h.ambient : h.active) && !drawn.has(h.role)) {
        drawn.add(h.role);
        subs.push(handWidget(h, handRes[i]));
      }
    const crop = cropOpaque(sh.ov);

    if (crop) subs.push(imgWidget(crop.x, crop.y, META0, await addRes(crop.canvas, 5)));
    return { tag, subs };
  }

  const main = await screen(TAG.main, act, (f) => f.active, false);
  const aod = await screen(TAG.aod, amb, (f) => f.ambient, true);
  const nameRaw = new Uint8Array(16);

  new TextEncoder().encodeInto(name, nameRaw);
  nameRaw[15] = 0x0a; // same as CDN files, byte meaning not figured out
  return {
    face: { name, nameRaw: hex(nameRaw), screens: [main, aod], resources },
    skipped: [...skips],
  };
}
