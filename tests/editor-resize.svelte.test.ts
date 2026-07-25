// resizeImageRequested: the format draws a widget 1:1 from its resource, so a resize
// re-encodes the pixels. Checked against a re-render (the rendered bbox is the contract),
// and for hands additionally that the rotation center doesn't move.
import { test, expect, vi } from "vitest";
import { TAG } from "$lib/modules/editor/lib/wf";
import { render } from "$lib/modules/editor/lib/render";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

async function load(label: string) {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label });
  });
  editorModel.simPatched({
    live: false,
    time: new Date("2026-01-09T10:09:30").getTime(),
  });
  return editorModel.$editor.getState();
}

const draw = () => {
  const s = editorModel.$editor.getState();
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  return render(c.getContext("2d")!, s.face!, TAG.main, s.sim);
};

test("resizing an image widget resizes its resource and its rendered box", async () => {
  const s = await load("resize-test");
  const hits = draw();
  const h0 = hits.find(
    (h) =>
      h.node.tag === TAG.image &&
      h.node.subs?.find((k) => k.tag === TAG.struct)?.images?.length === 1,
  )!;

  expect(h0).toBeTruthy();
  const ri = h0.node.subs!.find((k) => k.tag === TAG.struct)!.images![0];
  const w = Math.round(h0.w / 2),
    h = Math.round(h0.h / 2);

  editorModel.select(h0.node);
  editorModel.resizeImageRequested({ node: h0.node, w, h });
  await vi.waitFor(() => expect(s.face!.resources[ri].w).toBe(w));

  expect(s.face!.resources[ri].h).toBe(h);
  const after = draw().findLast((x) => x.node === h0.node)!;

  expect([after.w, after.h]).toEqual([w, h]);
  // still a valid file (also proves the re-encoded resource survives lz4 + rebuild)
  expect(editorModel.buildCurrentBin().length).toBeGreaterThan(0);
});

test("resizing a hand scales its pivot and keeps the rotation center put", async () => {
  const s = await load("resize-hand-test");

  const hand = draw().find((h) => h.node.tag === TAG.hand)!.node;

  expect(hand).toBeTruthy();
  const st = hand.subs!.find((k) => k.tag === TAG.struct)!;
  const pv = hand.subs!.find((k) => k.tag === TAG.pivot)!;
  const ri = st.images![0];
  const center = { x: st.x! + pv.pivotX!, y: st.y! + pv.pivotY! };
  const pivot0 = { x: pv.pivotX!, y: pv.pivotY! };
  const w0 = s.face!.resources[ri].w;

  editorModel.resizeImageRequested({
    node: hand,
    w: w0 * 2,
    h: s.face!.resources[ri].h * 2,
  });
  await vi.waitFor(() => expect(s.face!.resources[ri].w).toBe(w0 * 2));

  expect([pv.pivotX, pv.pivotY]).toEqual([pivot0.x * 2, pivot0.y * 2]);
  expect(st.x! + pv.pivotX!).toBe(center.x);
  expect(st.y! + pv.pivotY!).toBe(center.y);
});
