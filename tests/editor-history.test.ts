// Undo/redo over the immutable document. The trap this pins down: the checkpoint has to snapshot
// the document as it was BEFORE the edit — snapshot the result and undo silently does nothing.
import { test, expect } from "vitest";
import { fork, allSettled } from "effector";
import * as doc from "../src/lib/modules/editor/model/doc.model";
import { newNodeId, type Doc, type Layer } from "../src/lib/modules/editor/core/document/doc";
import { newGroup } from "../src/lib/modules/editor/core/document/factory";
import { addLayer, findLayer } from "../src/lib/modules/editor/core/document/edits";

const blank = (): Doc => ({
  name: "t",
  nameRaw: "",
  screens: [{ id: newNodeId(), kind: "main", layers: [] }],
  images: new Map(),
});

const layerCount = (d: Doc | null) => d?.screens[0].layers.length ?? -1;

async function loaded() {
  const scope = fork();

  await allSettled(doc.docLoaded, { scope, params: { doc: blank(), label: "test" } });
  return scope;
}

test("a commit is undoable, and redoable again", async () => {
  const scope = await loaded();
  const group = newGroup();

  await allSettled(doc.committed, {
    scope,
    params: { edit: (d: Doc) => addLayer(d, "main", group) },
  });
  expect(layerCount(scope.getState(doc.$doc))).toBe(1);
  expect(scope.getState(doc.$undoN)).toBe(1);

  await allSettled(doc.undo, { scope });
  expect(layerCount(scope.getState(doc.$doc))).toBe(0);
  expect(scope.getState(doc.$undoN)).toBe(0);
  expect(scope.getState(doc.$redoN)).toBe(1);

  await allSettled(doc.redo, { scope });
  expect(layerCount(scope.getState(doc.$doc))).toBe(1);
  expect(findLayer(scope.getState(doc.$doc)!, group.id)).toBeTruthy();
});

test("undo walks back one entry per commit, not straight to the start", async () => {
  const scope = await loaded();

  for (let i = 0; i < 3; i++)
    await allSettled(doc.committed, {
      scope,
      params: { edit: (d: Doc) => addLayer(d, "main", newGroup()) },
    });
  expect(layerCount(scope.getState(doc.$doc))).toBe(3);

  await allSettled(doc.undo, { scope });
  expect(layerCount(scope.getState(doc.$doc))).toBe(2);
  await allSettled(doc.undo, { scope });
  expect(layerCount(scope.getState(doc.$doc))).toBe(1);
});

test("commits inside the coalesce window share one history entry", async () => {
  const scope = await loaded();

  // a slider drag: many commits, one undo step — the window is wide enough that none of them
  // can fall outside it while the test runs
  for (let i = 0; i < 5; i++)
    await allSettled(doc.committed, {
      scope,
      params: { edit: (d: Doc) => addLayer(d, "main", newGroup()), coalesce: 60_000 },
    });

  expect(layerCount(scope.getState(doc.$doc))).toBe(5);
  expect(scope.getState(doc.$undoN)).toBe(1);

  await allSettled(doc.undo, { scope });
  // back to before the whole drag
  expect(layerCount(scope.getState(doc.$doc))).toBe(0);
});

test("a fresh commit clears the redo stack", async () => {
  const scope = await loaded();

  await allSettled(doc.committed, {
    scope,
    params: { edit: (d: Doc) => addLayer(d, "main", newGroup()) },
  });
  await allSettled(doc.undo, { scope });
  expect(scope.getState(doc.$redoN)).toBe(1);

  await allSettled(doc.committed, {
    scope,
    params: { edit: (d: Doc) => addLayer(d, "main", newGroup()) },
  });
  expect(scope.getState(doc.$redoN)).toBe(0);
});

test("loading a document drops the history it had", async () => {
  const scope = await loaded();

  await allSettled(doc.committed, {
    scope,
    params: { edit: (d: Doc) => addLayer(d, "main", newGroup()) },
  });
  expect(scope.getState(doc.$undoN)).toBe(1);

  await allSettled(doc.docLoaded, { scope, params: { doc: blank(), label: "other" } });
  expect(scope.getState(doc.$undoN)).toBe(0);
  expect(scope.getState(doc.$fileLabel)).toBe("other");
  expect(scope.getState(doc.$dirty)).toBe(false);
});

test("patching a layer marks the document dirty", async () => {
  const scope = await loaded();
  const group = newGroup();

  await allSettled(doc.committed, {
    scope,
    params: { edit: (d: Doc) => addLayer(d, "main", group) },
  });
  await allSettled(doc.docLoaded, {
    scope,
    params: { doc: addLayer(blank(), "main", group), label: "clean" },
  });
  expect(scope.getState(doc.$dirty)).toBe(false);

  await allSettled(doc.layerPatched, {
    scope,
    params: { id: group.id, patch: { name: "renamed" } as Partial<Layer> },
  });
  expect(scope.getState(doc.$dirty)).toBe(true);
  expect(findLayer(scope.getState(doc.$doc)!, group.id)?.name).toBe("renamed");
});
