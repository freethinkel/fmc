// The analytics model reads the app's existing event graph rather than being called from it, so
// nothing in the feature models fails when a name or a payload here drifts. This test is what
// notices: it drives the same events the app fires and asserts on what reaches the tracker.
import { test, expect, beforeEach } from "vitest";
import type { Doc } from "$lib/modules/editor/core/document/doc";
import { authModel } from "$lib/modules/auth/model";
import { bleModel } from "$lib/modules/device/model";
import { editorModel } from "$lib/modules/editor/model";
import "$lib/modules/analytics/model";

const doc = {} as Doc; // the payload the model never looks at
let sent: [string, unknown][] = [];

beforeEach(() => {
  sent = [];
  // stand in for the tracker script, which a test build never loads
  (window as { umami?: { track: (n: string, p?: unknown) => void } }).umami = {
    track: (name, props) => sent.push([name, props]),
  };
  editorModel.faceKeySet(null);
});

test("a marketplace open is editor_open{market}, not an import", () => {
  editorModel.faceKeySet("wf1");
  editorModel.loadDone({ doc, label: "Nothing Dots" }); // label is the face's own name

  expect(sent).toEqual([["editor_open", { source: "market" }]]);
});

test("a dropped file keeps its name out of the payload", () => {
  editorModel.loadDone({ doc, label: "my holiday photos.bin" });

  expect(sent).toEqual([["editor_open", { source: "file" }]]);
});

test("an import reports both the open and the format", () => {
  editorModel.loadDone({ doc, label: "facer" });

  expect(sent).toEqual([
    ["editor_open", { source: "facer" }],
    ["import", { format: "facer" }],
  ]);
});

test("a blank face is neither a file nor an import", () => {
  editorModel.loadDone({ doc, label: "new" });

  expect(sent).toEqual([["editor_open", { source: "new" }]]);
});

test("a successful flash is the conversion event", () => {
  bleModel.flashDone();

  expect(sent).toEqual([["watch_upload", undefined]]);
});

test("a registration is a signup", () => {
  authModel.registered();

  expect(sent).toEqual([["signup", undefined]]);
});
