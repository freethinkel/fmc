// The layers the editor creates from scratch have to serialize into a file the watch can read —
// the shapes themselves (ring spec, slot body, group frame) are checked through the editor in
// editor-new-nodes.browser.test.ts; this pins the one path that has no widget in it at all: a
// blank document, which is what "New" produces.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildBin,
  parseBin,
  TAG,
  type FaceNode,
  type Resource,
} from "../src/lib/modules/editor/core/format";
import { toLegacy } from "../src/lib/modules/editor/core/document/doc";
import { blankDoc, newRing, withName } from "../src/lib/modules/editor/core/document/factory";
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
// no stock file has — a 16-byte 0x5a spec under an 18-byte struct — and the watch skipped it.
// Pinned against a stock imageless ring (Combo's battery ring) rather than against literal
// numbers: the shape has to keep matching a file the firmware is known to draw.
const ringShape = (n: FaceNode) => {
  const st = n.subs!.find((s) => s.tag === TAG.struct)!;
  const spec = n.subs!.find((s) => s.tag === TAG.arc || s.tag === TAG.arcClipped)!;

  return { subs: n.subs!.map((s) => s.tag), tail: st.tail, specBytes: spec.hex!.length / 2 };
};

test("a fresh ring is written in the same node shape as a stock imageless ring", () => {
  const doc = blankDoc("Ring", res(2, 2), res(SCREEN, SCREEN));
  const screen = doc.screens[0];
  const built = parseBin(
    buildBin(toLegacy({ ...doc, screens: [{ ...screen, layers: [...screen.layers, newRing()] }] })),
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
