// WatchMaker (Wear OS) export -> editor face model (same shape as parseBin's output).
// Export dir: watch.pxml (the layer list — obfuscated base64 XML, see unscramble), watch.xml
// (name/feature list only), images/.imgNNNNN.ppng (XOR-obfuscated PNG), fonts/<name>.ttf,
// scripts/script.txt (Lua — nothing runs on the watch, dropped).
// Supported: shapes, markers, static images, literal text (straight and curved) and
// hour/minute/second/battery hands. Anything driven by a WatchMaker tag or a Lua expression
// is skipped and reported.
import { cropOpaque, encodeCanvas, fileMap } from "./facer";
import { hex, TAG, type Face, type FaceNode, type Resource } from "./wf";

const W = 466; // CMF Watch Pro 2 screen
// ponytail: the canvas size is not declared anywhere in the export — every face of this
// generation draws on 512x512 (marker radius 256, full-screen art 512px). If one ever turns
// up that doesn't, read it off the largest full-screen layer instead.
const SRC = 512;
const S = W / SRC;
const MID = SRC / 2;
// text_size is not pixels — this factor was calibrated against an export's own preview.jpg
const TXT = 1.26;

// .ppng is a PNG under a repeating-key XOR; .pxml is ordinary base64 with two symbol pairs
// swapped ('D'<->'g', 'L'<->'4'), which is why plain atob yields almost-readable XML.
const PPNG_KEY = "SWHn-";
const B64_SWAP: Record<string, string> = { D: "g", g: "D", L: "4", "4": "L" };

function unscramble(text: string): string {
  const b64 = text.trim().replace(/[DgL4]/g, (c) => B64_SWAP[c]);

  return new TextDecoder().decode(
    Uint8Array.from(atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)),
  );
}

function unxor(b: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(b.length);

  for (let i = 0; i < b.length; i++) out[i] = b[i] ^ PPNG_KEY.charCodeAt(i % PPNG_KEY.length);
  return out;
}

// ---- layer attributes ----
type L = Element;

const at = (l: L, k: string, d = "") => l.getAttribute(k) ?? d;
const num = (l: L, k: string, d = 0) => {
  const v = parseFloat(at(l, k));

  return Number.isNaN(v) ? d : v;
};
// literal only: "100" is a value, "var_clr2[var_daydim]" and "({dtp}>{wsrp} and 0 or 30)" are
// Lua the watch can't run, so a layer gated by one can't come across at all
const literalNum = (l: L, k: string, d: number): number | null => {
  const raw = at(l, k);

  if (raw === "") return d;
  return /^-?\d+(\.\d+)?$/.test(raw) ? parseFloat(raw) : null;
};
const hexCss = (h: string, alpha = 1) => {
  const c = h.padStart(6, "0").slice(-6);
  const ch = (i: number) => parseInt(c.slice(i, i + 2), 16);

  return `rgba(${ch(0)},${ch(2)},${ch(4)},${alpha})`;
};
const colorOf = (l: L, ambient: boolean, alpha: number) =>
  hexCss(at(l, ambient && l.hasAttribute("color_dim") ? "color_dim" : "color", "ffffff"), alpha);
// display: "b" bright/active only, "d" dim/AOD only, "bd" both
const inActive = (l: L) => at(l, "display", "bd").includes("b");
const inAmbient = (l: L) => at(l, "display", "bd").includes("d");
// WatchMaker quotes literal strings; text still carrying {tags} is live data, which has no
// equivalent here short of a digit-strip widget — reported, not drawn.
const textOf = (l: L) => at(l, "text").replace(/^'|'$/g, "");
const isLive = (l: L) => /\{[^}]+\}/.test(at(l, "text"));

// ---- hands ----
// A hand is any image layer whose rotation is bound to a clock/battery tag. max=60 puts the
// CMF renderer's `v / max * 2pi` on the same scale as WatchMaker's degrees for all three clock
// hands (idValue already returns 0..60 for 0x0a); battery is one full turn over 0..100.
const HAND: Record<string, { kind?: string; meta: string }> = {
  hour: { kind: "hour", meta: "0000000000000000000a003c0000" },
  minute: { kind: "minute", meta: "0000000000000000000e003c0000" },
  second: { kind: "second", meta: "00000000000000000012003c0000" },
  battery: { meta: "0000000000000000002400640000" },
};
const ROT: [RegExp, string][] = [
  [/\{drh\}/, "hour"],
  [/\{drm\}/, "minute"],
  [/\{drs{1,2}\}/, "second"],
  [/\{br\}/, "battery"],
];
const handRole = (l: L): string | null =>
  ROT.find(([re]) => re.test(at(l, "rotation")))?.[1] ?? null;

// ---- pixels ----
// WatchMaker's HSV shader: u_1 hue shift, u_2 saturation, u_3 brightness, each -100..100.
// This is how a face derives a black drop-shadow and a white highlight from one hand bitmap.
function shade(c: OffscreenCanvas, u1: number, u2: number, u3: number) {
  if (!u1 && !u2 && !u3) return;
  const cx = c.getContext("2d")!;
  const img = cx.getImageData(0, 0, c.width, c.height);
  const p = img.data;

  for (let i = 0; i < p.length; i += 4) {
    if (!p[i + 3]) continue;
    const r = p[i] / 255,
      g = p[i + 1] / 255,
      b = p[i + 2] / 255;
    const mx = Math.max(r, g, b),
      d = mx - Math.min(r, g, b);
    let h = 0;

    if (d) {
      if (mx === r) h = ((g - b) / d + 6) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h /= 6;
    }
    let s = mx ? d / mx : 0,
      v = mx;

    h = (h + u1 / 100 + 1) % 1;
    s = u2 < 0 ? s * (1 + u2 / 100) : s + (1 - s) * (u2 / 100);
    v = u3 < 0 ? v * (1 + u3 / 100) : v + (1 - v) * (u3 / 100);
    const ch = (n: number) => {
      const t = (n + h * 6) % 6;

      return Math.round(255 * (v - v * s * Math.max(0, Math.min(t, 4 - t, 1))));
    };

    p[i] = ch(5);
    p[i + 1] = ch(3);
    p[i + 2] = ch(1);
  }
  cx.putImageData(img, 0, 0);
}

// tint: multiply RGB, keep the source alpha
function tint(c: OffscreenCanvas, color: string) {
  if (color.toLowerCase() === "ffffff") return;
  const cx = c.getContext("2d")!;
  const src = new OffscreenCanvas(c.width, c.height);

  src.getContext("2d")!.drawImage(c, 0, 0);
  cx.globalCompositeOperation = "multiply";
  cx.fillStyle = hexCss(color);
  cx.fillRect(0, 0, c.width, c.height);
  cx.globalCompositeOperation = "destination-in";
  cx.drawImage(src, 0, 0);
  cx.globalCompositeOperation = "source-over";
}

const fontCache = new Map<string, string>();

async function loadFont(map: Map<string, File>, name: string): Promise<string> {
  if (!name) return "sans-serif";
  if (fontCache.has(name)) return fontCache.get(name)!;
  const f = map.get(`fonts/${name}.ttf`) || map.get(`${name}.ttf`) || map.get(name);
  let family = "sans-serif";

  if (f) {
    try {
      const ff = new FontFace(`wm_${name.replace(/\W/g, "_")}`, await f.arrayBuffer());

      await ff.load();
      document.fonts.add(ff);
      family = ff.family;
    } catch {
      /* unreadable font file — fall back to the system face */
    }
  }
  fontCache.set(name, family);
  return family;
}

// ---- painting ----
// Every draw shares one transform: WatchMaker x/y are offsets from the canvas centre, so a
// layer at (x, y) lands on (MID + x, MID + y) scaled by S.
function setup(c: OffscreenCanvas) {
  const cx = c.getContext("2d")!;

  cx.setTransform(S, 0, 0, S, 0, 0);
  cx.imageSmoothingQuality = "high";
  cx.globalAlpha = 1;
  return cx;
}

async function loadImage(map: Map<string, File>, path: string): Promise<ImageBitmap> {
  const f = map.get(`images/${path}`) || map.get(path);

  if (!f) throw new Error(`image ${path} missing from the export`);
  return createImageBitmap(new Blob([unxor(new Uint8Array(await f.arrayBuffer()))]));
}

// WatchMaker fits the bitmap inside width x height, keeping its aspect ratio
async function artOf(map: Map<string, File>, l: L): Promise<OffscreenCanvas> {
  const img = await loadImage(map, at(l, "path"));
  const k = Math.min(
    num(l, "width", img.width) / img.width,
    num(l, "height", img.height) / img.height,
  );
  const w = Math.max(1, Math.round(img.width * k)),
    h = Math.max(1, Math.round(img.height * k));
  const c = new OffscreenCanvas(w, h);

  c.getContext("2d")!.imageSmoothingQuality = "high";
  c.getContext("2d")!.drawImage(img, 0, 0, w, h);
  if (at(l, "shader") === "HSV") shade(c, num(l, "u_1"), num(l, "u_2"), num(l, "u_3"));
  tint(c, at(l, "color", "ffffff"));
  return c;
}

function drawImageLayer(
  cx: OffscreenCanvasRenderingContext2D,
  l: L,
  art: OffscreenCanvas,
  opacity: number,
) {
  const rot = literalNum(l, "rotation", 0) ?? 0; // tag-driven rotation bakes flat, see skips

  cx.save();
  cx.globalAlpha = opacity / 100;
  cx.translate(MID + num(l, "x"), MID + num(l, "y"));
  cx.rotate((rot * Math.PI) / 180);
  cx.drawImage(art, -art.width / 2, -art.height / 2);
  cx.restore();
}

function drawShape(cx: OffscreenCanvasRenderingContext2D, l: L, opacity: number) {
  const x = MID + num(l, "x"),
    y = MID + num(l, "y");
  const w = num(l, "width"),
    h = num(l, "height");

  cx.fillStyle = hexCss(at(l, "color", "ffffff"), opacity / 100);
  if (at(l, "shape") === "Circle") {
    cx.beginPath();
    cx.ellipse(x, y, w / 2, h / 2, 0, 0, 2 * Math.PI);
    cx.fill();
  } else {
    cx.fillRect(x - w / 2, y - h / 2, w, h);
  }
}

// markers: m_count ticks spaced evenly around `radius`, each m_width x m_height, hanging
// inward from it. A black one-tick layer is how a face punches a gap in the ring (to clear
// room for "SWISS MADE" at 6 o'clock, say).
function drawMarkers(cx: OffscreenCanvasRenderingContext2D, l: L, opacity: number) {
  const n = Math.max(1, Math.round(num(l, "m_count", 1)));
  const mw = num(l, "m_width", 1),
    mh = num(l, "m_height", 1);
  const r = num(l, "radius");
  const rot = num(l, "rotation");

  cx.fillStyle = hexCss(at(l, "color", "ffffff"), opacity / 100);
  for (let i = 0; i < n; i++) {
    cx.save();
    cx.translate(MID + num(l, "x"), MID + num(l, "y"));
    cx.rotate(((rot + (i * 360) / n) * Math.PI) / 180);
    cx.fillRect(-mw / 2, -r, mw, mh);
    cx.restore();
  }
}

// alignment is "cc" on every observed export; other anchors would need baseline/edge handling
function setFont(
  cx: OffscreenCanvasRenderingContext2D,
  l: L,
  family: string,
  ambient: boolean,
  opacity: number,
) {
  cx.font = `${num(l, "text_size", 10) * TXT}px ${family}`;
  cx.fillStyle = colorOf(l, ambient, opacity / 100);
  cx.textAlign = "center";
  cx.textBaseline = "middle";
}

function drawText(
  cx: OffscreenCanvasRenderingContext2D,
  l: L,
  family: string,
  opacity: number,
  ambient: boolean,
) {
  setFont(cx, l, family, ambient, opacity);
  cx.fillText(textOf(l), MID + num(l, "x"), MID + num(l, "y"));
}

function drawCurvedText(
  cx: OffscreenCanvasRenderingContext2D,
  l: L,
  family: string,
  opacity: number,
  ambient: boolean,
) {
  setFont(cx, l, family, ambient, opacity);
  const r = num(l, "radius");
  const chars = [...textOf(l)];
  const widths = chars.map((ch) => cx.measureText(ch).width);
  const down = at(l, "curve_dir", "Down") === "Down";
  // angles run from -half to +half; below the centre that means rotating anticlockwise so the
  // first glyph lands on the left, above it the sign flips
  let ang = -widths.reduce((a, b) => a + b, 0) / r / 2;

  for (const [i, ch] of chars.entries()) {
    ang += widths[i] / r / 2;
    cx.save();
    cx.translate(MID + num(l, "x"), MID + num(l, "y"));
    cx.rotate(down ? -ang : ang);
    cx.fillText(ch, 0, down ? r : -r);
    cx.restore();
    ang += widths[i] / r / 2;
  }
}

// ---- assembly ----
interface Hand {
  role: string;
  canvas: OffscreenCanvas;
  cx: number; // rotation centre, target pixels
  cy: number;
  active: boolean;
  ambient: boolean;
}
// statics land on `base`, but anything declared after the first hand has to sit above it (the
// centre cap), so it goes to `ov` and is emitted as a separate widget on top
interface Sheet {
  base: OffscreenCanvas;
  ov: OffscreenCanvas;
  cur: OffscreenCanvas;
  used: boolean;
}

function newSheet(): Sheet {
  const base = new OffscreenCanvas(W, W);
  const cx = base.getContext("2d")!;

  cx.fillStyle = "#000";
  cx.fillRect(0, 0, W, W);
  return { base, ov: new OffscreenCanvas(W, W), cur: base, used: false };
}

export async function watchmakerToFace(files: File[]): Promise<{ face: Face; skipped: string[] }> {
  const map = fileMap(files);
  const pxml = map.get("watch.pxml");

  if (!pxml) throw new Error("not a WatchMaker export: no watch.pxml");
  const doc = new DOMParser().parseFromString(unscramble(await pxml.text()), "text/xml");

  if (doc.querySelector("parsererror")) throw new Error("watch.pxml did not decode to valid XML");
  const root = doc.documentElement;
  const skips = new Set<string>();
  const label = (l: L) => at(l, "text") || at(l, "path") || at(l, "type");

  const act = newSheet();
  const amb = newSheet();
  const hands: Hand[] = [];
  // consecutive layers sharing a hand role are one hand's shadow/dark/light/art stack; the
  // last of them is the artwork, and its centre is the rotation centre
  let group: (Omit<Hand, "cx" | "cy"> & { art: L }) | null = null;
  const flush = () => {
    if (!group) return;
    const { art, ...rest } = group;

    hands.push({ ...rest, cx: (MID + num(art, "x")) * S, cy: (MID + num(art, "y")) * S });
    group = null;
  };

  for (const l of root.children) {
    const type = at(l, "type");
    const opacity = literalNum(l, "opacity", 100);

    if (opacity === null) {
      flush();
      skips.add(`${label(l)} (opacity is a script expression)`);
      continue;
    }
    const on = [inActive(l) ? act : null, inAmbient(l) ? amb : null].filter(Boolean) as Sheet[];

    if (opacity <= 0 || !on.length) {
      flush(); // invisible tap targets and layers for a mode we're not drawing
      continue;
    }
    const role = type === "image" ? handRole(l) : null;

    if (!role) flush();

    if (type === "image") {
      const art = await artOf(map, l);

      if (role) {
        if (!group || group.role !== role) {
          flush(); // the previous hand's stack ends where the next role begins
          group = {
            role,
            canvas: new OffscreenCanvas(W, W),
            active: inActive(l),
            ambient: inAmbient(l),
            art: l,
          };
        }
        drawImageLayer(setup(group.canvas), l, art, opacity);
        group.art = l;
        for (const sh of on) sh.cur = sh.ov; // statics declared after a hand sit above it
        continue;
      }
      if (/\{[^}]+\}/.test(at(l, "rotation")))
        skips.add(`${label(l)} (rotation "${at(l, "rotation")}" baked flat)`);
      for (const sh of on) {
        drawImageLayer(setup(sh.cur), l, art, opacity);
        sh.used = true;
      }
    } else if (type === "shape") {
      for (const sh of on) {
        drawShape(setup(sh.cur), l, opacity);
        sh.used = true;
      }
    } else if (type === "markers") {
      for (const sh of on) {
        drawMarkers(setup(sh.cur), l, opacity);
        sh.used = true;
      }
    } else if (type === "text" || type === "text_curved") {
      if (isLive(l)) {
        skips.add(`"${at(l, "text")}" (live text)`);
        continue;
      }
      const family = await loadFont(map, at(l, "font"));

      for (const sh of on) {
        (type === "text" ? drawText : drawCurvedText)(
          setup(sh.cur),
          l,
          family,
          opacity,
          sh === amb,
        );
        sh.used = true;
      }
    } else {
      skips.add(`${label(l)} (${type} layer)`);
    }
  }
  flush();

  if (!hands.some((h) => h.role === "hour") || !hands.some((h) => h.role === "minute"))
    throw new Error("no clock layers found — need at least an hour and a minute hand");

  // AOD falls back to a dimmed copy of the active art when the face has no dim-only layers
  if (!amb.used) {
    const dcx = amb.base.getContext("2d")!;

    dcx.setTransform(1, 0, 0, 1, 0, 0);
    dcx.drawImage(act.base, 0, 0);
    dcx.globalCompositeOperation = "source-atop";
    dcx.fillStyle = "rgba(0,0,0,0.6)";
    dcx.fillRect(0, 0, W, W);
    dcx.globalCompositeOperation = "source-over";
    amb.ov.getContext("2d")!.drawImage(act.ov, 0, 0);
  }

  // ---- resources + tree ----
  const resources: Resource[] = [];
  const addRes = async (c: OffscreenCanvas, cf: number) =>
    resources.push(await encodeCanvas(c, cf)) - 1;
  const scaled = (src: OffscreenCanvas, w: number, h: number) => {
    const c = new OffscreenCanvas(w, h);

    c.getContext("2d")!.drawImage(src, 0, 0, w, h);
    return c;
  };
  const imgWidget = (x: number, y: number, meta: string, res: number): FaceNode => ({
    tag: TAG.image,
    subs: [{ tag: TAG.struct, x, y, meta, refType: 0x61, images: [res] }],
  });

  // one sprite per hand, cropped to its ink; the pivot is the rotation centre inside the crop
  const handNodes: (Pick<Hand, "role" | "active" | "ambient"> & { node: FaceNode })[] = [];

  for (const h of hands) {
    const crop = cropOpaque(h.canvas);

    if (!crop) continue;
    const res = await addRes(crop.canvas, 5);

    handNodes.push({
      role: h.role,
      active: h.active,
      ambient: h.ambient,
      node: {
        tag: TAG.hand,
        subs: [
          {
            tag: TAG.struct,
            x: crop.x,
            y: crop.y,
            meta: HAND[h.role].meta,
            refType: 0x61,
            images: [res],
            _kind: HAND[h.role].kind,
          },
          {
            tag: TAG.pivot,
            flag: 1,
            pivotX: Math.round(h.cx) - crop.x,
            pivotY: Math.round(h.cy) - crop.y,
          },
        ],
      },
    });
  }

  const full = at(root, "name") || "WatchMaker";
  const name =
    full
      .replace(/[^ -~]/g, "")
      .trim()
      .slice(0, 14) || "WatchMaker";

  async function screen(tag: number, sh: Sheet, ambient: boolean): Promise<FaceNode> {
    const subs: FaceNode[] = tag === TAG.main ? [{ tag: TAG.name, text: full.slice(0, 63) }] : [];

    subs.push({
      tag: TAG.preview,
      subs: [
        {
          tag: TAG.pvStruct,
          prefix: "0000000000",
          refType: 0x61,
          images: [await addRes(scaled(sh.base, 270, 270), 4)],
        },
      ],
    });
    // cf 4, not JPEG — a full-screen cf 1 background reboots the watch on the AOD → normal
    // transition (see facer.ts)
    subs.push(imgWidget(0, 0, "d201d20100000000000000000000", await addRes(sh.base, 4)));
    const drawn = new Set<string>();

    for (const h of handNodes)
      if ((ambient ? h.ambient : h.active) && !drawn.has(h.role)) {
        drawn.add(h.role);
        subs.push(h.node);
      }
    const crop = cropOpaque(sh.ov);

    if (crop)
      subs.push(imgWidget(crop.x, crop.y, hex(new Uint8Array(14)), await addRes(crop.canvas, 5)));
    return { tag, subs };
  }

  const main = await screen(TAG.main, act, false);
  const aod = await screen(TAG.aod, amb, true);
  const nameRaw = new Uint8Array(16);

  new TextEncoder().encodeInto(name, nameRaw);
  nameRaw[15] = 0x0a; // same as CDN files, byte meaning not figured out
  return {
    face: { name, nameRaw: hex(nameRaw), screens: [main, aod], resources },
    skipped: [...skips],
  };
}
