// sourceIdSet: picking a value-indexed source (AM/PM 2, weekday 7, month 12) resizes the
// widget's frame run to the length that source needs, and the frames a shrink drops stay
// recoverable until the selection moves to another layer.
import { test, expect } from "vitest";
import { TAG, parseBin } from "$lib/modules/editor/lib/wf";
import { structOf } from "$lib/modules/editor/lib/tree";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const AMPM = 0x13,
  WEEKDAY = 0x18,
  MONTH = 0x15;

// the effect encodes placeholder frames, so the store lands a tick or two later
async function setSource(node: unknown, id: number, want: number) {
  editorModel.sourceIdSet({ node, id } as never);
  for (let i = 0; i < 50 && structOf(node as never)?.images?.length !== want; i++)
    await new Promise((r) => setTimeout(r, 5));
  return structOf(node as never)!.images!;
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
  const scr = editorModel.$editor.getState().face!.screens[0];
  const widget = scr.subs!.find((n) => n.tag !== TAG.hand && structOf(n)?.images?.length)!;

  editorModel.select(widget);

  const week = await setSource(widget, WEEKDAY, 7);

  expect(week).toHaveLength(7);

  // growing needs a fresh consecutive run (base + count is all the format stores)
  const month = [...(await setSource(widget, MONTH, 12))];

  expect(month).toHaveLength(12);
  expect(month.every((ri, i) => i === 0 || ri === month[i - 1] + 1)).toBe(true);
  // the frames it already had are carried over, only the tail is new
  expect(month.slice(0, 7)).not.toEqual(month.slice(5));

  // shrink, then come straight back — same art, not 12 blank slots
  expect(await setSource(widget, AMPM, 2)).toEqual(month.slice(0, 2));
  expect(await setSource(widget, MONTH, 12)).toEqual(month);

  // ...but leaving the layer between the shrink and the re-grow makes the trim permanent:
  // the 5 dropped frames are no longer remembered, so coming back allocates blank ones
  await setSource(widget, WEEKDAY, 7);
  editorModel.select(scr.subs!.find((n) => n !== widget)!);
  editorModel.select(widget);
  const regrown = await setSource(widget, MONTH, 12);

  expect(regrown).toHaveLength(12);
  expect(regrown.slice(0, 7)).not.toEqual(month.slice(0, 7)); // reallocated from the 7 it had

  // whatever the shuffling, the file still builds: the run stayed consecutive
  const out = await editorModel.buildCurrentBin();

  expect(structOf(parseBin(out).screens[0].subs![scr.subs!.indexOf(widget)])!.images).toHaveLength(
    12,
  );
});
