// alignSelected: nudges the selected node so its rendered bbox lands on the screen
// edge/center — checked against a re-render, not raw x/y, since that's the model's contract.
import { test, expect } from "vitest";
import { TAG } from "../lib/wf";
import { render, metaInfo } from "../lib/render";
import { editorModel } from "../model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";
import groupedUrl from "./__fixtures__/Multifunction__368__Function.bin?url";

test("alignSelected lands the rendered bbox on center/bottom", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => { unwatch(); resolve(); });
    editorModel.loadRequested({ buf, label: "align-test" });
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
  const s = editorModel.$editor.getState();

  const c = document.createElement("canvas");
  c.width = c.height = 466;
  const hits = render(c.getContext("2d")!, s.face!, TAG.main, s.sim);
  // a plain widget (not group/hand) with its own struct x/y, smaller than the screen
  const h0 = hits.find(
    (h) =>
      h.w > 0 && h.w < 400 &&
      h.node.tag !== TAG.group && h.node.tag !== TAG.hand &&
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

test("alignSelected aligns a group child within its parent frame", async () => {
  const buf = await fetch(groupedUrl).then((r) => r.arrayBuffer());
  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => { unwatch(); resolve(); });
    editorModel.loadRequested({ buf, label: "align-test-grouped" });
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
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
          gh.node.subs?.includes(ch.node) && ch.node.tag !== TAG.group &&
          ch.node.tag !== 0x80 && ch.node.tag !== 0x81 &&
          st?.x != null && metaInfo(st).w !== 0x8000 && ch.h > 0 && ch.h < gh.h
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
