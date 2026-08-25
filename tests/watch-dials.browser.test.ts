// The slot count is what decides whether a flash is an append, an overwrite, or the "watch is
// full" dialog — and the watch is no help: a055 leaves out every dial that was side-loaded, so
// after a reconnect a full watch reports room it doesn't have. mergeDials is what closes that
// gap; these check it does, and that a dial the watch turns out not to have stops counting.
import { beforeEach, expect, test } from "vitest";
import { Watch, WF_CAPACITY } from "$lib/modules/device/lib/ble";
import { dialLabel, rememberDial, unclaimDial } from "$lib/modules/device/lib/catalog-names";

const SERIAL = "TESTSERIAL01";
const OTHER = "TESTSERIAL02";

// mergeDials touches nothing but its own fields, so a bare Watch is a complete fixture — no
// GATT, no connection
const watchWith = (reported: number[], serial: string | null = SERIAL) => {
  const w = new Watch();

  w.reportedWf = reported;
  w.serial = serial;
  w.mergeDials();
  return w;
};

beforeEach(() => localStorage.removeItem("fmc_dial_names"));

test("a side-loaded dial keeps its slot counted across a reconnect", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  // fresh connection: a055 lists the five gallery dials and says nothing about ours
  const w = watchWith([1, 2, 3, 4, 5]);

  expect(w.installedWf).toEqual([1, 2, 3, 4, 5, 4242]);
  expect(w.installedWf.length).toBe(WF_CAPACITY); // full — the flash must ask for a slot
});

test("dials flashed onto a different watch don't count", () => {
  rememberDial(4242, "mine", undefined, OTHER);
  expect(watchWith([1, 2, 3, 4, 5]).installedWf).toEqual([1, 2, 3, 4, 5]);
});

test("a dial the watch already reports isn't counted twice", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  expect(watchWith([1, 4242]).installedWf).toEqual([1, 4242]);
});

test("without a serial only what the watch reported counts", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  expect(watchWith([1, 2], null).installedWf).toEqual([1, 2]);
});

test("unclaiming a dial the watch doesn't have frees its slot but keeps its name", () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  const w = watchWith([1, 2, 3, 4, 5]);

  unclaimDial(4242); // what the stale-old_wf_id retry, and a successful overwrite, do
  w.mergeDials();
  expect(w.installedWf).toEqual([1, 2, 3, 4, 5]);
  // the watch may still have it — 0a doesn't say why — so the label has to survive the guess
  expect(dialLabel(4242, 0)).toBe("mine");
});
