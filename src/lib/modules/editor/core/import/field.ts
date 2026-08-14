// A live text field, as the watch expresses one: a row of sprite sets in a 0x68 group whose
// 0x48 frame lays the auto-width children out. Lifted out of ./facer when ./wff became the third
// importer to need it (the note in ./facer/assets.ts called this move).
import { hex, TAG, type FaceNode } from "../format";
import { DIGITS, glyphCell, renderGlyphs } from "../render/glyphs";
import { SCREEN } from "../render/screen";

export type Live =
  | { type: "number"; id: number; digits: number; fmt: string; sub?: number; max?: number }
  | { type: "select"; id: number; labels: string[] };
/** A field is a row of parts — literal sprites and live widgets in template order, packed
 *  into one auto-width group: "#WCT#°" is a value plus a unit, "(floor(#Db#/10))(#Db#%10):
 *  #DmZ#" is hour, colon, minute. */
export type Part = { text: string } | Live;

export const isLive = (p: Part): p is Live => !("text" in p);

/** The labels a part's sprite set has to cover: its own text, the values of a select, or the
 *  ten digits a number cycles through. */
export const labelsOf = (p: Part) =>
  !isLive(p) ? [p.text] : p.type === "select" ? p.labels : DIGITS;

// numMeta: struct 0x01 meta blob — bytes 0–1 = width (0x8000 marks an auto-width child of a
// centring group), 9 = data source id, 10 = sub, 11–13 = u24 max.
export function numMeta(id: number, sub = 0, max = 0, auto = false): string {
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
// 0 = START, 2 = CENTER — see parseFrame in ../render/render.ts), zero-padded to 21 bytes
const ALIGN_START = 0 | (2 << 2); // cross always centres: the row is exactly frame-height here
const ALIGN_CENTER = 2 | (2 << 2);

export function frameHex(x: number, y: number, w: number, h: number, align: number): string {
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

export interface Row {
  parts: Part[];
  /** CSS font shorthand — see fontOf in ../render/glyphs. */
  font: string;
  color: string;
  /** The row's anchor: its left edge, its centre or its right edge, per `align`. */
  x: number;
  /** Text baseline. */
  y: number;
  /** 0 = left, 1 = centre, 2 = right. */
  align: number;
}

/** buildRow: a classified text row -> a CMF widget node.
 *  Everything goes in a 0x68 group whose 0x48 frame lays out auto-width (meta.w = 0x8000)
 *  children — that's how the stock faces both centre a field and pack a value next to its
 *  unit ("80" + "%"). A plain x can only be right for one digit count, and there is no other
 *  way to keep literal text glued to a value whose width changes. */
export async function buildRow(
  { parts, font, color, x: ax, y: baseline, align }: Row,
  addRes: (canvas: OffscreenCanvas, cf: number) => Promise<number>,
): Promise<FaceNode> {
  // one vertical metric across every part so the whole row shares a baseline
  const tall = glyphCell(parts.flatMap(labelsOf), font);
  const sprites = new Map<string, number[]>(); // hour and minute share one digit set
  const cellOf = async (p: Part) => {
    const labels = labelsOf(p);
    const cell = { ...glyphCell(labels, font), h: tall.h, base: tall.base };
    const key = labels.join("|");

    if (!sprites.has(key)) {
      const res: number[] = [];

      for (const sp of renderGlyphs(labels, font, color, cell)) res.push(await addRes(sp, 5));
      sprites.set(key, res);
    }
    return { cell, images: sprites.get(key)! };
  };
  const auto = (meta: string, images: number[], node: (st: FaceNode) => FaceNode) =>
    node({ tag: TAG.struct, x: 0, y: 0, meta, refType: 0x61, images });
  const kids: FaceNode[] = [];
  let row = 0;

  for (const p of parts) {
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
  const x = Math.round(ax);
  const y = Math.max(0, Math.round(baseline - tall.base));

  // frame width 0 means "auto-size to content", so the row just starts at the frame origin —
  // that covers left align, and right align by shifting the origin back a typical row width.
  // widest box centred on x that still fits the screen; too narrow means x sits near an
  // edge, where there is nothing to centre against
  const gw = Math.min(2 * x, 2 * (SCREEN - x));
  const [fx, fw, al] =
    align === 1 && gw > row
      ? [x - gw / 2, gw, ALIGN_CENTER]
      : align === 2
        ? [Math.max(0, x - row), 0, ALIGN_START]
        : [x, 0, ALIGN_START];

  return {
    tag: TAG.group,
    subs: [{ tag: TAG.frame, hex: frameHex(fx, y, fw, tall.h, al) }, ...kids],
  };
}
