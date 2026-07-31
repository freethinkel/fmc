// alignRequested: nudges the selected layer so its rendered bbox lands on the container's
// edge/center — checked against a re-render, not raw x/y, since that's the model's contract.
import { test, expect } from "vitest";
import { parseBin } from "$lib/modules/editor/core/format";
import { renderDoc } from "$lib/modules/editor/core/render/render";
import { decodeAssets } from "$lib/modules/editor/core/render/pixels";
import { defaultSim } from "$lib/modules/editor/core/document/sources";
import {
  fromLegacy,
  type Doc,
  type GroupLayer,
  type Layer,
} from "$lib/modules/editor/core/document/doc";
import { patchLayer } from "$lib/modules/editor/core/document/edits";
import { editorModel } from "$lib/modules/editor/model";
import { SCREEN } from "$lib/modules/editor/core/render/screen";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";
import groupedUrl from "./__fixtures__/Multifunction__368__Function.bin?url";

const doc = () => editorModel.$doc.getState()!;

const load = async (from: string, label: string) => {
  const buf = await fetch(from).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label });
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
};

const canvas = () => {
  const c = document.createElement("canvas");

  c.width = c.height = SCREEN;
  return c.getContext("2d")!;
};

const draw = (ctx: CanvasRenderingContext2D) =>
  renderDoc(ctx, doc(), editorModel.$store.getState(), "main", editorModel.$sim.getState());

test("align lands the rendered bbox on center/bottom", async () => {
  await load(url, "align-test");
  const ctx = canvas();
  // a plain widget (not group/hand) with its own x/y, smaller than the screen
  const h0 = draw(ctx).find(
    (h) => h.w > 0 && h.w < 400 && h.layer.kind !== "group" && h.layer.kind !== "hand",
  )!;

  expect(h0).toBeTruthy();

  editorModel.select(h0.layer.id);
  editorModel.alignRequested("hcenter");
  editorModel.alignRequested("bottom");

  const h = draw(ctx).findLast((x) => x.layer.id === h0.layer.id)!;

  expect(h.x).toBe(Math.round((SCREEN - h.w) / 2));
  expect(h.y).toBe(SCREEN - h.h);
});

// A group frame's main-axis alignment is the flex alignment of the AUTO-laid-out children, not a
// pixel gap — 0 = START, 2 = CENTER (see drawGroup's header). Community faces write 0 there and
// the watch left-aligns them (AEGIS_Ground_Force's 200px-wide label frames); every official
// corpus face writes 2 or 0x0a and centers. Drives the row off one fixture, both ways.
test("a group frame's main alignment picks START vs CENTER for the auto row", async () => {
  const buf = await fetch(groupedUrl).then((r) => r.arrayBuffer());
  const { doc: base } = fromLegacy(parseBin(buf));
  const cache = await decodeAssets(base.images);
  const ctx = canvas();
  const sim = { ...defaultSim(), live: false, time: new Date("2026-01-09T10:09:30").getTime() };
  const drawLocal = (d: Doc) => renderDoc(ctx, d, { assets: d.images, cache }, "main", sim);

  // a rendered group with a rendered AUTO child and a frame wider than that row
  const target = (() => {
    for (const gh of drawLocal(base).filter((h) => h.layer.kind === "group" && h.w > 0)) {
      const group = gh.layer as GroupLayer;
      // everything that packs into the row: auto-marked children plus a number hugging them at
      // x=0 (its width is dynamic, so it can't carry the marker — see drawGroup)
      const kids = group.children
        .filter(
          (k) =>
            k.kind !== "group" &&
            k.kind !== "raw" &&
            (k.meta.auto || (k.kind === "number" && !k.x)),
        )
        .map((k) => k.id);
      const hits = drawLocal(base).filter((h) => kids.includes(h.layer.id));

      if (hits.length && group.frame.w > hits.reduce((s, h) => s + h.w, 0))
        return { id: group.id, frame: group.frame, kids };
    }
  })()!;

  expect(target).toBeTruthy();
  const rowLeftWith = (main: number) => {
    const d = patchLayer(base, target.id, {
      frame: { ...target.frame, main },
    } as Partial<Layer>);

    return Math.min(
      ...drawLocal(d)
        .filter((h) => target.kids.includes(h.layer.id))
        .map((h) => h.x),
    );
  };

  const centered = rowLeftWith(2);

  expect(rowLeftWith(0)).toBe(target.frame.x);
  expect(centered).toBeGreaterThan(target.frame.x);
});

test("align aligns a group child within its parent frame", async () => {
  await load(groupedUrl, "align-test-grouped");
  const ctx = canvas();
  const hits = draw(ctx);
  // a rendered group with a fixed frame + a rendered non-auto, non-ring child of it
  const pair = (() => {
    for (const gh of hits.filter((h) => h.layer.kind === "group" && h.w > 0)) {
      const group = gh.layer as GroupLayer;

      for (const ch of hits) {
        const kid = ch.layer;

        if (
          group.children.some((k) => k.id === kid.id) &&
          kid.kind !== "group" &&
          kid.kind !== "ring" &&
          kid.kind !== "raw" &&
          !kid.meta.auto &&
          ch.h > 0 &&
          ch.h < gh.h
        )
          return { group: gh.layer.id, child: kid.id };
      }
    }
  })()!;

  expect(pair).toBeTruthy();

  editorModel.select(pair.child);
  editorModel.alignRequested("bottom");

  const after = draw(ctx);
  const g = after.findLast((x) => x.layer.id === pair.group)!;
  const h = after.findLast((x) => x.layer.id === pair.child)!;

  expect(h.y).toBe(g.y + g.h - h.h);
});

// A group's frame x/y are int16, same as a widget's: nudging a group off the left edge used to
// write -3 and read it back as 65533, which parked the whole group off the right instead.
test("a frame keeps a negative x instead of wrapping to 65533", () => {
  const v = new Uint8Array(21);

  v[0] = -3;
  v[1] = -3 >> 8;
  v[2] = -7;
  v[3] = -7 >> 8;
  v[4] = 100; // w stays unsigned
  const hex = [...v].map((b) => b.toString(16).padStart(2, "0")).join("");
  const { doc: parsed } = fromLegacy({
    name: "t",
    screens: [{ tag: 0x21, subs: [{ tag: 0x68, subs: [{ tag: 0x48, hex }] }] }],
    resources: [],
  });
  const group = parsed.screens[0].layers.find((l) => l.kind === "group") as GroupLayer;

  expect([group.frame.x, group.frame.y, group.frame.w]).toEqual([-3, -7, 100]);
});
