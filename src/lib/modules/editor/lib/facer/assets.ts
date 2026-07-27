// Reading a Facer export directory: files by name, images (base64 or PNG), fonts, colours,
// and the canvas helpers that turn any of it into a face Resource.
import { encodePixels, type Resource } from "../wf";

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

// Facer's base64 payloads ship unpadded, which atob rejects outright
export function unb64(text: string): Uint8Array<ArrayBuffer> {
  const t = text.trim();

  return Uint8Array.from(atob(t + "=".repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

export async function loadImage(map: Map<string, File>, hash: string): Promise<ImageBitmap> {
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

// ---- colours ----
export const argb = (v: number | string) => {
  const u = (typeof v === "string" ? parseInt(v) : v) >>> 0;

  return { r: (u >> 16) & 255, g: (u >> 8) & 255, b: u & 255, a: u >>> 24 };
};

export type ARGB = ReturnType<typeof argb>;

export const rgba = (c: ARGB, opacity = 100) =>
  `rgba(${c.r},${c.g},${c.b},${(c.a / 255) * (opacity / 100)})`;

// tint: multiply RGB, keep the source alpha (Facer is_tinted on white hands)
export function tinted(
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

export const fontCache = new Map<string, string>();

export async function loadFont(map: Map<string, File>, name?: string): Promise<string> {
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
