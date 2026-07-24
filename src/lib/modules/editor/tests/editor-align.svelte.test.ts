// alignSelected: nudges the selected node so its rendered bbox lands on the screen
// edge/center — checked against a re-render, not raw x/y, since that's the model's contract.
import { test, expect } from "vitest";
import { TAG } from "../lib/wf";
import { render } from "../lib/render";
import { editorModel } from "../model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

test("alignSelected lands the rendered bbox on center/bottom", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());
  await editorModel.loadBufferFx({ buf, label: "align-test" });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
  const s = editorModel.editor.getState();

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

  const s2 = editorModel.editor.getState();
  const hits2 = render(c.getContext("2d")!, s2.face!, TAG.main, s2.sim);
  const h = hits2.findLast((x) => x.node === h0.node)!;
  expect(h.x).toBe(Math.round((466 - h.w) / 2));
  expect(h.y).toBe(466 - h.h);
});
