// A new face starts with the main screen only, so the AOD tab has nothing to show until one is
// added. The added screen has to survive a build/parse round trip as a real 0x22 screen.
import { test, expect, vi } from "vitest";
import { parseBin, TAG } from "$lib/modules/editor/core/format";
import { framesOf } from "$lib/modules/editor/core/document/doc";
import { editorModel } from "$lib/modules/editor/model";

const doc = () => editorModel.$doc.getState()!;
const aod = () => doc().screens.find((s) => s.kind === "aod");

const newFace = async () => {
  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.newFaceRequested("Test");
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
};

test("a new face can be given an AOD screen, and it round trips", async () => {
  await newFace();
  expect(aod()).toBeUndefined();

  editorModel.aodAdded();
  await vi.waitFor(() => expect(aod()).toBeTruthy());

  // editing it is the point, so the editor switches to it
  expect(editorModel.$screen.getState()).toBe("aod");
  // the dial is copied wholesale (here: just its background), under the screen's own preview
  expect(aod()!.layers.map((l) => l.kind)).toEqual(["raw", "image"]);
  const mainBg = doc().screens.find((s) => s.kind === "main")!.layers[1];
  const aodBg = aod()!.layers[1];

  expect(aodBg.id).not.toBe(mainBg.id); // fresh ids, like any duplicate
  // copied assets, not shared ones — editing the AOD art must not touch the main screen's
  const [mf] = framesOf(mainBg);
  const [af] = framesOf(aodBg);

  expect(af).not.toBe(mf);
  expect(doc().images.get(af)!.data).toEqual(doc().images.get(mf)!.data);
  // its own preview asset, not the main screen's — regen would otherwise overwrite one with the other
  const previewOf = (kind: "main" | "aod") => {
    const pv = doc().screens.find((s) => s.kind === kind)!.layers[0];

    return pv.kind === "raw" ? pv.children![0] : null;
  };

  expect(previewOf("aod")).not.toEqual(previewOf("main"));

  const built = parseBin(await editorModel.buildCurrentBin());

  expect(built.screens.map((s) => s.tag)).toContain(TAG.aod);
  expect(built.screens.find((s) => s.tag === TAG.aod)!.subs!.length).toBeGreaterThan(0);
});

test("adding an AOD screen twice is a no-op", async () => {
  await newFace();
  editorModel.aodAdded();
  await vi.waitFor(() => expect(aod()).toBeTruthy());
  const first = aod()!.id;

  editorModel.aodAdded();
  await new Promise((r) => setTimeout(r, 50));

  expect(doc().screens.filter((s) => s.kind === "aod")).toHaveLength(1);
  expect(aod()!.id).toBe(first);
});

test("the AOD screen can be deleted again, and the face goes back to main-only", async () => {
  await newFace();
  editorModel.aodAdded();
  await vi.waitFor(() => expect(aod()).toBeTruthy());

  editorModel.aodRemoved();

  expect(aod()).toBeUndefined();
  expect(editorModel.$screen.getState()).toBe("main"); // nothing to show on the tab that just went
  expect(doc().screens).toHaveLength(1);

  const built = parseBin(await editorModel.buildCurrentBin());

  expect(built.screens.map((s) => s.tag)).not.toContain(TAG.aod);

  // and undo brings it back, like any other edit
  editorModel.undo();
  expect(aod()).toBeTruthy();
});

test("deleting the AOD screen when there is none does nothing", async () => {
  await newFace();
  const before = editorModel.$undoN.getState();

  editorModel.aodRemoved();

  expect(doc().screens).toHaveLength(1);
  expect(editorModel.$undoN.getState()).toBe(before); // no empty history entry
});
