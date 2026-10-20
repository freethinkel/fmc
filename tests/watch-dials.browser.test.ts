// The slot count is what decides whether a flash is an append, an overwrite, or the "watch is
// full" dialog — and the watch is no help: a055 leaves out every dial that was side-loaded, so
// after a reconnect a full watch reports room it doesn't have. mergeDials is what closes that
// gap; these check it does, and that a dial the watch turns out not to have stops counting.
import { beforeEach, expect, test } from "vitest";
import { NoFreeSlotError, Watch, WF_CAPACITY } from "$lib/modules/device/lib/ble";
import { CMD, dialId } from "$lib/modules/device/lib/ble-protocol";
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

// A watch that takes every handshake and then answers each finished transfer with 0a — the
// only part of uploadWatchface that decides between the slot dialog and a dead-end error.
const refusingWatch = (reported: number[]) => {
  const w = watchWith(reported);

  w.waitFor = async () => new Uint8Array([1]);
  w.sendData = async (cmd) => {
    if (cmd === CMD.wfInit2Req)
      setTimeout(() => w.handlers.get(CMD.wfFinishAck1)?.(new Uint8Array([0x0a])));
  };
  return w;
};
// smallest file the upload's own sanity checks let through: magic at 4, name "T" at 8, and the
// header repeated as the trailer
const hdr = new Uint8Array(36);

hdr.set([1, 0, 0, 0, 84], 4);
const BIN = new Uint8Array([...hdr, ...hdr]);

test("re-flashing a dial gone from a full watch opens the slot dialog (#62)", async () => {
  // claimed here, gone from the watch since; a055 leaves out side-loaded dials, so one put
  // there from another browser or phone goes uncounted and the watch is fuller than it looks
  rememberDial(dialId("rec1"), "DosWatch", undefined, SERIAL);
  const w = refusingWatch([1, 2, 3, 4]);

  await expect(w.uploadWatchface(BIN, undefined, "rec1")).rejects.toBeInstanceOf(NoFreeSlotError);
});

test("0a again after the user picked a slot is an error, not the dialog again", async () => {
  rememberDial(4242, "mine", undefined, SERIAL);
  const w = refusingWatch([1, 2, 3, 4, 5]);
  const err = await w.uploadWatchface(BIN, 4242, "rec1").catch((e: Error) => e);

  expect(err).not.toBeInstanceOf(NoFreeSlotError);
  expect(err).toBeInstanceOf(Error);
});

test("a refused replace of a dial the watch listed keeps it and costs one transfer (#62)", async () => {
  const w = refusingWatch([273, 274, 275, 276, 277, 280]);
  let transfers = 0;
  const send = w.sendData;

  w.sendData = async (cmd, p) => {
    if (cmd === CMD.wfInit2Req) transfers++;
    return send(cmd, p);
  };
  // the watch says 0a to this target; the dial is still there and still another one's turn
  await expect(w.uploadWatchface(BIN, 276, "rec1")).rejects.toThrow(/pick a different dial/);
  expect(transfers).toBe(1);
  expect(w.installedWf).toContain(276);
});
