// The new document model is only safe to build on if it loses nothing. Every corpus fixture
// goes .bin -> legacy tree -> Doc -> legacy tree -> .bin, and the bytes have to match what the
// same file rebuilds to without the detour.
import { test, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { parseBin, buildBin, hex } from "../src/lib/modules/editor/lib/wf";
import { fromLegacy, toLegacy, framesOf, type Layer } from "../src/lib/modules/editor/lib/doc";

const FIXTURES = readdirSync("tests/__fixtures__").filter((f) => f.endsWith(".bin"));

test.each(FIXTURES)("%s survives Doc round trip byte for byte", (file) => {
  const original = parseBin(readFileSync(`tests/__fixtures__/${file}`));
  // baseline: what this face rebuilds to untouched — parse/build is already covered elsewhere,
  // so comparing against it isolates the Doc conversion
  const baseline = buildBin(original);
  const { doc } = fromLegacy(original);
  const viaDoc = buildBin(toLegacy(doc));

  expect(hex(viaDoc)).toBe(hex(baseline));
});

test.each(FIXTURES)("%s: the resource table is rebuilt, not carried over", (file) => {
  const original = parseBin(readFileSync(`tests/__fixtures__/${file}`));
  const { doc } = fromLegacy(original);
  // an asset nothing points at must not reach the file — GC falls out of the layout walk
  const orphan = { ...[...doc.images.values()][0], id: "orphan" as never };
  const withJunk = { ...doc, images: new Map([...doc.images, ["orphan" as never, orphan]]) };

  expect(toLegacy(withJunk).resources.length).toBe(toLegacy(doc).resources.length);
  expect(toLegacy(doc).resources.length).toBe(original.resources.length);
});

test.each(FIXTURES)("%s classifies every node, nothing lands in raw by accident", (file) => {
  const { doc } = fromLegacy(parseBin(readFileSync(`tests/__fixtures__/${file}`)));
  const counts: Record<string, number> = {};
  const rawTags = new Set<number>();
  const walk = (l: Layer) => {
    counts[l.kind] = (counts[l.kind] ?? 0) + 1;
    if (l.kind === "raw") rawTags.add(l.tag);
    if (l.kind === "group") l.children.forEach(walk);
    if (l.kind === "raw") l.children?.forEach(walk);
  };

  doc.screens.forEach((s) => s.layers.forEach(walk));

  // 0x28 (embedded preview) and its 0x08 child are the only things expected to stay raw —
  // anything else showing up here means a widget shape the converter doesn't understand
  expect([...rawTags].sort((a, b) => a - b)).toEqual([0x08, 0x28].filter((t) => rawTags.has(t)));
  expect(counts.image ?? 0).toBeGreaterThan(0);
});

test("every referenced frame resolves to an asset", () => {
  for (const file of FIXTURES) {
    const { doc } = fromLegacy(parseBin(readFileSync(`tests/__fixtures__/${file}`)));
    const walk = (l: Layer) => {
      for (const id of framesOf(l)) expect(doc.images.has(id), `${file}: ${id}`).toBe(true);
      if (l.kind === "group") l.children.forEach(walk);
      if (l.kind === "raw") l.children?.forEach(walk);
    };

    doc.screens.forEach((s) => s.layers.forEach(walk));
  }
});
