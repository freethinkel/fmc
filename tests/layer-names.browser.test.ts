// Layer names never reach the .bin — they are stored beside it, keyed by the marketplace record
// and by the layer's position in the tree. This pins the round trip, which is the whole feature:
// what saveNames writes, withNames has to put back on a document parsed from scratch.
// Browser test for localStorage alone.
import { test, expect } from "vitest";
import type { Resource } from "../src/lib/modules/editor/core/format";
import { patchLayer } from "../src/lib/modules/editor/core/document/edits";
import { blankDoc } from "../src/lib/modules/editor/core/document/factory";
import { saveNames, withNames } from "../src/lib/modules/editor/core/document/names";

const res = (w: number, h: number): Resource => ({ cf: 4, w, h, data: new Uint8Array(w * h * 2) });
const fresh = () => blankDoc("Fresh", res(2, 2), res(466, 466));

test("names come back on a document reparsed from the same record", () => {
  const doc = fresh();
  const bg = doc.screens[0].layers.at(-1)!;
  const named = patchLayer(doc, bg.id, { name: "Фон" });

  saveNames("rec1", named);
  // fresh() mints new NodeIds, exactly like reopening the file does
  const back = withNames(fresh(), "rec1");

  expect(back.screens[0].layers.at(-1)!.name).toBe("Фон");
  // another record's names are none of this face's business
  expect(withNames(fresh(), "otherRecord").screens[0].layers.some((l) => l.name)).toBe(false);
});

test("clearing the last name drops the record's entry", () => {
  const doc = fresh();
  const bg = doc.screens[0].layers.at(-1)!;

  saveNames("rec2", patchLayer(doc, bg.id, { name: "Фон" }));
  saveNames("rec2", patchLayer(doc, bg.id, { name: undefined }));
  expect(withNames(fresh(), "rec2").screens[0].layers.at(-1)!.name).toBeUndefined();
  expect(localStorage.getItem("fmc_layer_names")).not.toContain("rec2");
});
