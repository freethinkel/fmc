// slotBindSet: a layer says which widget-slot metric it stands for. The format stores the link on
// the layer (a condition on the synthetic id 0x79 + slotIndex), not on the slot — so this is
// checked against what the renderer actually draws, not against the stored bytes.
import { test, expect } from "vitest";
import { TAG, parseBin } from "$lib/modules/editor/core/format";
import { renderDoc } from "$lib/modules/editor/core/render/render";
import { collectSlotsDoc, SLOT_SEL_ID } from "$lib/modules/editor/core/document/sources";
import { findLayer, slotBindingOf } from "$lib/modules/editor/core/document/edits";
import { isPlaced, type NodeId } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import { SCREEN } from "$lib/modules/editor/core/render/screen";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const layers = () => doc().screens[0].layers;
const byId = (id: NodeId) => findLayer(doc(), id)!;

const drawn = (id: NodeId) => {
  const c = document.createElement("canvas");

  c.width = c.height = SCREEN;
  return renderDoc(
    c.getContext("2d")!,
    doc(),
    editorModel.$store.getState(),
    editorModel.$screen.getState(),
    editorModel.$sim.getState(),
  ).some((h) => h.layer.id === id);
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

  editorModel.slotAdded();
  for (let i = 0; i < 100 && !layers().some((l) => l.kind === "slot"); i++)
    await new Promise((r) => setTimeout(r, 5));

  const slot = collectSlotsDoc(layers())[0];
  const layer = layers().find((l) => l.kind !== "slot" && isPlaced(l))!;
  const id = layer.id;

  expect(slot.activeIdx).toBe(0);
  expect(drawn(id)).toBe(true); // unbound: always visible

  // stand for the slot's SECOND metric — the slot is on its first, so the layer must vanish
  editorModel.slotBindSet({ id, slot: slot.index, metric: 1 });
  expect(byId(id).conditions[0]).toMatchObject({ source: SLOT_SEL_ID + slot.index, value: 1 });
  expect(slotBindingOf(byId(id))).toEqual({ slot: slot.index, metric: 1 });
  expect(drawn(id)).toBe(false);

  // ...and stand for the selected metric instead: back on screen
  editorModel.slotBindSet({ id, slot: slot.index, metric: 0 });
  expect(drawn(id)).toBe(true);

  // unbinding drops the condition entirely
  editorModel.slotBindSet({ id, slot: null });
  expect(byId(id).conditions).toHaveLength(0);
  expect(drawn(id)).toBe(true);

  // a real metric condition on the same layer must survive the slot binding being rewritten
  editorModel.conditionToggled(id); // always-true steps >= 0
  editorModel.slotBindSet({ id, slot: slot.index, metric: 0 });
  expect(byId(id).conditions.map((c) => c.source)).toEqual([0x19, SLOT_SEL_ID + slot.index]);
  expect(drawn(id)).toBe(true);

  // and it reaches the file as a real condition node
  const out = await editorModel.buildCurrentBin();

  expect(parseBin(out).screens[0].subs!.some((n) => n.subs?.some((k) => k.tag === TAG.bind))).toBe(
    true,
  );
});
