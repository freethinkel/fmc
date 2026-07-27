// The editor page listens for drops on window, so every in-app drag (layer reorder, frame
// reorder) reaches that handler too. Only a drop carrying a file is an import — anything else
// must leave the open marketplace record attached, or the toolbar silently switches back to
// "Save as draft"/"Publish" for a watchface that is already published.
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import type { RecordModel } from "pocketbase";
import { EditorPage } from "$lib/modules/editor/pages";
import { marketModel } from "$lib/modules/market/model";

test("an in-app drop does not detach the open watchface record", async () => {
  const wf = { id: "wf1", owner: "u1", published: true } as unknown as RecordModel;

  marketModel.openedWfSet(wf);
  render(EditorPage);

  window.dispatchEvent(new DragEvent("drop", { bubbles: true })); // no dataTransfer files

  expect(marketModel.$openedWf.getState()).toBe(wf);
});
