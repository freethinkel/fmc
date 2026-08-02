// Clearing a frame: the asset keeps its id and size but its pixels go fully transparent —
// a blank slot in a value-indexed set is how blinking widgets are made.
import { test, expect, vi } from "vitest";
import { decodePixels } from "$lib/modules/editor/core/format";
import { framesOf, type Layer } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const doc = () => editorModel.$doc.getState()!;

test("clearing a frame keeps its slot and size, pixels go transparent", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "clear-test" });
  });

  const walk = (ls: readonly Layer[]): Layer | null => {
    for (const l of ls) {
      if (framesOf(l).length) return l;
      const kids = l.kind === "group" ? l.children : l.kind === "raw" ? (l.children ?? []) : [];
      const hit = walk(kids);

      if (hit) return hit;
    }
    return null;
  };
  const layer = walk(doc().screens[0].layers)!;
  const id = framesOf(layer)[0];
  const before = doc().images.get(id)!;

  editorModel.clearImageRequested({ id });
  await vi.waitFor(() => expect(doc().images.get(id)!.data).not.toBe(before.data));

  const after = doc().images.get(id)!;

  expect(after.w).toBe(before.w); // the cell survives — only the art is gone
  expect(after.h).toBe(before.h);
  expect(framesOf(walk(doc().screens[0].layers)!)[0]).toBe(id); // same slot, same id
  const px = decodePixels({ cf: after.cf, w: after.w, h: after.h, data: after.data })!;

  for (let i = 3; i < px.length; i += 4) expect(px[i]).toBe(0); // fully transparent

  // and it undoes like any other edit
  editorModel.undo();
  expect(doc().images.get(id)!.data).toBe(before.data);
});
