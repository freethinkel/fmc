// The layer types the editor can create without a file (group, procedural ring) and the tree
// surgery around them: reparenting into/out of a group, group/ungroup. Checked against the
// rendered position, not raw x/y — a reparent must not move the pixels.
import { test, expect } from "vitest";
import { TAG, parseBin, unhex } from "$lib/modules/editor/lib/wf";
import { render } from "$lib/modules/editor/lib/render";
import { parseArcSpec } from "$lib/modules/editor/lib/arc";
import { nodeOrigin, shiftNode, structOf, SLOT_METRICS } from "$lib/modules/editor/lib/tree";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

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

/** Rendered bbox of a node on the current screen. */
function boxOf(node: unknown) {
  const s = editorModel.$editor.getState();
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  const hits = render(c.getContext("2d")!, s.face!, s.screenTag, s.sim);

  return hits.findLast((h) => h.node === node) ?? null;
}

test("a group and a procedural ring can be created and survive a build/parse round trip", async () => {
  await load("new-nodes");
  editorModel.addNode("ring");
  const ring = editorModel.$editor.getState().sel!;

  expect(ring.tag).toBe(0x81);
  // no bitmap: everything the renderer needs comes out of the 0x5a spec
  expect(parseArcSpec(ring)).toMatchObject({ min: 0, max: 100, width: 10, radius: 100 });
  expect(boxOf(ring)).toMatchObject({ w: 200, h: 200 });

  editorModel.addNode("group");
  const group = editorModel.$editor.getState().sel!;

  expect(group.tag).toBe(TAG.group);

  const out = await editorModel.buildCurrentBin();
  const tags = parseBin(out).screens[0].subs!.map((n) => n.tag);

  expect(tags).toContain(0x81);
  expect(tags).toContain(TAG.group);
});

test("a widget slot is created with one icon per metric and a numbered 0x5f", async () => {
  await load("slots");
  const scr = editorModel.$editor.getState().face!.screens[0];

  editorModel.addSlotRequested();
  for (let i = 0; i < 50 && editorModel.$editor.getState().sel?.tag !== 0x85; i++)
    await new Promise((r) => setTimeout(r, 5));
  const slot = editorModel.$editor.getState().sel!;
  const spec = unhex(slot.subs!.find((n) => n.tag === 0x5f)!.hex!);
  const ids = [...spec.subarray(3, 3 + spec[1])];

  expect(spec).toHaveLength(33); // fixed width across the corpus
  expect(spec[0]).toBe(0); // first slot on this screen
  expect(ids).toEqual(SLOT_METRICS);
  // imgs[0] is the on-watch placeholder, imgs[1..] the companion-app picker icons
  expect(structOf(slot)!.images).toHaveLength(SLOT_METRICS.length + 1);

  editorModel.addSlotRequested();
  for (let i = 0; i < 50 && editorModel.$editor.getState().sel === slot; i++)
    await new Promise((r) => setTimeout(r, 5));
  const second = editorModel.$editor.getState().sel!;

  expect(unhex(second.subs!.find((n) => n.tag === 0x5f)!.hex!)[0]).toBe(1); // slotIndex advanced

  const out = await editorModel.buildCurrentBin();

  expect(parseBin(out).screens[0].subs!.filter((n) => n.tag === 0x85)).toHaveLength(2);
  expect(scr.subs!.filter((n) => n.tag === 0x85)).toHaveLength(2);
});

test("dropping a widget into a group keeps it where it was, and ungroup puts it back", async () => {
  await load("reparent");
  const scr = editorModel.$editor.getState().face!.screens[0];
  // a plain positioned widget, not a hand (its bbox rotates with the clock)
  const widget = scr.subs!.find(
    (n) => n.tag !== TAG.hand && n.subs?.some((k) => k.tag === TAG.struct && k.x),
  )!;
  const before = boxOf(widget)!;

  editorModel.addNode("group");
  const group = editorModel.$editor.getState().sel!;

  // a frame away from the origin, so the coordinate compensation actually has work to do
  shiftNode(group, 50, 30);
  expect(nodeOrigin(group)).toEqual({ x: 50, y: 30 });

  editorModel.moveNode(widget, group, false, true);
  expect(group.subs).toContain(widget);
  expect(boxOf(widget)).toMatchObject({ x: before.x, y: before.y });

  editorModel.select(group);
  editorModel.ungroupSelected();
  expect(scr.subs).toContain(widget);
  expect(boxOf(widget)).toMatchObject({ x: before.x, y: before.y });
});

test("groupSelected wraps in place and duplicate copies the whole subtree", async () => {
  await load("group-dup");
  const scr = editorModel.$editor.getState().face!.screens[0];
  const widget = scr.subs!.find(
    (n) => n.tag !== TAG.hand && n.subs?.some((k) => k.tag === TAG.struct && k.x),
  )!;
  const before = boxOf(widget)!;

  editorModel.select(widget);
  editorModel.groupSelected();
  const group = editorModel.$editor.getState().sel!;

  expect(group.tag).toBe(TAG.group);
  expect(group.subs).toContain(widget);
  expect(boxOf(widget)).toMatchObject({ x: before.x, y: before.y });

  const n = scr.subs!.length;

  editorModel.select(group);
  editorModel.duplicateSelected();
  expect(scr.subs!.length).toBe(n + 1);
  expect(editorModel.$editor.getState().sel).not.toBe(group);
});

test("a visibility condition can be added and removed from the selection", async () => {
  await load("cond");
  const scr = editorModel.$editor.getState().face!.screens[0];
  const widget = scr.subs!.find((n) => n.subs?.some((k) => k.tag === TAG.struct))!;

  editorModel.toggleCondition(widget);
  const bind = widget.subs!.find((n) => n.tag === TAG.bind)!;

  expect(bind).toBeTruthy();
  // starts always-true, so adding one must not hide the widget
  expect(boxOf(widget)).toBeTruthy();

  editorModel.toggleCondition(widget);
  expect(widget.subs!.some((n) => n.tag === TAG.bind)).toBe(false);
});
