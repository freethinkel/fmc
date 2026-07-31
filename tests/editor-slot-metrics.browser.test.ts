// A slot's 0x5f list is the menu the companion app shows. Adding a metric needs an icon frame
// beside it; removing one takes that frame with it, and the file has to stay valid either way.
import { test, expect, vi } from "vitest";
import { TAG, parseBin, unhex } from "$lib/modules/editor/core/format";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import { SLOT_METRIC_CHOICES } from "$lib/modules/editor/core/document/factory";
import type { NodeId, SlotLayer } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";

const doc = () => editorModel.$doc.getState()!;
const slotById = (id: NodeId) => findLayer(doc(), id) as SlotLayer;

async function faceWithSlot(): Promise<SlotLayer> {
  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.newFaceRequested("Slots");
  });
  editorModel.slotAdded();
  await vi.waitFor(() => expect(editorModel.$sel.getState()).toBeTruthy());
  return slotById(editorModel.$sel.getState()!);
}

test("a metric can be added and removed, icon frame and all", async () => {
  const s = await faceWithSlot();
  const extra = SLOT_METRIC_CHOICES.find((m) => !s.metrics.includes(m))!;
  const before = { metrics: s.metrics.length, frames: s.frames.length };

  editorModel.slotMetricAdded({ id: s.id, metric: extra });
  await vi.waitFor(() => expect(slotById(s.id).metrics).toContain(extra));

  const added = slotById(s.id);

  expect(added.frames).toHaveLength(before.frames + 1); // its picker icon came with it
  expect(added.metrics).toHaveLength(before.metrics + 1);

  // the 0x5f body must agree: [index][count][active][ids…]
  const built = parseBin(await editorModel.buildCurrentBin());
  const body = unhex(
    built.screens[0].subs!.find((n) => n.tag === 0x85)!.subs!.find((n) => n.tag === TAG.slot)!.hex!,
  );

  expect(body[1]).toBe(added.metrics.length);
  expect([...body.subarray(3, 3 + body[1])]).toEqual([...added.metrics]);

  editorModel.slotMetricRemoved({ id: s.id, metric: extra });
  const back = slotById(s.id);

  expect(back.metrics).not.toContain(extra);
  expect(back.frames).toHaveLength(before.frames);
});

test("removing a metric keeps the icons lined up with the ones that stay", async () => {
  const s = await faceWithSlot();
  const [first, second] = s.metrics;
  const frameOfSecond = s.frames[2]; // frames[0] is the placeholder, so metric i is frames[i+1]

  editorModel.slotMetricRemoved({ id: s.id, metric: first });

  const after = slotById(s.id);

  expect(after.metrics[0]).toBe(second);
  expect(after.frames[1]).toBe(frameOfSecond); // the survivor kept its own icon
  expect(after.active).toBeLessThan(after.metrics.length);
});

test("the last metric can't be removed", async () => {
  const s = await faceWithSlot();

  for (const m of s.metrics) editorModel.slotMetricRemoved({ id: s.id, metric: m });

  expect(slotById(s.id).metrics).toHaveLength(1);
});
