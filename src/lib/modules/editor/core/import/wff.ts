// Wear OS Watch Face Format (WFF) export -> editor face model (same shape as parseBin's output).
// A .aab (Android App Bundle, what facer.io hands out for Wear OS watches) is a plain zip: the
// declarative scene is base/res/raw/watchface.xml and the art it names sits beside it under
// base/res/drawable*/ and base/res/font/ as ordinary PNG/WebP/TTF files — nothing in there needs
// the compiled-resource tables, so only the zip is unpacked.
//
// The watch has no expression engine, so the scene is BAKED: every part is drawn as it renders
// with the face's default user configuration, and only what the format can express live comes
// out as a widget — parts whose angle is bound to the clock (hands) and text whose template
// resolves to a CMF data source. Complications, gyro parallax and animations are reported.
import { cropOpaque, encodeCanvas } from "./facer/assets";
import { buildRow, isLive, type Live, type Part, type Row } from "./field";
import { MONTHS, WEEKDAYS } from "./facer/text";
import { fontOf, glyphCell } from "../render/glyphs";
import { PREVIEW, SCREEN } from "../render/screen";
import { encodeMeta, type WidgetMeta } from "../document/doc";
import { hex, TAG, type Face, type FaceNode, type Resource } from "../format";

const W = SCREEN;

// ---- zip ----

const inflate = async (b: Uint8Array) =>
  new Uint8Array(
    await new Response(
      new Blob([b as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw")),
    ).arrayBuffer(),
  );

// ponytail: central directory only, no zip64 and no encryption — a bundle is a few MB and every
// entry is stored or deflated. If a >4 GB one ever turns up, read the zip64 end-of-directory
// record instead of the 32-bit fields here.
async function unzip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const d = new Uint8Array(buf);
  const v = new DataView(buf);
  let eocd = d.length - 22;

  while (eocd >= 0 && v.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip archive");
  const out = new Map<string, Uint8Array>();
  let off = v.getUint32(eocd + 16, true);

  for (let i = v.getUint16(eocd + 10, true); i > 0; i--) {
    if (off + 46 > d.length || v.getUint32(off, true) !== 0x02014b50) break;
    const method = v.getUint16(off + 10, true);
    const csize = v.getUint32(off + 20, true);
    const nameLen = v.getUint16(off + 28, true);
    const lho = v.getUint32(off + 42, true);
    const name = new TextDecoder().decode(d.subarray(off + 46, off + 46 + nameLen));
    // the local header repeats the name and carries an extra field of its own length, so where
    // the payload actually starts can only be read there
    const at = lho + 30 + v.getUint16(lho + 26, true) + v.getUint16(lho + 28, true);
    const raw = d.subarray(at, at + csize);

    out.set(name, method ? await inflate(raw) : raw);
    off += 46 + nameLen + v.getUint16(off + 30, true) + v.getUint16(off + 32, true);
  }
  return out;
}

// ---- values ----

/** WFF colours are #RRGGBB or #AARRGGBB — the alpha-first spelling is not a CSS one. */
function cssColor(c: string): string | null {
  const h = c.trim().replace(/^#/, "");

  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return null;
  const p = (i: number) => parseInt(h.slice(i, i + 2), 16);

  return h.length === 8
    ? `rgba(${p(2)},${p(4)},${p(6)},${p(0) / 255})`
    : `rgb(${p(0)},${p(2)},${p(4)})`;
}

/** ponytail: enough of the expression language to pick a branch and read a constant — a literal,
 *  or one `a == b ? x : y`. Anything else is null, and the caller keeps its own default. */
function evalExpr(s: string): string | null {
  const t = s.trim();
  const cond = t.match(/^(.+?)(==|!=)(.+?)\?(.+):(.+)$/s);

  if (cond) {
    const a = evalExpr(cond[1]);
    const b = evalExpr(cond[3]);

    if (a === null || b === null) return null;
    return evalExpr(cond[2] === "==" ? (a === b ? cond[4] : cond[5]) : a !== b ? cond[4] : cond[5]);
  }
  const quoted = t.match(/^"(.*)"$/);

  if (quoted) return quoted[1];
  return /^-?[\w.]+$/.test(t) ? t : null;
}

/** A `<Compare>`'s condition. `!= null` is always false: nothing here supplies complication
 *  data, so a face's "when this slot has a title" branches never fire. */
function truthy(s: string): boolean | null {
  const m = s.trim().match(/^(.+?)(==|!=)(.+)$/);

  if (!m) return null;
  if (m[3].trim() === "null") return m[2] === "==";
  const a = evalExpr(m[1]);
  const b = evalExpr(m[3]);

  return a === null || b === null ? null : m[2] === "==" ? a === b : a !== b;
}

// ---- data sources ----

const N = (id: number, digits: number, fmt: string): Live => ({ type: "number", id, digits, fmt });
const SEL = (id: number, labels: string[]): Live => ({ type: "select", id, labels });
// fmt byte: digit count, 0x80 = zero-padded. Source ids are the ones the Facer importer settled
// on against the stock corpus (see ./facer/text.ts).
const PAD = { h12: N(0x01, 2, "82"), h24: N(0x07, 2, "82"), min: N(0x0b, 2, "82") };
const SRC: Record<string, Live> = {
  HOUR_1_12: N(0x01, 2, "02"),
  HOUR_1_12_Z: PAD.h12,
  HOUR_0_23: N(0x07, 2, "02"),
  HOUR_0_23_Z: PAD.h24,
  // ponytail: 0-11 lands on the 12h source, so midnight reads 12 rather than 0 — the watch has
  // no 0-11 hour. Drop the two entries if that reads worse than importing without an hour.
  HOUR_0_11: N(0x01, 2, "02"),
  HOUR_0_11_Z: PAD.h12,
  MINUTE: N(0x0b, 2, "02"),
  MINUTE_Z: PAD.min,
  SECOND: N(0x0f, 2, "02"),
  SECOND_Z: N(0x0f, 2, "82"),
  DAY: N(0x17, 2, "02"),
  DAY_Z: N(0x17, 2, "82"),
  STEP_COUNT: N(0x19, 5, "05"),
  HEART_RATE: N(0x1a, 3, "03"),
  HEART_RATE_Z: N(0x1a, 3, "03"),
  BATTERY_PERCENT: N(0x24, 3, "03"),
  AMPM_STATE: SEL(0x13, ["AM", "PM"]),
  AMPM_POSITION: SEL(0x13, ["AM", "PM"]),
  DAY_OF_WEEK: SEL(0x18, WEEKDAYS),
  MONTH_S: SEL(0x16, MONTHS),
  MONTH_F: SEL(0x16, MONTHS),
};

/** The first source a `<Parameter expression>` names that the watch can drive. Expressions nest
 *  ("[IS_24_HOUR_MODE] ? [HOUR_0_23_Z] : [HOUR_1_12_Z]") and there is no way to switch between
 *  two sources on the device, so the first recognised one wins — for that shape it is the 24h
 *  hour, which is the more common setting. */
function liveOf(expr: string): Live | null {
  for (const m of expr.matchAll(/\[([A-Z_0-9]+)\]/g)) {
    const hit = SRC[m[1]] ?? SRC[m[1].replace(/_Z$/, "")];

    if (hit) return hit;
  }
  return null;
}

// SimpleDateFormat letters, as a <TimeText format> uses them. Padding is the fmt byte's job, so
// the padded and unpadded spellings differ only there.
const FMT: Record<string, Live> = {
  h: SRC.HOUR_1_12,
  hh: PAD.h12,
  H: SRC.HOUR_0_23,
  HH: PAD.h24,
  k: SRC.HOUR_0_23,
  kk: PAD.h24,
  m: SRC.MINUTE,
  mm: PAD.min,
  s: SRC.SECOND,
  ss: SRC.SECOND_Z,
  d: SRC.DAY,
  dd: SRC.DAY_Z,
  a: SRC.AMPM_STATE,
  E: SRC.DAY_OF_WEEK,
  EE: SRC.DAY_OF_WEEK,
  EEE: SRC.DAY_OF_WEEK,
  MMM: SRC.MONTH_S,
  MMMM: SRC.MONTH_F,
};

// ---- baked sheets ----

const ZERO_META: WidgetMeta = {
  w: 0,
  h: 0,
  auto: false,
  source: 0,
  sub: 0,
  max: 0,
  rgb: [0, 0, 0],
  flags: 0,
  reserved: 0,
};
const META0 = encodeMeta(ZERO_META);
const BG_META = encodeMeta({ ...ZERO_META, w: SCREEN, h: SCREEN });

// A screen's baked art: statics land on `base`, but anything declared after the first hand has
// to sit above it, so it goes to `ov` and is emitted as a separate widget on top.
interface Sheet {
  base: OffscreenCanvas;
  ov: OffscreenCanvas;
  cur: OffscreenCanvas;
  used: boolean;
}

const newSheet = (): Sheet => {
  const base = new OffscreenCanvas(W, W);
  const cx = base.getContext("2d")!;

  cx.fillStyle = "#000";
  cx.fillRect(0, 0, W, W);
  return { base, ov: new OffscreenCanvas(W, W), cur: base, used: false };
};

// The hand sources, same table as ./facer/index.ts — meta is the 14 struct bytes with the data
// source in byte 9.
const HAND: Record<string, { kind: string; meta: string }> = {
  hour: { kind: "hour", meta: "0000000000000000000a003c0000" },
  minute: { kind: "minute", meta: "0000000000000000000e003c0000" },
  second: { kind: "second", meta: "00000000010000040072003c0000" },
};

interface Hand {
  role: string;
  canvas: OffscreenCanvas;
  x: number;
  y: number;
  px: number;
  py: number;
  amb: boolean;
}
interface Field {
  row: Row;
  box: [number, number, number, number];
  amb: boolean;
  /** Where an AMBIENT `<Variant>` moves the row on the dim screen. */
  ax: number;
  ay: number;
}

/** What a part inherits from the groups around it. `ax`/`ay` is the extra offset an AMBIENT
 *  `<Variant target="x"|"y">` asks for, `amb` whether it shows on the dim screen at all. */
interface Ctx {
  x: number;
  y: number;
  alpha: number;
  amb: boolean;
  ax: number;
  ay: number;
}

export async function wffToFace(file: File): Promise<{ face: Face; skipped: string[] }> {
  const zip = await unzip(await file.arrayBuffer());
  const text = (b: Uint8Array) => new TextDecoder().decode(b);
  const sceneEntry = [...zip].find(
    ([k, v]) => /res\/raw\/[^/]+\.xml$/.test(k) && text(v).includes("<WatchFace"),
  );

  if (!sceneEntry) throw new Error("not a Watch Face Format bundle: no res/raw/watchface.xml");
  const doc = new DOMParser().parseFromString(text(sceneEntry[1]), "text/xml");
  const root = doc.querySelector("WatchFace");

  if (!root) throw new Error("watchface.xml has no <WatchFace> root");
  const s = W / (Number(root.getAttribute("width")) || 450);

  // ---- assets ----
  const stem = (p: string) => p.slice(p.lastIndexOf("/") + 1).replace(/\.\w+$/, "");
  const pick = (re: RegExp) => {
    const m = new Map<string, Uint8Array>();

    for (const [k, v] of zip)
      if (re.test(k) && (m.get(stem(k))?.length ?? 0) < v.length) m.set(stem(k), v);
    return m; // densities live side by side; the biggest file is the sharpest one
  };
  const drawables = pick(/res\/(drawable|mipmap)[^/]*\/[^/]+\.(png|webp|jpe?g)$/i);
  const fontFiles = pick(/res\/font[^/]*\/[^/]+\.(ttf|otf)$/i);
  const bitmaps = new Map<string, ImageBitmap | null>();
  const families = new Map<string, string>();
  const imageOf = async (name: string) => {
    if (!bitmaps.has(name)) {
      const bytes = drawables.get(name);

      bitmaps.set(
        name,
        bytes ? await createImageBitmap(new Blob([bytes as BlobPart])).catch(() => null) : null,
      );
    }
    return bitmaps.get(name)!;
  };
  const familyOf = async (name: string | null) => {
    if (!name) return "sans-serif";
    if (!families.has(name)) {
      const bytes = fontFiles.get(name);
      let family = "sans-serif";

      try {
        if (bytes) {
          const ff = new FontFace(`wff_${name.replace(/\W/g, "_")}`, bytes as BufferSource);

          await ff.load();
          document.fonts.add(ff);
          family = ff.family;
        }
      } catch {
        family = "sans-serif";
      }
      families.set(name, family);
    }
    return families.get(name)!;
  };

  // ---- user configuration ----
  const colors = new Map<string, string[]>();
  const opts = new Map<string, string>();

  for (const c of root.querySelectorAll("UserConfigurations > ColorConfiguration")) {
    const def = c.getAttribute("defaultValue");
    const opt = [...c.children].find((o) => o.getAttribute("id") === def) ?? c.children[0];

    colors.set(c.getAttribute("id") ?? "", (opt?.getAttribute("colors") ?? "").split(/\s+/));
  }
  for (const c of root.querySelectorAll(
    "UserConfigurations > BooleanConfiguration, UserConfigurations > ListConfiguration",
  ))
    opts.set(c.getAttribute("id") ?? "", c.getAttribute("defaultValue") ?? "TRUE");

  const resolve = (v: string) =>
    v.replace(/\[CONFIGURATION\.(\w+)(?:\.(\d+))?\]/g, (m, id, i) =>
      i == null ? (opts.get(id) ?? m) : (colors.get(id)?.[Number(i)] ?? m),
    );
  /** An attribute as a number, in screen pixels. */
  const num = (el: Element, a: string, d = 0) => {
    const v = el.getAttribute(a);
    const n = v == null ? NaN : Number(resolve(v));

    return Number.isNaN(n) ? d : n;
  };
  const colorAttr = (el: Element, a: string) => {
    const v = el.getAttribute(a);

    return v == null ? null : cssColor(resolve(v));
  };

  // ---- walk ----
  const act = newSheet();
  const amb = newSheet();
  const hands: Hand[] = [];
  const fields: Field[] = [];
  const skips = new Set<string>();
  const scratch = new OffscreenCanvas(W, W);
  const sx = scratch.getContext("2d")!;
  const label = (el: Element) => el.getAttribute("name") || el.tagName;

  /** Blit whatever was staged on `scratch` onto both screens, then clear it. */
  const flush = (ctx: Ctx) => {
    for (const [sh, dx, dy] of [
      [act, 0, 0],
      [amb, ctx.ax, ctx.ay],
    ] as const) {
      if (sh === amb && !ctx.amb) continue;
      const cx = sh.cur.getContext("2d")!;

      cx.globalAlpha = ctx.alpha;
      cx.drawImage(scratch, dx, dy);
      cx.globalAlpha = 1;
      sh.used = true;
    }
    sx.clearRect(0, 0, W, W);
  };

  /** The clock source a `<Transform target="angle">` is bound to, if any — that is what makes a
   *  part a hand rather than something to bake. */
  const handRole = (el: Element): string | null => {
    const t = [...el.children].find(
      (c) => c.tagName === "Transform" && c.getAttribute("target") === "angle",
    );
    const v = t?.getAttribute("value") ?? "";

    if (/\[SECOND/.test(v)) return "second";
    if (/\[MINUTE/.test(v)) return "minute";
    return /\[HOUR/.test(v) ? "hour" : null;
  };

  /** The AMBIENT overrides a part or group declares. */
  const variants = (el: Element, ctx: Ctx): Ctx => {
    const out = { ...ctx };

    for (const v of el.children) {
      if (v.tagName !== "Variant" || v.getAttribute("mode") !== "AMBIENT") continue;
      const target = v.getAttribute("target");
      const value = evalExpr(resolve(v.getAttribute("value") ?? ""));

      if (value === null) continue;
      if (target === "alpha" && Number(value) === 0) out.amb = false;
      // x/y variants are absolute, so the shift is the difference from the part's own position
      if (target === "x") out.ax += (Number(value) - num(el, "x")) * s;
      if (target === "y") out.ay += (Number(value) - num(el, "y")) * s;
    }
    return out;
  };

  /** Fill/Stroke of a `<PartDraw>` shape, gradients included — canvas has all three natively. */
  const paint = (shape: Element, kind: "Fill" | "Stroke"): string | null => {
    const el = [...shape.children].find((c) => c.tagName === kind);

    if (!el) return null;
    const grad = [...el.children].find((c) => c.tagName.endsWith("Gradient"));

    if (!grad) return colorAttr(el, "color");
    const stops = (grad.getAttribute("colors") ?? "").split(/\s+/).filter(Boolean);
    const at = (grad.getAttribute("positions") ?? "").split(/\s+/).filter(Boolean);
    const g =
      grad.tagName === "RadialGradient"
        ? sx.createRadialGradient(
            num(grad, "centerX") * s,
            num(grad, "centerY") * s,
            0,
            num(grad, "centerX") * s,
            num(grad, "centerY") * s,
            num(grad, "radius") * s,
          )
        : sx.createLinearGradient(
            num(grad, "startX") * s,
            num(grad, "startY") * s,
            num(grad, "endX") * s,
            num(grad, "endY") * s,
          );

    stops.forEach((c, i) =>
      g.addColorStop(
        Math.min(1, Math.max(0, Number(at[i] ?? i / Math.max(1, stops.length - 1)))),
        cssColor(resolve(c)) ?? "#0000",
      ),
    );
    return g as unknown as string;
  };

  const shapePath = (shape: Element, ox: number, oy: number) => {
    const x = ox + num(shape, "x") * s;
    const y = oy + num(shape, "y") * s;
    const w = num(shape, "width") * s;
    const h = num(shape, "height") * s;

    sx.beginPath();
    switch (shape.tagName) {
      case "Ellipse":
        sx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
        break;
      case "RoundRectangle":
        sx.roundRect(x, y, w, h, [
          num(shape, "cornerRadiusX") * s,
          num(shape, "cornerRadiusY") * s,
        ]);
        break;
      case "Line":
        sx.moveTo(ox + num(shape, "startX") * s, oy + num(shape, "startY") * s);
        sx.lineTo(ox + num(shape, "endX") * s, oy + num(shape, "endY") * s);
        break;
      case "Arc":
        sx.arc(
          x + w / 2,
          y + h / 2,
          w / 2,
          ((num(shape, "startAngle") - 90) * Math.PI) / 180,
          ((num(shape, "startAngle") + num(shape, "endAngle") - 90) * Math.PI) / 180,
        );
        break;
      default:
        sx.rect(x, y, w, h);
    }
  };

  /** The text a `<Template>` shows, as a row of parts. Placeholders consume the `<Parameter>`
   *  children in order; a parameter with no CMF source drops out of the row and is reported. */
  const templateParts = (tpl: Element, upper: (t: string) => string) => {
    const params = [...tpl.children].filter((c) => c.tagName === "Parameter");
    const raw = [...tpl.childNodes]
      .filter((n) => n.nodeType === 3)
      .map((n) => n.nodeValue ?? "")
      .join("")
      .replace(/\s+/g, " ")
      .trim();
    const parts: Part[] = [];
    let i = 0;

    for (const piece of raw.split(/(%%|%[-\d.]*[sdf])/)) {
      if (!piece) continue;
      if (!/^%(%|[-\d.]*[sdf])$/.test(piece)) {
        parts.push({ text: upper(piece) });
        continue;
      }
      if (piece === "%%") {
        parts.push({ text: "%" });
        continue;
      }
      const expr = params[i++]?.getAttribute("expression") ?? "";
      const live = liveOf(resolve(expr));

      if (live) parts.push(live);
      else skips.add(`${expr.trim() || "parameter"} (no CMF data source)`);
    }
    return parts;
  };

  /** A `<TimeText format>` as a row of parts. */
  const formatParts = (fmt: string, upper: (t: string) => string) => {
    const parts: Part[] = [];

    for (const tok of fmt.match(/'[^']*'|([A-Za-z])\1*|[^A-Za-z']+/g) ?? []) {
      const live = /^[A-Za-z]/.test(tok) ? FMT[tok] : null;

      if (live) parts.push(live);
      else if (/^[A-Za-z]/.test(tok)) skips.add(`"${tok}" in "${fmt}" (no CMF data source)`);
      else parts.push({ text: upper(tok.replace(/'/g, "")) });
    }
    return parts;
  };

  /** Push a text row, or bake it when nothing in it is live. */
  const addText = async (el: Element, ctx: Ctx, parts: Part[], font: Element) => {
    const family = await familyOf(font.getAttribute("family"));
    const weight = { BOLD: 700, NORMAL: 400 }[font.getAttribute("weight") ?? ""] ?? 400;
    const css = fontOf(family, Math.round(num(font, "size", 20) * s) || 20, weight);
    const color = colorAttr(font, "color") ?? "#fff";
    const x = ctx.x; // walk already folded the part's own x/y into the context
    const y = ctx.y;
    const w = num(el, "width") * s;
    const h = num(el, "height") * s;
    // WFF centres a part's text in its box on both axes unless <Text align> says otherwise
    const align =
      { START: 0, CENTER: 1, END: 2 }[
        el.querySelector("Text")?.getAttribute("align") ?? "CENTER"
      ] ?? 1;
    const cell = glyphCell(
      parts.flatMap((p) => (isLive(p) ? (p.type === "select" ? p.labels : ["0"]) : [p.text])),
      css,
    );
    const baseline = y + (h - cell.h) / 2 + cell.base;
    const ax = align === 0 ? x : align === 2 ? x + w : x + w / 2;

    if (parts.some(isLive)) {
      fields.push({
        row: { parts, font: css, color, x: ax, y: baseline, align },
        box: [x, y, w, h],
        amb: ctx.amb,
        ax: ctx.ax,
        ay: ctx.ay,
      });
      return;
    }
    const flat = parts.map((p) => (isLive(p) ? "" : p.text)).join("");

    if (!flat.trim()) return;
    sx.font = css;
    sx.fillStyle = color;
    sx.textAlign = (["left", "center", "right"] as const)[align];
    sx.textBaseline = "alphabetic";
    sx.fillText(flat, ax, baseline);
    flush(ctx);
  };

  async function walk(el: Element, parent: Ctx) {
    for (const node of el.children) {
      const tag = node.tagName;

      if (tag === "Variant" || tag === "Metadata" || tag === "UserConfigurations") continue;
      if (tag === "ComplicationSlot") {
        skips.add(`complication slot ${node.getAttribute("slotId") ?? ""} (not on this watch)`);
        continue;
      }
      // a scene-level configuration renders the option the face ships as its default
      if (tag === "BooleanConfiguration" || tag === "ListConfiguration") {
        const want = opts.get(node.getAttribute("id") ?? "");
        const opt =
          [...node.children].find((o) => o.getAttribute("id") === want) ?? node.children[0];

        if (opt) await walk(opt, parent);
        continue;
      }
      if (tag === "Condition") {
        const named = new Map(
          [...(node.querySelector("Expressions")?.children ?? [])].map((e) => [
            e.getAttribute("name") ?? "",
            e.textContent ?? "",
          ]),
        );
        const taken =
          [...node.children]
            .filter((c) => c.tagName === "Compare")
            .find(
              (c) => truthy(resolve(named.get(c.getAttribute("expression") ?? "") ?? "")) === true,
            ) ?? [...node.children].find((c) => c.tagName === "Default");

        if (taken) await walk(taken, parent);
        continue;
      }
      const ctx = variants(node, {
        ...parent,
        x: parent.x + num(node, "x") * s,
        y: parent.y + num(node, "y") * s,
        alpha: parent.alpha * (num(node, "alpha", 255) / 255),
      });

      if (
        /^(Group|Scene|DigitalClock|AnalogClock|Compare|Default|BooleanOption|ListOption)$/.test(
          tag,
        )
      ) {
        await walk(node, ctx);
        continue;
      }
      if (tag === "TimeText") {
        const font = node.querySelector("Font");
        const up = node.querySelector("Upper") ? (t: string) => t.toUpperCase() : (t: string) => t;

        if (font)
          await addText(node, ctx, formatParts(node.getAttribute("format") ?? "", up), font);
        continue;
      }
      if (tag === "PartText") {
        const fonts = [...(node.querySelector("Text")?.children ?? [])].filter(
          (c) => c.tagName === "Font",
        );

        if (!fonts.length) continue;
        if (fonts.length > 1) skips.add(`${label(node)} (${fonts.length} font runs, first only)`);
        const font = fonts[0];
        const wrap = [...font.children].find((c) => c.tagName === "Upper" || c.tagName === "Lower");
        const up =
          wrap?.tagName === "Upper"
            ? (t: string) => t.toUpperCase()
            : wrap?.tagName === "Lower"
              ? (t: string) => t.toLowerCase()
              : (t: string) => t;
        const tpl = (wrap ?? font).querySelector("Template");

        await addText(
          node,
          ctx,
          tpl ? templateParts(tpl, up) : [{ text: up((font.textContent ?? "").trim()) }],
          font,
        );
        continue;
      }
      if (tag !== "PartImage" && tag !== "PartDraw") {
        skips.add(`${tag} ${label(node)}`);
        continue;
      }
      if (node.querySelector("Gyro")) skips.add(`${label(node)} (gyro parallax — baked still)`);

      // ---- PartImage / PartDraw: stage on the scratch canvas, then either blit or crop out
      // as a hand. A static `angle` rotates about the pivot, which WFF gives as a FRACTION of
      // the part's own size (pivotY="22" on a 10px-tall part reaches 220px down to the dial
      // centre — that is how a short tick becomes a full-length hand).
      const x = ctx.x;
      const y = ctx.y;
      const w = num(node, "width") * s;
      const h = num(node, "height") * s;
      const pxp = x + num(node, "pivotX", 0.5) * w;
      const pyp = y + num(node, "pivotY", 0.5) * h;
      const angle = num(node, "angle");
      const role = handRole(node);

      sx.save();
      if (angle) {
        sx.translate(pxp, pyp);
        sx.rotate((angle * Math.PI) / 180);
        sx.translate(-pxp, -pyp);
      }
      if (tag === "PartImage") {
        // a "[COMPLICATION.…]" resource is data this watch never has, and a name with no file
        // behind it is a resource the bundle kept out of the base split
        const res = node.querySelector("Image")?.getAttribute("resource") ?? "";
        const img = res.startsWith("[") ? null : await imageOf(res);

        if (!img) {
          sx.restore();
          if (res && !res.startsWith("[")) skips.add(`${label(node)} (image ${res} missing)`);
          continue;
        }
        sx.drawImage(img, x, y, w, h);
      } else {
        for (const shape of node.children) {
          if (/^(Variant|Transform|Gyro|Animation)$/.test(shape.tagName)) continue;
          shapePath(shape, x, y);
          const fill = paint(shape, "Fill");
          const stroke = paint(shape, "Stroke");

          if (fill) {
            sx.fillStyle = fill;
            sx.fill();
          }
          if (stroke) {
            sx.strokeStyle = stroke;
            sx.lineWidth =
              num(
                [...shape.children].find((c) => c.tagName === "Stroke")!,
                "thickness",
                1,
              ) * s;
            sx.stroke();
          }
        }
      }
      const tint = colorAttr(node, "tintColor");

      if (tint) {
        // WFF tints a part SRC_IN: the tint's colour, the part's own alpha. source-atop paints
        // exactly that — a multiply would leak the fill over everything the part left transparent
        sx.globalCompositeOperation = "source-atop";
        sx.fillStyle = tint;
        sx.fillRect(0, 0, W, W);
        sx.globalCompositeOperation = "source-over";
      }
      sx.restore();
      if (!role) {
        flush(ctx);
        continue;
      }
      const crop = cropOpaque(scratch);

      sx.clearRect(0, 0, W, W);
      if (!crop) continue;
      hands.push({
        role,
        canvas: crop.canvas,
        x: crop.x,
        y: crop.y,
        px: Math.round(pxp - crop.x),
        py: Math.round(pyp - crop.y),
        amb: ctx.amb,
      });
      for (const sh of [act, amb]) sh.cur = sh.ov; // statics after a hand go above it
    }
  }

  const scene = root.querySelector("Scene");

  if (!scene) throw new Error("watchface.xml has no <Scene>");
  await walk(scene, { x: 0, y: 0, alpha: 1, amb: true, ax: 0, ay: 0 });

  // Two fields on the same sources over the same box look like a duplicate but aren't: the idiom
  // is to split a clock across two fonts, one drawing the digits and one only the colon (this
  // bundle's time_no0 / time_only0), and dropping either loses half the glyphs. Wear OS stacks
  // them, so the import does too.
  if (!fields.length && !hands.length)
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
  const handRes: number[] = [];

  for (const h of hands) handRes.push(await addRes(h.canvas, 5));

  // AOD falls back to a dimmed copy of the active art — a WFF face describes its ambient look as
  // overrides on the same scene, so there is nothing separate to bake when none of them fire.
  if (!amb.used) {
    const dcx = amb.base.getContext("2d")!;

    dcx.drawImage(act.base, 0, 0);
    dcx.fillStyle = "rgba(0,0,0,0.6)";
    dcx.globalCompositeOperation = "source-atop";
    dcx.fillRect(0, 0, W, W);
    dcx.globalCompositeOperation = "source-over";
    amb.ov.getContext("2d")!.drawImage(act.ov, 0, 0);
  }

  async function screen(tag: number, sh: Sheet, ambient: boolean, name?: string) {
    const subs: FaceNode[] = name ? [{ tag: TAG.name, text: name }] : [];

    subs.push({
      tag: TAG.preview,
      subs: [
        {
          tag: TAG.pvStruct,
          prefix: "0000000000",
          refType: 0x61,
          images: [await addRes(scaled(sh.base, PREVIEW, PREVIEW), 4)],
        },
      ],
    });
    subs.push(imgWidget(0, 0, BG_META, await addRes(sh.base, 4)));
    for (const f of fields)
      if (!ambient || f.amb)
        subs.push(
          await buildRow(
            ambient ? { ...f.row, x: f.row.x + f.ax, y: f.row.y + f.ay } : f.row,
            addRes,
          ),
        );
    const drawn = new Set<string>(); // one hand per role per screen

    for (const [i, h] of hands.entries())
      if ((!ambient || h.amb) && !drawn.has(h.role)) {
        drawn.add(h.role);
        subs.push({
          tag: TAG.hand,
          subs: [
            {
              tag: TAG.struct,
              x: h.x,
              y: h.y,
              meta: HAND[h.role].meta,
              refType: 0x61,
              images: [handRes[i]],
              _kind: HAND[h.role].kind,
            },
            { tag: TAG.pivot, flag: 1, pivotX: h.px, pivotY: h.py },
          ],
        });
      }
    const crop = cropOpaque(sh.ov);

    if (crop) subs.push(imgWidget(crop.x, crop.y, META0, await addRes(crop.canvas, 5)));
    return { tag, subs };
  }

  // Nothing in the bundle carries a display name a user would recognise — the label is in the
  // compiled resource table, and the file itself is named after a CDN hash. Use the file name
  // when it reads like a name, "Watchface" when it doesn't.
  const stemName = file.name
    .replace(/\.aab$/i, "")
    .replace(/[^ -~]/g, "")
    .trim();
  const name = (/^[0-9a-f_]{16,}$/i.test(stemName) ? "" : stemName.slice(0, 14)) || "Watchface";
  const main = await screen(TAG.main, act, false, name);
  const aod = await screen(TAG.aod, amb, true);
  const nameRaw = new Uint8Array(16);

  new TextEncoder().encodeInto(name, nameRaw);
  nameRaw[15] = 0x0a; // same as CDN files, byte meaning not figured out
  return {
    face: { name, nameRaw: hex(nameRaw), screens: [main, aod], resources },
    skipped: [...skips],
  };
}
