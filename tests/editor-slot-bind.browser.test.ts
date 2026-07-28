// setSlotBind: a layer says which widget-slot metric it stands for. The format stores the link
// on the layer (a condition on the synthetic id 0x79 + slotIndex), not on the slot — so this is
// checked against what the renderer actually draws, not against the hex.
import { test, expect } from "vitest";
import { TAG, parseBin, type FaceNode } from "$lib/modules/editor/lib/wf";
import { render } from "$lib/modules/editor/lib/render";
import { collectSlots, parseBind, SLOT_SEL_ID } from "$lib/modules/editor/lib/sources";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const drawn = (node: FaceNode) => {
  const s = editorModel.$editor.getState();
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  return render(c.getContext("2d")!, s.face!, s.screenTag, s.sim).some((h) => h.node === node);
};

test("a layer binds to one slot metric and only draws while that metric is selected", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "slot-bind" });
  });

  editorModel.addSlotRequested();
  for (let i = 0; i < 50 && editorModel.$editor.getState().sel?.tag !== 0x85; i++)
    await new Promise((r) => setTimeout(r, 5));

  const face = editorModel.$editor.getState().face!;
  const scr = face.screens[0];
  const slot = collectSlots([scr])[0];
  const layer = scr.subs!.find((n) => n.tag !== 0x85 && n.subs?.some((k) => k.tag === TAG.struct))!;

  expect(slot.activeIdx).toBe(0);
  expect(drawn(layer)).toBe(true); // unbound: always visible

  // stand for the slot's SECOND metric — the slot is on its first, so the layer must vanish
  editorModel.setSlotBind(layer, slot.index, 1);
  const entry = parseBind(layer.subs!.find((n) => n.tag === TAG.bind)!.hex)[0];

  expect(entry).toMatchObject({ id: SLOT_SEL_ID + slot.index, val: 1 });
  expect(drawn(layer)).toBe(false);

  // ...and stand for the selected metric instead: back on screen
  editorModel.setSlotBind(layer, slot.index, 0);
  expect(drawn(layer)).toBe(true);

  // unbinding drops the whole condition node again, not just the entry
  editorModel.setSlotBind(layer, null);
  expect(layer.subs!.some((n) => n.tag === TAG.bind)).toBe(false);
  expect(drawn(layer)).toBe(true);

  // a real metric condition on the same layer must survive the slot binding being rewritten
  editorModel.toggleCondition(layer); // always-true steps >= 0
  editorModel.setSlotBind(layer, slot.index, 0);
  const ids = parseBind(layer.subs!.find((n) => n.tag === TAG.bind)!.hex).map((e) => e.id);

  expect(ids).toEqual([0x19, SLOT_SEL_ID + slot.index]);
  expect(drawn(layer)).toBe(true);

  const out = await editorModel.buildCurrentBin();

  expect(parseBin(out).screens[0].subs!.some((n) => n.subs?.some((k) => k.tag === TAG.bind))).toBe(
    true,
  );
});
