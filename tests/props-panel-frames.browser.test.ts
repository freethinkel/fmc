// Frame reorder in the props panel: a multi-frame widget is indexed by value, so the order
// of `images` is data (weekday sets imported Monday-first used to render a day off on the
// watch). Guards the drag wiring and the labels that make a wrong order visible.
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import { userEvent } from "vitest/browser";
import PropsPanel from "$lib/modules/editor/components/PropsPanel.svelte";
import { editorModel } from "$lib/modules/editor/model";
import { TAG, unhex, type FaceNode } from "$lib/modules/editor/lib/wf";
import url from "./__fixtures__/Multifunction__366__Combo.bin?url";

test("dragging a frame row reorders the widget's images", async () => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label: "frames-test" });
  });

  // the weekday widget (source id 0x18): 7 sprites, Sun..Sat
  let wd: FaceNode | null = null;
  const walk = (n: FaceNode) => {
    const st = n.tag === TAG.struct ? n : n.subs?.find((s) => s.tag === TAG.struct);
    const m = st?.meta ? unhex(st.meta) : null;

    if (m && m.length >= 14 && m[9] === 0x18 && (st!.images?.length ?? 0) === 7) wd = n;
    n.subs?.forEach(walk);
  };

  editorModel.$editor.getState().face!.screens.forEach(walk);
  expect(wd).not.toBeNull();
  editorModel.select(wd);
  render(PropsPanel);

  const face = editorModel.$editor.getState().face!;
  const sel = editorModel.$editor.getState().sel!;
  const struct = sel.tag === TAG.struct ? sel : sel.subs!.find((s) => s.tag === TAG.struct)!;
  const indices = [...struct.images!];
  const before = indices.map((ri) => face.resources[ri]);
  const rows = document.querySelectorAll(".frame-row");

  expect(rows.length).toBe(7);
  // the inspector sections are separate components, so the shared field chrome only reaches
  // them through PropsPanel's `:global` block — a plain scoped rule would silently drop it
  const label = document.querySelector(".muted-label")!;

  expect(getComputedStyle(label).display).toBe("block");
  expect([...document.querySelectorAll(".frame-row .thumb-cap")].map((e) => e.textContent)).toEqual(
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  );

  await userEvent.dragAndDrop(rows[0] as HTMLElement, rows[2] as HTMLElement);

  // frames are a base offset + count in the file, so `images` stays the same consecutive run
  // and it's the resources behind it that move (see moveImage)
  expect(struct.images).toEqual(indices);
  expect(indices.map((ri) => face.resources[ri])).toEqual([
    before[1],
    before[2],
    before[0],
    ...before.slice(3),
  ]);

  // ...and the result must still build: buildCurrentBin re-encodes and self-checks the whole
  // file, so a throw here surfaces as a Save button that fires no request at all
  const bin = await editorModel.buildCurrentBin();

  expect(bin.length).toBeGreaterThan(0);
});
