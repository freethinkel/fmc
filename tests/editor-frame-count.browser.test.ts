// sourceIdSet: picking a value-indexed source (AM/PM 2, weekday 7, month 12) resizes the widget's
// frame run to the length that source needs, and the frames a shrink drops stay recoverable until
// the selection moves to another layer.
import { test, expect } from "vitest";
import { parseBin } from "$lib/modules/editor/core/format";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import { framesOf, type NodeId } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const AMPM = 0x13,
  WEEKDAY = 0x18,
  MONTH = 0x15;

const doc = () => editorModel.$doc.getState()!;
const layers = () => doc().screens[0].layers;
const framesOfId = (id: NodeId) => framesOf(findLayer(doc(), id)!);

// the effect encodes placeholder frames, so the store lands a tick or two later
async function setSource(id: NodeId, source: number, want: number) {
  editorModel.sourceIdSet({ id, source });
  for (let i = 0; i < 100 && framesOfId(id).length !== want; i++)
    await new Promise((r) => setTimeout(r, 5));
  return [...framesOfId(id)];
}

test("frame count follows the source, and a trim is undone by switching back", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "frames" });
  });
  const widget = layers().find((l) => l.kind !== "hand" && framesOf(l).length)!;
  const id = widget.id;

  editorModel.select(id);

  expect(await setSource(id, WEEKDAY, 7)).toHaveLength(7);

  const month = await setSource(id, MONTH, 12);

  expect(month).toHaveLength(12);
  // the frames it already had are carried over, only the tail is new
  expect(month.slice(0, 7)).not.toEqual(month.slice(5));

  // shrink, then come straight back — same art, not 12 blank slots
  expect(await setSource(id, AMPM, 2)).toEqual(month.slice(0, 2));
  expect(await setSource(id, MONTH, 12)).toEqual(month);

  // ...but leaving the layer between the shrink and the re-grow makes the trim permanent: the 5
  // dropped frames are no longer remembered, so coming back allocates blank ones
  await setSource(id, WEEKDAY, 7);
  editorModel.select(layers().find((l) => l.id !== id)!.id);
  editorModel.select(id);
  const regrown = await setSource(id, MONTH, 12);

  expect(regrown).toHaveLength(12);
  expect(regrown.slice(7)).not.toEqual(month.slice(7)); // the tail was reallocated

  // A Doc layer holds a plain list of asset ids, but the FILE stores a frame run as a base
  // offset + count — so whatever the shuffling, the run toLegacy lays out has to come out
  // consecutive, or buildBin's refTailBytes would reject it.
  const built = parseBin(await editorModel.buildCurrentBin());
  const rebuilt = built.screens[0]
    .subs!.map((n) => n.subs?.find((k) => k.images?.length === 12)?.images)
    .find(Boolean)!;

  expect(rebuilt).toHaveLength(12);
  expect(rebuilt.every((ri, i) => i === 0 || ri === rebuilt[i - 1] + 1)).toBe(true);
});
