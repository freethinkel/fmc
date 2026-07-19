// Facer (facer.io) export -> editor face model (same shape as parseBin's output).
// A Facer export dir: description.json (canvas size, title), watchface.json
// (base64 JSON layer list), images/<hash> (base64 PNG; may be pre-decoded to
// <hash>.png). Supported: shapes, static images, hour/minute/second hands.
// Digital fields (time/date/battery/steps/…) become CMF number/image widgets with
// digit sprites rendered from the layer's font; unrecognized formulas are skipped.
import { encodePixels, TAG, hex, type Face, type FaceNode, type Resource } from './wf';

const W = 466; // CMF Watch Pro 2 screen

// Facer layer JSON — схема не документирована, поля по факту
/* eslint-disable @typescript-eslint/no-explicit-any */
type Layer = any;

const HAND_META: Record<string, string> = {
  minute_hand: '0000000000000000000a003c0000',
  hour_hand: '0000000000000000000e003c0000',
  second_hand: '00000000010000040072003c0000',
};
const META0 = '0000000000000000000000000000';

const num = (v: unknown) => (v == null || v === '' ? 0 : parseFloat(String(v)));
const argb = (v: number) => {
  const u = v >>> 0;
  return { r: u >> 16 & 255, g: u >> 8 & 255, b: u & 255, a: u >>> 24 };
};
type ARGB = ReturnType<typeof argb>;
const rgba = (c: ARGB, opacity = 100) =>
  `rgba(${c.r},${c.g},${c.b},${(c.a / 255) * (opacity > 0 && opacity < 100 ? opacity / 100 : 1)})`;

function fileMap(files: File[]): Map<string, File> {
  const m = new Map<string, File>();
  for (const f of files) {
    const parts = (f.webkitRelativePath || f.name).split('/');
    m.set(parts.slice(-2).join('/'), f);
    m.set(parts[parts.length - 1], f);
  }
  return m;
}

// Facer stores the same image under several hashes; round faces sometimes only
// fill hash_square (or a cropped variant). Pick whichever is present.
const imgHash = (l: Layer): string | null =>
  l.hash_round || l.hash_square || l.hash_round_ambient || l.hash_square_ambient || l.hash_cropped || null;

async function loadImage(map: Map<string, File>, hash: string): Promise<ImageBitmap> {
  const f = map.get(`images/${hash}`) || map.get(`images/${hash}.png`) || map.get(hash) || map.get(`${hash}.png`);
  if (!f) throw new Error(`image ${hash} not found in the export`);
  const bytes = new Uint8Array(await f.arrayBuffer());
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return createImageBitmap(new Blob([bytes]));
  const raw = Uint8Array.from(atob(new TextDecoder().decode(bytes).trim()), c => c.charCodeAt(0));
  return createImageBitmap(new Blob([raw]));
}

// tint: multiply RGB, keep the source alpha (Facer is_tinted on white hands)
function tinted(img: ImageBitmap, w: number, h: number, tint: number | string | null): OffscreenCanvas {
  const c = new OffscreenCanvas(w, h);
  const cx = c.getContext('2d')!;
  cx.drawImage(img, 0, 0, w, h);
  if (tint != null && tint !== -1 && tint !== '-1') {
    const t = argb(typeof tint === 'string' ? parseInt(tint) : tint);
    cx.globalCompositeOperation = 'multiply';
    cx.fillStyle = `rgb(${t.r},${t.g},${t.b})`;
    cx.fillRect(0, 0, w, h);
    cx.globalCompositeOperation = 'destination-in';
    cx.drawImage(img, 0, 0, w, h);
  }
  return c;
}

function encodeCanvas(canvas: OffscreenCanvas, cf: number): Promise<Resource> {
  const cx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const r = encodePixels(cx.getImageData(0, 0, w, h).data, w, h, cf);
  return createImageBitmap(canvas).then(b => ((r.bitmap = b), r));
}

function cropOpaque(canvas: OffscreenCanvas): { canvas: OffscreenCanvas; x: number; y: number } | null {
  const cx = canvas.getContext('2d')!;
  const { width: w, height: h } = canvas;
  const px = cx.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
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
  c.getContext('2d')!.drawImage(canvas, -x0, -y0);
  return { canvas: c, x: x0, y: y0 };
}

// ---- digital fields ----

// numMeta: struct 0x01 meta blob — byte 9 = data source id, 10 = sub, 11–13 = u24 max.
function numMeta(id: number, sub = 0, max = 0): string {
  const b = new Uint8Array(14);
  b[9] = id; b[10] = sub;
  b[11] = max & 255; b[12] = (max >> 8) & 255; b[13] = (max >> 16) & 255;
  return hex(b);
}

const fontCache = new Map<string, string>();
async function loadFont(map: Map<string, File>, name?: string): Promise<string> {
  if (!name) return 'bold sans-serif';
  if (fontCache.has(name)) return fontCache.get(name)!;
  const f = map.get(`fonts/${name}`) || map.get(name);
  if (!f) { fontCache.set(name, 'bold sans-serif'); return 'bold sans-serif'; }
  const family = `facer_${name.replace(/\W/g, '_')}`;
  try {
    const ff = new FontFace(family, await f.arrayBuffer());
    await ff.load();
    document.fonts.add(ff);
    fontCache.set(name, family);
    return family;
  } catch {
    fontCache.set(name, 'bold sans-serif');
    return 'bold sans-serif';
  }
}

// renderGlyphs: rasterize each label into an equal-size sprite (max cell across all),
// so a digit font or a weekday selector never shifts when the value changes.
function renderGlyphs(labels: string[], family: string, sizePx: number, color: string) {
  const meas = new OffscreenCanvas(4, 4).getContext('2d')!;
  meas.font = `${sizePx}px ${family}`;
  let cw = 1;
  for (const s of labels) cw = Math.max(cw, Math.ceil(meas.measureText(s).width));
  cw += 4;
  const ch = Math.ceil(sizePx * 1.35);
  const sprites = labels.map(s => {
    const c = new OffscreenCanvas(cw, ch);
    const cx = c.getContext('2d')!;
    cx.font = `${sizePx}px ${family}`;
    cx.fillStyle = color;
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(s, cw / 2, ch / 2);
    return c;
  });
  return { sprites, w: cw, h: ch };
}

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
const MONTHS = ['DEC', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV'];

type FieldClass =
  | { type: 'static' }
  | { type: 'number'; id: number; digits: number; fmt: string; sub?: number; max?: number }
  | { type: 'select'; id: number; labels: string[] };

// classifyText: a Facer text template -> a CMF widget descriptor, or null (skip).
// number: digit-sprite field; select: image-per-value; static: bake into the background.
function classifyText(raw?: string): FieldClass | null {
  const t = (raw || '').replace(/\s+/g, '');
  if (!t.includes('#')) return { type: 'static' };
  // exactly one #tag# (compound multi-field layers aren't laid out in v1)
  const tags = t.match(/#[^#]+#/g) || [];
  const splitTens = t.match(/^\(floor\(#([^#]+)#\/10\)\)$/);
  const splitOnes = t.match(/^\(#([^#]+)#-\(*floor\(#\1#\/10\)\)*\*10\)$/) || t.match(/^\(#([^#]+)#%10\)$/);
  const inner = splitTens?.[1] || splitOnes?.[1];
  if (inner) {
    const part = splitTens ? 'tens' : 'ones';
    const S: Record<string, [number, number]> = { Dm: [0x0c, 0x0d], Dh: [0x08, 0x09], Db: [0x08, 0x09], Dk: [0x08, 0x09] };
    const ids = S[inner];
    if (ids) return { type: 'number', id: part === 'tens' ? ids[0] : ids[1], fmt: '01', digits: 1 };
  }
  if (tags.length !== 1) return null; // unknown formula / multi-field
  const tag = tags[0].slice(1, -1);
  const N = (id: number, digits: number, fmt: string, sub = 0, max = 0): FieldClass =>
    ({ type: 'number', id, digits, fmt, sub, max });
  const SEL = (id: number, labels: string[]): FieldClass => ({ type: 'select', id, labels });
  const map: Record<string, FieldClass> = {
    Dk: N(0x07, 2, '82'), DK: N(0x07, 2, '82'),                 // 24h hour
    Dh: N(0x01, 2, '82'), Db: N(0x01, 2, '82'), DB: N(0x01, 2, '82'), // 12h hour
    Dm: N(0x0b, 2, '82'), DM: N(0x0b, 2, '82'),                 // minute
    Ds: N(0x0f, 2, '82'), DS: N(0x0f, 2, '82'),                 // second
    Dd: N(0x17, 2, '82'), DE: N(0x17, 2, '02'),                 // day of month
    ZSC: N(0x19, 5, '05'),                                      // steps
    ZHR: N(0x1a, 3, '03'), ZHRR: N(0x1a, 3, '03'),              // heart rate
    BLP: N(0x30, 3, '03'), BLN: N(0x30, 3, '03'),               // battery %
    Da: SEL(0x13, ['AM', 'PM']), DA: SEL(0x13, ['AM', 'PM']),
    DdL: SEL(0x18, WEEKDAYS), DdS: SEL(0x18, WEEKDAYS), DdW: SEL(0x18, WEEKDAYS),
    DMMM: SEL(0x16, MONTHS), DMM: SEL(0x16, MONTHS), DMMMM: SEL(0x16, MONTHS),
  };
  return map[tag] || null;
}

interface Hand { canvas: OffscreenCanvas; x: number; y: number; px: number; py: number }

export async function facerToFace(files: File[]): Promise<{ face: Face; skipped: string[] }> {
  const map = fileMap(files);
  const readJSON = async (n: string) => JSON.parse(await map.get(n)!.text());
  if (!map.get('description.json') || !map.get('watchface.json'))
    throw new Error('not a Facer export: no description.json/watchface.json');
  const desc = await readJSON('description.json');
  const b64 = (await map.get('watchface.json')!.text()).trim();
  const layers: Layer[] = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), c => c.charCodeAt(0))));

  const s = W / (desc.size?.width || 320);
  const bg = new OffscreenCanvas(W, W);
  const ov = new OffscreenCanvas(W, W);
  let canvas = bg;
  const hands: Record<string, Hand> = {};
  const fields: { l: Layer; cls: FieldClass }[] = []; // recognized digital text layers -> emitted as widgets later
  const skipped: string[] = [];

  for (const l of layers) {
    const cx = canvas.getContext('2d')!;
    if (l.type === 'text') {
      const cls = classifyText(l.text);
      if (!cls) { skipped.push(`${l.name || l.text}`); continue; }
      if (cls.type === 'static') {
        const family = await loadFont(map, l.new_font_name);
        cx.font = `${Math.round(num(l.size) * s) || 20}px ${family}`;
        cx.fillStyle = rgba(argb(l.color), num(l.opacity));
        cx.textAlign = (['left', 'center', 'right'] as const)[l.alignment] || 'center';
        cx.textBaseline = 'middle';
        cx.fillText(l.text, num(l.x) * s, num(l.y) * s);
      } else {
        fields.push({ l, cls });
      }
    } else if (l.type === 'shape') {
      cx.fillStyle = rgba(argb(l.color), num(l.opacity));
      if (l.shape_type === 0) {
        cx.beginPath();
        cx.arc(num(l.x) * s, num(l.y) * s, num(l.radius) * s, 0, 2 * Math.PI);
        cx.fill();
      } else {
        cx.fillRect(num(l.x) * s, num(l.y) * s, num(l.width) * s, num(l.height) * s);
      }
    } else if (l.type === 'dynamic_image' && HAND_META[l.type_opt]) {
      const hash = imgHash(l);
      if (!hash) { skipped.push(`${l.name || l.type_opt} (empty)`); continue; }
      const img = await loadImage(map, hash);
      const w = Math.round(num(l.width) * s), h = Math.round(num(l.height) * s);
      hands[l.type_opt] = {
        canvas: tinted(img, w, h, l.is_tinted ? l.tint_color : -1),
        x: Math.round(num(l.x) * s - w / 2), y: Math.round(num(l.y) * s - h / 2),
        px: w >> 1, py: h >> 1,
      };
      canvas = ov; // statics after the first hand go above it
    } else if (l.type === 'dynamic_image') {
      const hash = imgHash(l);
      if (!hash) { skipped.push(`${l.name || 'image'} (empty)`); continue; }
      const img = await loadImage(map, hash);
      let w = num(l.width) * s, h = num(l.height) * s;
      if (!w || !h) { w = W; h = W; } // Facer: 0 = full-canvas background
      const t = tinted(img, Math.round(w), Math.round(h), l.is_tinted ? l.tint_color : -1);
      cx.globalAlpha = num(l.opacity) > 0 && num(l.opacity) < 100 ? num(l.opacity) / 100 : 1;
      cx.drawImage(t, num(l.x) * s - w / 2, num(l.y) * s - h / 2); // alignment 4 = centered
      cx.globalAlpha = 1;
    }
  }
  const TIME_IDS = new Set([0x01, 0x07, 0x08, 0x09, 0x0b, 0x0c, 0x0d, 0x0f, 0x13]);
  const hasHands = hands.hour_hand && hands.minute_hand;
  const hasTime = fields.some(f => TIME_IDS.has((f.cls as { id?: number }).id ?? -1));
  if (!hasHands && !hasTime)
    throw new Error('no clock layers found — need analog hands or a digital time field');

  // resources + tree
  const resources: Resource[] = [];
  const addRes = async (canvas: OffscreenCanvas, cf: number) => (resources.push(await encodeCanvas(canvas, cf)) - 1);
  const scaled = (src: OffscreenCanvas, w: number, h: number) => {
    const c = new OffscreenCanvas(w, h);
    c.getContext('2d')!.drawImage(src, 0, 0, w, h);
    return c;
  };
  const imgWidget = (x: number, y: number, meta: string, res: number): FaceNode =>
    ({ tag: TAG.image, subs: [{ tag: TAG.struct, x, y, meta, refType: 0x61, images: [res] }] });
  const handWidget = (kind: string, h: Hand, res: number): FaceNode => ({
    tag: TAG.hand, subs: [
      { tag: TAG.struct, x: h.x, y: h.y, meta: HAND_META[kind], refType: 0x61, images: [res], _kind: kind.replace('_hand', '') },
      { tag: TAG.pivot, flag: 1, pivotX: h.px, pivotY: h.py },
    ],
  });
  const preview = (res: number): FaceNode =>
    ({ tag: TAG.preview, subs: [{ tag: TAG.pvStruct, prefix: '0000000000', refType: 0x61, images: [res] }] });
  const bgMeta = 'd201d20100000000000000000000'; // 466,466 LE + zeros

  // buildField: a classified text layer -> a CMF number/select widget node.
  async function buildField({ l, cls }: { l: Layer; cls: FieldClass }): Promise<FaceNode> {
    if (cls.type === 'static') throw new Error('unreachable');
    const family = await loadFont(map, l.new_font_name);
    const sizePx = Math.round(num(l.size) * s) || 20;
    const labels = cls.type === 'select' ? cls.labels : DIGITS;
    const { sprites, w: cw, h: ch } = renderGlyphs(labels, family, sizePx, rgba(argb(l.color)));
    const imgs: number[] = [];
    for (const sp of sprites) imgs.push(await addRes(sp, 5));
    const digits = cls.type === 'number' ? cls.digits : 1;
    const fieldW = digits * cw, ax = num(l.x) * s, ay = num(l.y) * s;
    const x = Math.max(0, Math.round(l.alignment === 1 ? ax - fieldW / 2 : l.alignment === 2 ? ax - fieldW : ax));
    const y = Math.max(0, Math.round(ay - ch / 2));
    const struct: FaceNode = {
      tag: TAG.struct, x, y,
      meta: numMeta(cls.id, cls.type === 'number' ? cls.sub || 0 : 0, cls.type === 'number' ? cls.max || 0 : 0),
      refType: 0x61, images: imgs,
    };
    return cls.type === 'number'
      ? { tag: TAG.number, subs: [struct, { tag: TAG.fmt, hex: cls.fmt }] }
      : { tag: TAG.image, subs: [struct] };
  }

  const name = (desc.title || 'Facer').replace(/[^ -~]/g, '').trim().slice(0, 14) || 'Facer';
  const main: FaceNode = { tag: TAG.main, subs: [{ tag: TAG.name, text: name }] };
  main.subs!.push(preview(await addRes(scaled(bg, 270, 270), 4)));
  main.subs!.push(imgWidget(0, 0, bgMeta, await addRes(bg, 4)));
  let mres = 0, hres = 0;
  if (hasHands) {
    mres = await addRes(hands.minute_hand.canvas, 5);
    hres = await addRes(hands.hour_hand.canvas, 5);
  }
  const crop = cropOpaque(ov);
  if (crop) main.subs!.push(imgWidget(crop.x, crop.y, META0, await addRes(crop.canvas, 5)));

  // digital fields on top of the background; keep the built nodes for AOD reuse
  const built: { id: number; node: FaceNode }[] = [];
  for (const f of fields) {
    const node = await buildField(f);
    built.push({ id: (f.cls as { id: number }).id, node });
    main.subs!.push(node);
  }
  if (hasHands) {
    main.subs!.push(handWidget('minute_hand', hands.minute_hand, mres));
    main.subs!.push(handWidget('hour_hand', hands.hour_hand, hres));
    if (hands.second_hand)
      main.subs!.push(handWidget('second_hand', hands.second_hand, await addRes(hands.second_hand.canvas, 5)));
  }

  // AOD: dimmed background + hour/minute (hands and/or digital), no seconds
  const dim = new OffscreenCanvas(W, W);
  const dcx = dim.getContext('2d')!;
  dcx.drawImage(bg, 0, 0);
  dcx.fillStyle = 'rgba(0,0,0,0.6)';
  dcx.globalCompositeOperation = 'source-atop';
  dcx.fillRect(0, 0, W, W);
  const AOD_IDS = new Set([0x01, 0x07, 0x08, 0x09, 0x0b, 0x0c, 0x0d, 0x13]);
  const aod: FaceNode = {
    tag: TAG.aod,
    subs: [preview(await addRes(scaled(dim, 270, 270), 4)), imgWidget(0, 0, bgMeta, await addRes(dim, 4))],
  };
  for (const b of built) if (AOD_IDS.has(b.id)) aod.subs!.push(b.node);
  if (hasHands) {
    aod.subs!.push(handWidget('minute_hand', hands.minute_hand, mres));
    aod.subs!.push(handWidget('hour_hand', hands.hour_hand, hres));
  }

  const nameRaw = new Uint8Array(16);
  new TextEncoder().encodeInto(name, nameRaw);
  nameRaw[15] = 0x0a; // same as CDN files, byte meaning not figured out
  return { face: { name, nameRaw: hex(nameRaw), screens: [main, aod], resources }, skipped };
}
