// Renaming has to land in every place the name is stored, and survive a build → parse round
// trip: the 16-byte header field (whose trailing byte carries something we don't understand
// and must be kept), the 0x86 node the watch's own list reads, and face.name.
import { test, expect } from "vitest";
import { editorModel } from "$lib/modules/editor/model";
import { parseBin, TAG, unhex } from "$lib/modules/editor/core/format";
import url from "./__fixtures__/Multifunction__366__Combo.bin?url";

test("renameFace updates the header, the 0x86 node and face.name", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "rename-test" });
  });

  const tailBefore = unhex(editorModel.$doc.getState()!.nameRaw)[15];

  editorModel.renameFace("Renamed dial that is well over fifteen characters");

  const built = parseBin(await editorModel.buildCurrentBin());

  // the header field is 15 bytes + NUL, so it holds a cut of the name — face.name keeps it whole
  expect(built.name).toBe("Renamed dial t");
  expect(unhex(built.nameRaw!)[15]).toBe(tailBefore);
  expect(editorModel.$doc.getState()!.name).toBe(
    "Renamed dial that is well over fifteen characters",
  );

  const main = built.screens.find((s) => s.tag === TAG.main)!;

  expect(main.subs!.find((s) => s.tag === TAG.name)?.text).toBe(
    "Renamed dial that is well over fifteen characters",
  );
});
