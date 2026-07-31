// Regenerating a widget's sprites from a font. The point of the shared cell is that a number
// widget draws its glyphs edge to edge — unequal sprite widths make the value jump around as it
// changes — so what is checked here is that every sprite comes out the same size, whatever the
// labels, and that the layer itself survives the swap.
import { test, expect } from "vitest";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import { framesOf, type Layer, type NodeId } from "$lib/modules/editor/core/document/doc";
import { DIGITS } from "$lib/modules/editor/core/render/glyphs";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Digital__281__Metaball.bin?url";

const doc = () => editorModel.$doc.getState()!;
const byId = (id: NodeId) => findLayer(doc(), id)!;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const load = async (label: string) => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label });
  });
};

async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await sleep(5);
  expect(cond()).toBe(true);
}

/** The first number widget on the main screen, however deep it sits. */
function firstNumber(): Layer {
  const walk = (ls: readonly Layer[]): Layer | null => {
    for (const l of ls) {
      if (l.kind === "number") return l;
      const kids = l.kind === "group" ? l.children : l.kind === "raw" ? (l.children ?? []) : [];
      const hit = walk(kids);

      if (hit) return hit;
    }
    return null;
  };

  return walk(doc().screens[0].layers)!;
}

const spec = (
  target: NodeId,
  over: Partial<Parameters<typeof editorModel.glyphsRequested>[0]> = {},
) => ({
  target,
  labels: DIGITS,
  family: "monospace",
  sizePx: 40,
  weight: 500,
  italic: false,
  color: "#ffffff",
  spacing: 0,
  ...over,
});

/** The decoded size of every frame a layer draws. */
const sizes = (id: NodeId) =>
  framesOf(byId(id)).map((f) => {
    const a = doc().images.get(f)!;

    return `${a.w}x${a.h}`;
  });

test("a number's ten glyphs are replaced by equal-size sprites from a font", async () => {
  await load("glyphs");
  const num = firstNumber();
  const before = framesOf(num);

  expect(before.length).toBe(10);
  editorModel.glyphsRequested(spec(num.id));
  await until(() => framesOf(byId(num.id))[0] !== before[0]);

  const after = framesOf(byId(num.id));

  expect(byId(num.id).kind).toBe("number"); // same layer, new pixels
  expect(after).toHaveLength(10);
  expect(new Set(sizes(num.id)).size).toBe(1); // one cell for all ten — nothing jitters
  expect(doc().images.get(after[8])!.data.length).toBeGreaterThan(0);

  // the file still builds with the generated sprites in it
  expect((await editorModel.buildCurrentBin()).byteLength).toBeGreaterThan(0);
});

test("spacing widens the cell, and meta is left alone", async () => {
  await load("glyphs-spacing");
  const num = firstNumber();

  const first = framesOf(num)[0];

  editorModel.glyphsRequested(spec(num.id, { spacing: 0 }));
  await until(() => framesOf(byId(num.id))[0] !== first);
  const tight = doc().images.get(framesOf(byId(num.id))[0])!.w;
  const second = framesOf(byId(num.id))[0];

  editorModel.glyphsRequested(spec(num.id, { spacing: 10 }));
  await until(() => framesOf(byId(num.id))[0] !== second);
  expect(doc().images.get(framesOf(byId(num.id))[0])!.w).toBe(tight + 10);
  expect(new Set(sizes(num.id)).size).toBe(1);

  // regeneration touches frames only — the accent flag and the source stay the inspector's
  const l = byId(num.id);

  expect(l.kind !== "group" && l.kind !== "raw" && l.meta).toEqual(
    num.kind !== "group" && num.kind !== "raw" && num.meta,
  );
});

test("an empty number widget can be created and then filled from a font", async () => {
  await load("glyphs-empty");
  const before = doc().screens[0].layers.length;

  editorModel.numberAdded();
  await until(() => doc().screens[0].layers.length === before + 1);
  const id = editorModel.$sel.getState()!;

  expect(byId(id).kind).toBe("number");
  expect(framesOf(byId(id))).toHaveLength(10); // one blank per digit, no file picked
  const blank = framesOf(byId(id))[0];

  editorModel.glyphsRequested(spec(id, { sizePx: 32 }));
  await until(() => framesOf(byId(id))[0] !== blank);
  expect(framesOf(byId(id))).toHaveLength(10);
  expect(new Set(sizes(id)).size).toBe(1);
});

test("resizing a generated set re-renders it from the font instead of scaling the pixels", async () => {
  await load("glyphs-resize");
  const num = firstNumber();
  const before = framesOf(num)[0];

  editorModel.glyphsRequested(spec(num.id, { sizePx: 20 }));
  await until(() => framesOf(byId(num.id))[0] !== before);
  const frame = framesOf(byId(num.id))[0];
  const small = doc().images.get(frame)!;

  editorModel.resizeImageRequested({ layer: num.id, w: small.w * 2, h: small.h * 2 });
  await until(() => doc().images.get(frame)!.h > small.h);

  const big = doc().images.get(frame)!;

  // the height follows the drag; the font's own metrics decide the last pixel or two
  expect(Math.abs(big.h - small.h * 2)).toBeLessThanOrEqual(2);

  // re-rendered, not rescaled: the resize path that scales bitmaps pins an `original` in the
  // cache and leaves `data` stale for flushAssets — this one writes fresh bytes and no original
  expect(editorModel.$cache.getState().get(frame)?.original).toBeUndefined();
  expect(big.data).not.toEqual(small.data);
  expect(big.w).toBeGreaterThan(small.w);
  expect(new Set(sizes(num.id)).size).toBe(1); // still one cell across the set
});

test("labels of different widths still share one cell", async () => {
  await load("glyphs-labels");
  const num = firstNumber();

  // "Sun" and "Wed" are wider than "Fri" in most faces — the widest wins for all seven
  editorModel.glyphsRequested(
    spec(num.id, { labels: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] }),
  );
  await until(() => framesOf(byId(num.id)).length === 7);
  expect(new Set(sizes(num.id)).size).toBe(1);
});
