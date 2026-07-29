// Tree edits over Doc. These are the operations the model currently performs by mutating the
// FaceNode tree; here they're pure, so the checks are about identity and structure surviving,
// which is exactly what breaks first when a tree is rebuilt instead of mutated.
import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseBin, buildBin } from "../src/lib/modules/editor/lib/wf";
import {
  fromLegacy,
  toLegacy,
  type Doc,
  type GroupLayer,
  type Layer,
} from "../src/lib/modules/editor/lib/doc";
import {
  addLayer,
  cloneLayer,
  contains,
  duplicateLayer,
  findLayer,
  moveLayer,
  parentOf,
  patchLayer,
  removeLayer,
  setSlotBinding,
  slotBindingOf,
  ungroup,
  usedAssets,
  wrapInGroup,
} from "../src/lib/modules/editor/lib/edits";

const load = (f = "Multifunction__368__Function"): Doc =>
  fromLegacy(parseBin(readFileSync(`tests/__fixtures__/${f}.bin`))).doc;

const flatten = (doc: Doc): Layer[] => {
  const out: Layer[] = [];
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      out.push(l);
      if (l.kind === "group") walk(l.children);
      if (l.kind === "raw" && l.children) walk(l.children);
    }
  };

  doc.screens.forEach((s) => walk(s.layers));
  return out;
};

const emptyGroup = (): GroupLayer => ({
  id: "g1" as never,
  tag: 0x68,
  kind: "group",
  conditions: [],
  frame: { x: 0, y: 0, w: 466, h: 466, main: 0, track: 0, rest: "" },
  children: [],
});

test("an edit leaves untouched layers identical, and the original document alone", () => {
  const doc = load();
  const before = flatten(doc);
  const target = before.find((l) => l.kind === "image")!;
  const next = patchLayer(doc, target.id, { hidden: true } as never);

  expect(doc).not.toBe(next);
  expect(findLayer(doc, target.id)!.hidden).toBeUndefined(); // original untouched
  expect(findLayer(next, target.id)!.hidden).toBe(true);
  // ids are stable across the rebuild — this is what `sel` depends on
  expect(flatten(next).map((l) => l.id)).toEqual(before.map((l) => l.id));
});

test("remove, add and duplicate", () => {
  const doc = load();
  const victim = flatten(doc).find((l) => l.kind === "hand")!;

  expect(findLayer(removeLayer(doc, victim.id), victim.id)).toBeNull();

  const added = addLayer(doc, "main", emptyGroup());

  expect(findLayer(added, "g1" as never)).not.toBeNull();

  const dup = duplicateLayer(doc, victim.id)!;

  expect(dup.copy.id).not.toBe(victim.id); // fresh id...
  expect(dup.copy.kind).toBe(victim.kind);
  // ...but the same assets: a duplicate shares pixels until someone says otherwise
  expect(usedAssets(dup.doc).size).toBe(usedAssets(doc).size);
  expect(flatten(dup.doc).length).toBe(flatten(doc).length + 1);
});

test("clone gives every nested layer a new id", () => {
  const doc = load();
  const group = flatten(doc).find(
    (l): l is GroupLayer => l.kind === "group" && l.children.length > 0,
  )!;
  const copy = cloneLayer(group) as GroupLayer;
  const ids = (l: Layer): string[] => [
    l.id,
    ...(l.kind === "group" ? l.children.flatMap(ids) : []),
  ];

  expect(new Set([...ids(group), ...ids(copy)]).size).toBe(ids(group).length * 2);
});

test("moving into a group, and back out again", () => {
  const doc = addLayer(load("Analog__287__Simple_Dial"), "main", emptyGroup());
  const widget = flatten(doc).find((l) => l.kind === "image")!;
  const g = "g1" as never;

  const inside = moveLayer(doc, widget.id, g, false, true);

  expect(parentOf(inside, widget.id)!.id).toBe(g);
  expect(flatten(inside).length).toBe(flatten(doc).length); // moved, not copied

  // a group can't be dropped into itself or its own child
  expect(moveLayer(inside, g, widget.id, false, true)).toBe(inside);

  const out = ungroup(inside, g);

  expect(parentOf(out, widget.id)).toBeNull();
  expect(findLayer(out, g)).toBeNull();
});

test("wrapInGroup keeps the layer, ungroup restores the shape", () => {
  const doc = load("Analog__287__Simple_Dial");
  const widget = flatten(doc).find((l) => l.kind === "hand")!;
  const wrapped = wrapInGroup(doc, widget.id, emptyGroup());

  expect(parentOf(wrapped, widget.id)!.id).toBe("g1");
  expect(contains(findLayer(wrapped, "g1" as never)!, widget.id)).toBe(true);

  const back = ungroup(wrapped, "g1" as never);

  expect(flatten(back).map((l) => l.id)).toEqual(flatten(doc).map((l) => l.id));
});

test("slot binding replaces only itself and survives a rebuild to bytes", () => {
  const doc = load();
  const layer = flatten(doc).find((l) => l.kind === "image" && l.conditions.length === 0)!;

  const bound = setSlotBinding(doc, layer.id, 1, 2);

  expect(slotBindingOf(findLayer(bound, layer.id)!)).toEqual({ slot: 1, metric: 2 });

  // rebinding must not stack up conditions
  const rebound = setSlotBinding(bound, layer.id, 0, 3);

  expect(findLayer(rebound, layer.id)!.conditions).toHaveLength(1);
  expect(slotBindingOf(findLayer(rebound, layer.id)!)).toEqual({ slot: 0, metric: 3 });

  expect(slotBindingOf(findLayer(setSlotBinding(rebound, layer.id, null), layer.id)!)).toBeNull();

  // and it reaches the file
  expect(() => buildBin(toLegacy(rebound))).not.toThrow();
});

test("a real metric condition survives slot rebinding", () => {
  const doc = load();
  const layer = flatten(doc).find((l) => l.kind === "image")!;
  const withMetric = patchLayer(doc, layer.id, {
    conditions: [{ source: 0x19, op: "gte", value: 0 }],
  } as never);
  const bound = setSlotBinding(withMetric, layer.id, 0, 1);

  expect(findLayer(bound, layer.id)!.conditions.map((c) => c.source)).toEqual([0x19, 0x79]);
});

test("dropping a layer drops its assets from the file, not from other users of them", () => {
  const doc = load();
  const slot = flatten(doc).find((l) => l.kind === "slot")!;
  const before = toLegacy(doc).resources.length;
  const after = toLegacy(removeLayer(doc, slot.id)).resources.length;

  // Function's two slots share one run, so removing one must not orphan it
  const slotsLeft = flatten(removeLayer(doc, slot.id)).filter((l) => l.kind === "slot").length;

  expect(slotsLeft).toBe(1);
  expect(after).toBe(before);
});
