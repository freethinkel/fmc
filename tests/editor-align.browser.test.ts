// alignSelected: nudges the selected node so its rendered bbox lands on the screen
// edge/center — checked against a re-render, not raw x/y, since that's the model's contract.
import { test, expect } from "vitest";
import { TAG, parseBin, unhex, hex } from "$lib/modules/editor/lib/wf";
import { render, parseFrame } from "$lib/modules/editor/lib/render";
import { defaultSim, metaInfo } from "$lib/modules/editor/lib/sources";
import { editorModel } from "$lib/modules/editor/model";
import { bitmapOf } from "$lib/modules/editor/lib/pixels";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";
import groupedUrl from "./__fixtures__/Multifunction__368__Function.bin?url";

test("alignSelected lands the rendered bbox on center/bottom", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "align-test" });
  });
  editorModel.simPatched({
    live: false,
    time: new Date("2026-01-09T10:09:30").getTime(),
  });
  const s = editorModel.$editor.getState();

  const c = document.createElement("canvas");

  c.width = c.height = 466;
  const hits = render(c.getContext("2d")!, s.face!, TAG.main, s.sim);
  // a plain widget (not group/hand) with its own struct x/y, smaller than the screen
  const h0 = hits.find(
    (h) =>
      h.w > 0 &&
      h.w < 400 &&
      h.node.tag !== TAG.group &&
      h.node.tag !== TAG.hand &&
      h.node.subs?.some((k) => k.tag === TAG.struct && k.x != null),
  )!;

  expect(h0).toBeTruthy();

  editorModel.select(h0.node);
  editorModel.alignSelected("hcenter");
  editorModel.alignSelected("bottom");

  const s2 = editorModel.$editor.getState();
  const hits2 = render(c.getContext("2d")!, s2.face!, TAG.main, s2.sim);
  const h = hits2.findLast((x) => x.node === h0.node)!;

  expect(h.x).toBe(Math.round((466 - h.w) / 2));
  expect(h.y).toBe(466 - h.h);
});

// Group frame byte 8 (low 2 bits) is the flex alignment of the AUTO-laid-out children, not a
// pixel gap — 0 = START, 2 = CENTER (see drawGroup's header). Community faces write 0 there and
// the watch left-aligns them (AEGIS_Ground_Force's 200px-wide label frames); every official
// corpus face writes 2 or 0x0a and centers. Drives the row off one fixture, both ways.
test("group frame byte 8 picks START vs CENTER for the auto row", async () => {
  const buf = await fetch(groupedUrl).then((r) => r.arrayBuffer());
  const face = parseBin(buf);

  for (const res of face.resources) res.bitmap = await bitmapOf(res);
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  const sim = { ...defaultSim(), live: false, time: new Date("2026-01-09T10:09:30").getTime() };
  const draw = () => render(c.getContext("2d")!, face, TAG.main, sim);

  // a rendered group with a rendered 0x8000 (AUTO) child and a frame wider than that row
  const target = (() => {
    for (const gh of draw().filter((h) => h.node.tag === TAG.group && h.w > 0)) {
      const fr = parseFrame(gh.node)!;
      // everything that packs into the row: 0x8000-marked children plus a NUMBER hugging
      // them at x=0 (its width is dynamic, so it can't carry the marker — see drawGroup)
      const kids = (gh.node.subs || []).filter((k) => {
        const st = k.subs?.find((s) => s.tag === TAG.struct);

        return st != null && (metaInfo(st).w === 0x8000 || (k.tag === TAG.number && !st.x));
      });
      const hits = draw().filter((h) => kids.includes(h.node));

      if (hits.length && fr.w > hits.reduce((s, h) => s + h.w, 0)) return { gh, fr, kids };
    }
  })()!;

  expect(target).toBeTruthy();
  const rowLeft = () =>
    Math.min(
      ...draw()
        .filter((h) => target.kids.includes(h.node))
        .map((h) => h.x),
    );
  const setMain = (main: number) => {
    const v = unhex(target.fr.node.hex!);

    v[8] = (v[8] & ~3) | main;
    target.fr.node.hex = hex(v);
  };

  setMain(2);
  const centered = rowLeft();

  setMain(0);
  expect(rowLeft()).toBe(target.fr.x);
  expect(centered).toBeGreaterThan(target.fr.x);
});

test("alignSelected aligns a group child within its parent frame", async () => {
  const buf = await fetch(groupedUrl).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "align-test-grouped" });
  });
  editorModel.simPatched({
    live: false,
    time: new Date("2026-01-09T10:09:30").getTime(),
  });
  const s = editorModel.$editor.getState();

  const c = document.createElement("canvas");

  c.width = c.height = 466;
  const hits = render(c.getContext("2d")!, s.face!, TAG.main, s.sim);
  // a rendered group with a fixed frame + a rendered non-AUTO, non-ring child of it
  const pair = (() => {
    for (const gh of hits.filter((h) => h.node.tag === TAG.group && h.w > 0)) {
      for (const ch of hits) {
        const st = ch.node.subs?.find((k) => k.tag === TAG.struct);

        if (
          gh.node.subs?.includes(ch.node) &&
          ch.node.tag !== TAG.group &&
          ch.node.tag !== 0x80 &&
          ch.node.tag !== 0x81 &&
          st?.x != null &&
          metaInfo(st).w !== 0x8000 &&
          ch.h > 0 &&
          ch.h < gh.h
        )
          return { gh, ch };
      }
    }
  })()!;

  expect(pair).toBeTruthy();

  editorModel.select(pair.ch.node);
  editorModel.alignSelected("bottom");

  const s2 = editorModel.$editor.getState();
  const hits2 = render(c.getContext("2d")!, s2.face!, TAG.main, s2.sim);
  const g = hits2.findLast((x) => x.node === pair.gh.node)!;
  const h = hits2.findLast((x) => x.node === pair.ch.node)!;

  expect(h.y).toBe(g.y + g.h - h.h);
});

// A group's frame x/y are int16, same as a struct's: nudging a group off the left edge used
// to write -3 and read it back as 65533, which parked the whole group off the right instead.
test("a frame keeps a negative x instead of wrapping to 65533", () => {
  const v = new Uint8Array(21);

  v[0] = -3;
  v[1] = -3 >> 8;
  v[2] = -7;
  v[3] = -7 >> 8;
  v[4] = 100; // w stays unsigned
  const fr = parseFrame({ tag: TAG.group, subs: [{ tag: TAG.frame, hex: hex(v) }] })!;

  expect([fr.x, fr.y, fr.w]).toEqual([-3, -7, 100]);
});
