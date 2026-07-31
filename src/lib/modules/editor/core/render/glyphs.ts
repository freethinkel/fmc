// Text -> sprites. The format has no text rendering at all: a number widget is ten bitmaps and a
// weekday selector seven, so every label a face shows has to be rasterized first. Written for the
// Facer importer, which bakes the same sets out of a template; the editor's own "from a font"
// generator is the second caller, which is why this sits here and not under import/facer.
import { resourceFromCanvas } from "./pixels";

export const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** cf 5 — RGB565 + 8-bit alpha, the one format that keeps antialiased edges. */
export const GLYPH_CF = 5;

/** The cell every sprite of a set shares. `base` is the text baseline inside it — Facer positions
 *  text by its baseline, so a field's y is the layer's y minus this. */
export interface Cell {
  w: number;
  h: number;
  base: number;
}

/** A CSS font shorthand — what both measuring and drawing take. */
export const fontOf = (
  family: string,
  sizePx: number,
  weight: number | string = 400,
  italic = false,
) => `${italic ? "italic " : ""}${weight} ${sizePx}px ${family}`;

/** A family may not be rasterized yet (a webfont, or one just registered from a file) — measuring
 *  before it loads silently falls back to the default face and every metric comes out wrong. */
export const ensureFont = (font: string) => document.fonts.load(font).catch(() => []);

// One cell wide enough for every label in the set: the number widget lays its glyphs out edge to
// edge (`cx += b.width` in drawDigits), so unequal widths make the value jitter as it changes.
// `spacing` widens the cell without moving the glyph — tracking, since there is nothing between
// two sprites to space out.
export function glyphCell(labels: string[], font: string, spacing = 0): Cell {
  const meas = new OffscreenCanvas(4, 4).getContext("2d")!;

  meas.font = font;
  let w = 1,
    asc = 0,
    desc = 0;

  for (const s of labels) {
    const m = meas.measureText(s);

    w = Math.max(w, Math.ceil(m.width));
    // measured, never guessed from the point size: digits have no descender, so a guessed one
    // fires or doesn't depending on whether the browser reports an exact 0 — which differs
    // between platforms and even between sizes of the same face, and makes the cell's height
    // jump by a quarter of the point size instead of following it
    asc = Math.max(asc, m.actualBoundingBoxAscent || 0);
    desc = Math.max(desc, m.actualBoundingBoxDescent || 0);
  }
  const base = Math.ceil(asc) + 2;

  return { w: Math.max(1, w + CELL_PAD + spacing), h: base + Math.ceil(desc) + 2, base };
}

/** Room for antialiasing around the glyph, on both axes. Fixed, so it is what a resize has to
 *  take off both sizes before working out how much the point size itself has to change. */
export const CELL_PAD = 4;

/** Rasterize each label centered in the shared cell. */
export function renderGlyphs(labels: string[], font: string, color: string, cell: Cell) {
  return labels.map((s) => {
    const c = new OffscreenCanvas(cell.w, cell.h);
    const cx = c.getContext("2d")!;

    cx.font = font;
    cx.fillStyle = color;
    cx.textAlign = "center";
    cx.textBaseline = "alphabetic";
    cx.fillText(s, cell.w / 2, cell.base);
    return c;
  });
}

/** Everything needed to rasterize a set — kept around by the editor so a resize can re-render at
 *  the new size instead of scaling the bitmaps, which is what makes big digits soft. */
export type GlyphSpec = {
  labels: readonly string[];
  family: string;
  sizePx: number;
  weight: number;
  italic: boolean;
  color: string;
  /** Extra cell width. The sprites are drawn edge to edge, so tracking is all there is to space. */
  spacing: number;
};

/** The point size whose cell comes out `h` tall. One ratio step misses by up to a few pixels —
 *  the cell rounds ascent and descent up separately, so its height isn't proportional to the
 *  point size — so the ratio is re-applied against a fresh measurement until it lands. Measuring
 *  is measureText only, no rasterizing. */
export async function sizeForHeight(spec: GlyphSpec, h: number): Promise<number> {
  const labels = spec.labels.filter((s) => s.length);
  let size = spec.sizePx,
    best = size,
    err = Infinity;

  for (let i = 0; i < 6; i++) {
    const font = fontOf(spec.family, size, spec.weight, spec.italic);

    await ensureFont(font);
    const cell = glyphCell(labels, font, spec.spacing);
    const off = Math.abs(cell.h - h);

    if (off < err) {
      err = off;
      best = size;
    }
    if (!off) break;
    size = Math.max(1, (size * (h - CELL_PAD)) / Math.max(1, cell.h - CELL_PAD));
  }
  return best;
}

/** The sprites a spec describes, encoded and decoded: what the generator stores and what a resize
 *  re-renders. Empty labels are dropped — the caller's text field is free-form. */
export async function glyphSprites(spec: GlyphSpec, cf = GLYPH_CF) {
  const labels = spec.labels.filter((s) => s.length);
  const font = fontOf(spec.family, spec.sizePx, spec.weight, spec.italic);

  await ensureFont(font);
  const cell = glyphCell(labels, font, spec.spacing);

  return Promise.all(
    renderGlyphs(labels, font, spec.color, cell).map(async (canvas) => ({
      resource: resourceFromCanvas(canvas, cf),
      bitmap: await createImageBitmap(canvas),
    })),
  );
}

// A font file the user picked, registered under a family name of our own so it can't collide with
// an installed one. Keyed by name+size: re-picking the same file must not register it twice.
const registered = new Map<string, string>();

export async function registerFont(file: File): Promise<string> {
  const key = `${file.name}:${file.size}`;
  const hit = registered.get(key);

  if (hit) return hit;
  const family = `fmc_${file.name.replace(/\W/g, "_")}`;
  const ff = new FontFace(family, await file.arrayBuffer());

  await ff.load();
  document.fonts.add(ff);
  registered.set(key, family);
  return family;
}

/** Installed families, via the Local Font Access API. Chromium-only and permission-gated, so an
 *  empty list is a normal answer — the caller falls back to the families the app ships. */
export async function localFamilies(): Promise<string[]> {
  const query = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> })
    .queryLocalFonts;

  if (!query) return [];
  try {
    return [...new Set((await query.call(window)).map((f) => f.family))].sort();
  } catch {
    return []; // permission denied — not an error worth showing
  }
}
