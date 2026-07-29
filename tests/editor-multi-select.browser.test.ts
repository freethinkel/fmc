// Multi-selection: `sel` stays the primary node, `more` carries the rest, and the layer
// actions (group, delete) operate on the whole set — grouping several must not move any of them.
import { test, expect } from "vitest";
import { TAG } from "$lib/modules/editor/lib/wf";
import { render } from "$lib/modules/editor/lib/render";
import { editorModel } from "$lib/modules/editor/model";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const state = () => editorModel.$editor.getState();

const load = async (label: string) => {
  const buf = await fetch(url).then((r) => r.arrayBuffer());

  await new Promise<void>((resolve) => {
    const unwatch = editorModel.loadDone.watch(() => {
      unwatch();
      resolve();
    });

    editorModel.loadRequested({ buf, label });
  });
  editorModel.simPatched({ live: false, time: new Date("2026-01-09T10:09:30").getTime() });
};

function boxOf(node: unknown) {
  const s = state();
  const c = document.createElement("canvas");

  c.width = c.height = 466;
  const hits = render(c.getContext("2d")!, s.face!, s.screenTag, s.sim);

  return hits.findLast((h) => h.node === node) ?? null;
}

/** Two positioned widgets off the current screen (the sim clock is frozen, so even a hand's
 *  rotated bbox stays put between measurements). */
const twoWidgets = () =>
  state()
    .face!.screens[0].subs!.filter((n) => n.subs?.some((k) => k.tag === TAG.struct && k.x))
    .slice(0, 2);

test("a modifier click adds to the selection and clicking it again removes it", async () => {
  await load("multi-toggle");
  const [a, b] = twoWidgets();

  editorModel.select(a);
  editorModel.selectToggled(b);
  expect(editorModel.selectedNodes(state())).toEqual([b, a]); // last picked is the primary
  expect(state().sel).toBe(b);

  editorModel.selectToggled(b);
  expect(editorModel.selectedNodes(state())).toEqual([a]);

  editorModel.select(a); // a plain click drops the extras
  editorModel.selectToggled(b);
  editorModel.select(a);
  expect(state().more).toEqual([]);
});

test("group and delete act on the whole selection", async () => {
  await load("multi-actions");
  const scr = state().face!.screens[0];
  const [a, b] = twoWidgets();
  const before = [boxOf(a)!, boxOf(b)!];

  editorModel.select(a);
  editorModel.selectToggled(b);
  editorModel.groupSelected();
  const group = state().sel!;

  expect(group.tag).toBe(TAG.group);
  expect(state().more).toEqual([]);
  // both moved in, in their original draw order, and neither moved on screen
  expect(group.subs!.filter((n) => n.tag !== TAG.frame)).toEqual([a, b]);
  expect(scr.subs).not.toContain(a);
  expect(boxOf(a)).toMatchObject({ x: before[0].x, y: before[0].y });
  expect(boxOf(b)).toMatchObject({ x: before[1].x, y: before[1].y });

  editorModel.select(group);
  editorModel.ungroupSelected();
  const [c, d] = twoWidgets();
  const n = scr.subs!.length;

  editorModel.select(c);
  editorModel.selectToggled(d);
  editorModel.deleteWidget();
  expect(scr.subs!.length).toBe(n - 2);
  expect(state().sel).toBe(null);
});
