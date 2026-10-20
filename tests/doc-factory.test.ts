// The layers the editor creates from scratch have to serialize into a file the watch can read —
// the shapes themselves (ring spec, slot body, group frame) are checked through the editor in
// editor-new-nodes.browser.test.ts; this pins the one path that has no widget in it at all: a
// blank document, which is what "New" produces.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildBin,
  decodePixels,
  encodePixels,
  parseBin,
  TAG,
  type FaceNode,
  type Resource,
} from "../src/lib/modules/editor/core/format";
import {
  fromLegacy,
  newImageId,
  toLegacy,
  type ImageAsset,
  type Layer,
  type RingLayer,
} from "../src/lib/modules/editor/core/document/doc";
import {
  PROGRESS_STEPS,
  blankDoc,
  newProgressLine,
  newRing,
  progressLineOf,
  withName,
} from "../src/lib/modules/editor/core/document/factory";
import {
  progressLineColor,
  progressLinePixels,
  progressLineStored,
} from "../src/lib/modules/editor/core/render/pixels";
import { SCREEN } from "../src/lib/modules/editor/core/render/screen";

const res = (w: number, h: number): Resource => ({
  cf: 4,
  w,
  h,
  data: new Uint8Array(w * h * 2),
});

test("a blank document builds into a parseable file with both of its assets", () => {
  const doc = blankDoc("Fresh", res(2, 2), res(SCREEN, SCREEN));
  const built = parseBin(buildBin(toLegacy(doc)));

  expect(built.name).toBe("Fresh");
  // the preview thumbnail and the background, in that order
  expect(built.resources).toHaveLength(2);
  expect([built.resources[0].w, built.resources[1].w]).toEqual([2, SCREEN]);
  // one main screen carrying the name node, the embedded preview and the background
  expect(built.screens).toHaveLength(1);
  expect(built.screens[0].tag).toBe(TAG.main);
  expect(built.screens[0].subs!.map((n) => n.tag)).toEqual([TAG.name, TAG.preview, 0x30]);
});

// #37: a ring that renders in the editor but is missing on the watch. The editor wrote a shape
// no stock file has — a 16-byte 0x5a spec under an 18-byte struct — and a meta with no color
// source in it (byte 7 = 0, or 4 over a zero accent slot). Pinned against a stock imageless ring
// (Combo's battery ring) rather than against literal numbers: the bytes have to keep matching a
// file the firmware is known to draw.
const ringShape = (n: FaceNode) => {
  const st = n.subs!.find((s) => s.tag === TAG.struct)!;
  const spec = n.subs!.find((s) => s.tag === TAG.arc || s.tag === TAG.arcClipped)!;

  return {
    subs: n.subs!.map((s) => s.tag),
    tail: st.tail,
    specBytes: spec.hex!.length / 2,
    color: st.meta!.slice(8, 18), // bytes 4..8: rgb / accent slot, the flag byte, the reserved one
  };
};

/** What builds before the fix put in a file: a 0x5a spec with nothing past its body, no struct
 *  tail, and a meta with no color source. Opening such a face has to repair it. */
const legacyRing = (): RingLayer => {
  const r = newRing();

  return {
    ...r,
    tail: "",
    meta: { ...r.meta, flags: 0, rgb: [0, 0, 0] },
    spec: { ...r.spec, kind: TAG.arc, rest: "" },
  };
};

test.each([
  ["fresh", newRing],
  ["legacy", legacyRing],
])("a %s ring is written in the same node shape as a stock imageless ring", (_label, make) => {
  const doc = blankDoc("Ring", res(2, 2), res(SCREEN, SCREEN));
  const screen = doc.screens[0];
  const built = parseBin(
    buildBin(toLegacy({ ...doc, screens: [{ ...screen, layers: [...screen.layers, make()] }] })),
  );
  const written = built.screens[0].subs!.find((n) => n.tag === 0x81)!;

  const stock = parseBin(readFileSync("tests/__fixtures__/Multifunction__366__Combo.bin"));
  const bare: FaceNode[] = [];
  const walk = (n: FaceNode) => {
    const st = n.subs?.find((s) => s.tag === TAG.struct);

    if (st && !st.images && n.subs!.some((s) => s.tag === TAG.arcClipped)) bare.push(n);
    n.subs?.forEach(walk);
  };

  stock.screens.forEach(walk);
  expect(ringShape(written)).toEqual(ringShape(bare[0]));
});

// The name lives in the 16-byte header field (cut to 15 bytes) and in the 0x86 node, while
// `name` keeps it whole — the trailing header byte means something we haven't figured out, so it
// has to survive a rename untouched.
test("renaming keeps the header's trailing byte and cuts only the header copy", () => {
  const doc = withName(
    blankDoc("Fresh", res(2, 2), res(SCREEN, SCREEN)),
    "A name well over fifteen",
  );
  const built = parseBin(buildBin(toLegacy(doc)));

  expect(doc.name).toBe("A name well over fifteen");
  expect(built.name).toBe("A name well ov");
  expect(built.screens[0].subs!.find((n) => n.tag === TAG.name)?.text).toBe(
    "A name well over fifteen",
  );
});

// #61: the format has no linear gauge, so a progress line is a battery picker with one frame per
// percent — the node shape of Hemisphere's battery-percent text, whose 101 frames are rotated
// '0%'..'100%' text, not a gauge (a filling bar on it is unverified on a watch). Pinned against
// that file's own node, and the frames have to fill in step with the percent that picks them.
test("a progress line is written like Hemisphere's 101-frame battery-percent picker", () => {
  const assets = Array.from({ length: PROGRESS_STEPS }, (_, i): ImageAsset => {
    const r = encodePixels(progressLinePixels(200, 12, i, false), 200, 12, 5);

    return { id: newImageId(), cf: r.cf, w: r.w, h: r.h, data: r.data };
  });
  const doc = blankDoc("Line", res(2, 2), res(SCREEN, SCREEN));
  const line = newProgressLine(
    assets.map((a) => a.id),
    200,
    12,
  );
  const built = parseBin(
    buildBin(
      toLegacy({
        ...doc,
        images: new Map([...doc.images, ...assets.map((a) => [a.id, a] as const)]),
        screens: [{ ...doc.screens[0], layers: [...doc.screens[0].layers, line] }],
      }),
    ),
  );
  const written = built.screens[0].subs!.at(-1)!.subs![0];
  const stock = parseBin(readFileSync("tests/__fixtures__/Analog__370__Hemisphere.bin"));
  const pickers: FaceNode[] = [];
  const walk = (n: FaceNode) => {
    if (n.tag === TAG.struct && n.images?.length === PROGRESS_STEPS) pickers.push(n);
    n.subs?.forEach(walk);
  };

  stock.screens.forEach(walk);
  expect(pickers).toHaveLength(1);
  expect([written.meta, written.refType]).toEqual([pickers[0].meta, pickers[0].refType]);
  expect(written.images).toHaveLength(PROGRESS_STEPS);

  // alpha of the first and last column: empty at 0%, half way at 50%, full at 100%
  const ends = (pct: number) => {
    const px = decodePixels(built.resources[written.images![pct]])!;

    return [px[3], px[199 * 4 + 3]];
  };

  expect([ends(0), ends(50), ends(100)]).toEqual([
    [51, 51],
    [255, 51],
    [255, 255],
  ]);
});

// Count filled (opaque) pixels exactly, so an off-by-one at 50% shows up, and check the vertical
// bar fills from the bottom row up.
test("progress-line frames fill exactly pct percent, vertical from the bottom", () => {
  const opaque = (px: Uint8ClampedArray) => px.filter((v, i) => i % 4 === 3 && v === 255).length;
  const row = (px: Uint8ClampedArray, w: number, y: number) =>
    Array.from({ length: w }, (_, x) => px[(y * w + x) * 4 + 3]);

  expect(opaque(progressLinePixels(200, 12, 50, false))).toBe(100 * 12);
  expect(opaque(progressLinePixels(200, 12, 51, false))).toBe(102 * 12);
  expect(row(progressLinePixels(200, 1, 50, false), 200, 0).indexOf(51)).toBe(100);

  const v = progressLinePixels(12, 200, 50, true);

  expect(opaque(v)).toBe(100 * 12);
  expect(row(v, 12, 199)).toEqual(Array(12).fill(255));
  expect(row(v, 12, 100)).toEqual(Array(12).fill(255));
  expect(row(v, 12, 99)).toEqual(Array(12).fill(51));
  expect(row(v, 12, 0)).toEqual(Array(12).fill(51));
});

// The colour lives only in the frames, so the inspector reads it back off the full one, and a
// recolour must find the line again by shape — but not Hemisphere's '0%'..'100%' text, which has
// the same meta and frame count and would be overwritten with bars.
test("a progress line's colour reads back off its frames; Hemisphere's text is no progress line", () => {
  const frame = (pct: number): ImageAsset => {
    const r = encodePixels(progressLinePixels(12, 200, pct, true, "#ff5c00"), 12, 200, 5);

    return { id: newImageId(), cf: r.cf, w: r.w, h: r.h, data: r.data };
  };
  const assets = Array.from({ length: PROGRESS_STEPS }, (_, i) => frame(i));
  const doc = blankDoc("Line", res(2, 2), res(SCREEN, SCREEN));
  const line = newProgressLine(
    assets.map((a) => a.id),
    12,
    200,
  );
  const images = new Map([...doc.images, ...assets.map((a) => [a.id, a] as const)]);
  const found = progressLineOf({ ...doc, images }, line);

  expect(found?.vertical).toBe(true);
  // cf 5 keeps 5/6/5 bits: 0x5c green comes back as 0x5d — the same value picking it again
  // compares against, so a re-pick is a no-op
  expect(progressLineColor(found!.full)).toBe("#ff5d00");
  expect(progressLineStored("#ff5c00")).toBe("#ff5d00");

  // a turn is baked into the pixels, and a redraw would lay the line flat again
  const turned = new Map(images).set(found!.full.id, { ...found!.full, rotate: 10 });

  expect(progressLineOf({ ...doc, images: turned }, line)).toBeNull();

  const hemi = fromLegacy(
    parseBin(readFileSync("tests/__fixtures__/Analog__370__Hemisphere.bin")),
  ).doc;
  const layers: Layer[] = [];
  const walk = (l: Layer) => {
    layers.push(l);
    if (l.kind === "group") l.children.forEach(walk);
  };

  hemi.screens.forEach((sc) => sc.layers.forEach(walk));
  const text = layers.filter((l) => l.kind === "image" && l.frames.length === PROGRESS_STEPS);

  expect(text).toHaveLength(1);
  expect(progressLineOf(hemi, text[0])).toBeNull();
});
