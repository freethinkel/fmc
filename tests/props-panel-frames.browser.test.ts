// Frame reorder in the props panel: a multi-frame widget is indexed by value, so the order of its
// frames is data (weekday sets imported Monday-first used to render a day off on the watch).
// Guards the drag wiring and the labels that make a wrong order visible.
import { afterEach, test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import PropsPanel from "$lib/modules/editor/components/PropsPanel.svelte";
import { editorModel } from "$lib/modules/editor/model";
import { findLayer } from "$lib/modules/editor/core/document/edits";
import { framesOf, type Layer } from "$lib/modules/editor/core/document/doc";
import { along, centre, touch, touchScreen } from "./touch";
import url from "./__fixtures__/Multifunction__366__Combo.bin?url";

// opens the face afresh and selects its weekday widget (source id 0x18): 7 sprites, Sun..Sat
async function weekday() {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "frames-test" });
  });

  let wd: Layer | null = null;
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      if (
        l.kind !== "group" &&
        l.kind !== "raw" &&
        l.meta.source === 0x18 &&
        framesOf(l).length === 7
      )
        wd = l;
      if (l.kind === "group") walk(l.children);
      if (l.kind === "raw" && l.children) walk(l.children);
    }
  };

  editorModel.$doc.getState()!.screens.forEach((s) => walk(s.layers));
  expect(wd).not.toBeNull();
  const id = wd!.id;

  editorModel.select(id);
  render(PropsPanel);

  const frames = () => framesOf(findLayer(editorModel.$doc.getState()!, id)!);

  return { frames, rows: [...document.querySelectorAll<HTMLElement>(".frame-row")] };
}

afterEach(() => touchScreen(false));

test("dragging a frame row reorders the widget's frames", async () => {
  const { frames, rows } = await weekday();
  const before = [...frames()];

  expect(rows.length).toBe(7);
  // the inspector sections are separate components, so the shared field chrome only reaches them
  // through PropsPanel's `:global` block — a plain scoped rule would silently drop it
  const label = document.querySelector(".muted-label")!;

  expect(getComputedStyle(label).display).toBe("block");
  expect([...document.querySelectorAll(".frame-row .thumb-cap")].map((e) => e.textContent)).toEqual(
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  );

  await userEvent.dragAndDrop(rows[0], rows[2]);

  // A Doc layer holds a plain list of asset ids, so the reorder happens right there — unlike the
  // old tree, where the ids had to stay a consecutive run and the resources moved instead.
  expect(frames()).toEqual([before[1], before[2], before[0], ...before.slice(3)]);

  // ...and the result must still build: buildCurrentBin re-encodes and self-checks the whole file,
  // so a throw here surfaces as a Save button that fires no request at all
  expect((await editorModel.buildCurrentBin()).length).toBeGreaterThan(0);
});

test("a touch drag from a frame's grip reorders the frames too", async () => {
  await touchScreen(true);
  const { frames, rows } = await weekday();
  const before = [...frames()];

  // centre() throws unless the grip is really there to put a finger on
  await touch("touchStart", [{ id: 1, ...centre(rows[0].querySelector(".grip")!) }]);
  await touch("touchMove", [{ id: 1, ...along(rows[2], 0.5) }]);
  expect(rows[2].querySelector(".drop-line")).not.toBeNull();
  await touch("touchEnd");

  expect(frames()).toEqual([before[1], before[2], before[0], ...before.slice(3)]);
  expect(document.querySelector(".drop-line, .dragging")).toBeNull();
});
