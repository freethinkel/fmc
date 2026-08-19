// The layer types the editor can create without a file (group, procedural ring) and the tree
// surgery around them: reparenting into/out of a group, group/ungroup. Checked against the
// rendered position, not raw x/y — a reparent must not move the pixels.
import { test, expect } from "vitest";
import { TAG, parseBin, unhex } from "$lib/modules/editor/core/format";
import { renderDoc } from "$lib/modules/editor/core/render/render";
import { findLayer, originOf } from "$lib/modules/editor/core/document/edits";
import { SLOT_METRICS } from "$lib/modules/editor/core/document/factory";
import {
  framesOf,
  isPlaced,
  type GroupLayer,
  type Layer,
  type NodeId,
  type SlotLayer,
} from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import { SCREEN } from "$lib/modules/editor/core/render/screen";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;
const layers = () => doc().screens[0].layers;
const selId = () => editorModel.$sel.getState()!;
const selLayer = () => findLayer(doc(), selId());
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
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
};

/** Rendered bbox of a layer on the current screen. */
function boxOf(id: NodeId) {
  const c = document.createElement("canvas");

  c.width = c.height = SCREEN;
  const hits = renderDoc(
    c.getContext("2d")!,
    doc(),
    editorModel.$store.getState(),
    editorModel.$screen.getState(),
    editorModel.$sim.getState(),
  );

  return hits.findLast((h) => h.layer.id === id) ?? null;
}

/** A plain positioned widget, not a hand — a hand's bbox rotates with the clock. */
const plainWidget = (): Layer => layers().find((l) => l.kind !== "hand" && isPlaced(l) && l.x)!;

/** Wait for an async action (slot creation, image decode) to land. */
async function until(cond: () => boolean) {
  for (let i = 0; i < 100 && !cond(); i++) await sleep(5);
  expect(cond()).toBe(true);
}

test("a group and a procedural ring can be created and survive a build/parse round trip", async () => {
  await load("new-nodes");
  editorModel.nodeAdded("ring");
  const ringId = selId();
  const ring = selLayer()!;

  expect(ring.kind).toBe("ring");
  // no bitmap: everything the renderer needs comes out of the arc spec
  expect(ring.kind === "ring" && ring.spec).toMatchObject({
    min: 0,
    max: 100,
    width: 10,
    radius: 100,
  });
  expect(boxOf(ringId)).toMatchObject({ w: 200, h: 200 });

  editorModel.nodeAdded("group");
  expect(selLayer()!.kind).toBe("group");

  const out = await editorModel.buildCurrentBin();
  const tags = parseBin(out).screens[0].subs!.map((n) => n.tag);

  expect(tags).toContain(0x81);
  expect(tags).toContain(TAG.group);
});

test("a widget slot is created with one icon per metric and a numbered 0x5f", async () => {
  await load("slots");

  editorModel.slotAdded();
  await until(() => selLayer()?.kind === "slot");
  const slot = selLayer() as SlotLayer;

  expect(slot.index).toBe(0); // first slot on this screen
  expect(slot.metrics).toEqual(SLOT_METRICS);
  // frames[0] is the on-watch placeholder, frames[1..] the companion-app picker icons
  expect(slot.frames).toHaveLength(SLOT_METRICS.length + 1);

  editorModel.slotAdded();
  await until(() => layers().filter((l) => l.kind === "slot").length === 2);
  const both = layers().filter((l): l is SlotLayer => l.kind === "slot");

  expect(both.map((l) => l.index)).toEqual([0, 1]); // slotIndex advanced

  const built = parseBin(await editorModel.buildCurrentBin());
  const written = built.screens[0].subs!.filter((n) => n.tag === 0x85);

  expect(written).toHaveLength(2);
  // the 0x5f body is a fixed width across the corpus
  expect(unhex(written[0].subs!.find((n) => n.tag === TAG.slot)!.hex!)).toHaveLength(33);
});

test("dropping a widget into a group keeps it where it was, and ungroup puts it back", async () => {
  await load("reparent");
  const widget = plainWidget();
  const before = boxOf(widget.id)!;

  editorModel.nodeAdded("group");
  const groupId = selId();

  // a frame away from the origin, so the coordinate compensation actually has work to do
  editorModel.layerPatched({
    id: groupId,
    patch: { frame: { ...(byId(groupId) as GroupLayer).frame, x: 50, y: 30 } } as Partial<Layer>,
  });
  expect(originOf(byId(groupId))).toEqual({ x: 50, y: 30 });

  editorModel.moveRequested({ id: widget.id, target: groupId, after: false, into: true });
  expect((byId(groupId) as GroupLayer).children.map((c) => c.id)).toContain(widget.id);
  expect(boxOf(widget.id)).toMatchObject({ x: before.x, y: before.y });

  editorModel.select(groupId);
  editorModel.ungroupRequested();
  expect(layers().map((l) => l.id)).toContain(widget.id);
  expect(boxOf(widget.id)).toMatchObject({ x: before.x, y: before.y });
});

test("group wraps in place and duplicate copies the whole subtree", async () => {
  await load("group-dup");
  const widget = plainWidget();
  const before = boxOf(widget.id)!;

  editorModel.select(widget.id);
  editorModel.groupRequested();
  const groupId = selId();

  expect(byId(groupId).kind).toBe("group");
  expect((byId(groupId) as GroupLayer).children.map((c) => c.id)).toContain(widget.id);
  expect(boxOf(widget.id)).toMatchObject({ x: before.x, y: before.y });

  const n = layers().length;

  editorModel.select(groupId);
  editorModel.duplicateRequested();
  expect(layers().length).toBe(n + 1);
  // the copy becomes the selection, and it is a different layer carrying the same subtree
  const copy = selLayer() as GroupLayer;

  expect(copy.id).not.toBe(groupId);
  expect(copy.children).toHaveLength((byId(groupId) as GroupLayer).children.length);
  // the copy shares the original's assets rather than cloning the pixels
  expect(framesOf(copy.children[0])).toEqual(framesOf((byId(groupId) as GroupLayer).children[0]));
});

test("visibility conditions stack up on the selection", async () => {
  await load("cond");
  const widget = plainWidget();

  editorModel.conditionAdded(widget.id);
  expect(byId(widget.id).conditions).toHaveLength(1);
  // starts always-true, so adding one must not hide the widget
  expect(boxOf(widget.id)).toBeTruthy();

  // a second one is appended, it does not replace or clear the first
  editorModel.conditionAdded(widget.id);
  expect(byId(widget.id).conditions).toHaveLength(2);
});
