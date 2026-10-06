// A flash cut off by the link dropping fails *after* the drop has already reset $bleInfo — this
// drives that order through the real ble.model and checks the failure still names the watch.
import { test, expect, vi } from "vitest";
import { bleModel } from "$lib/modules/device/model";
import "$lib/modules/analytics/model";

vi.mock("$lib/modules/device/lib/ble", async (importOriginal) => {
  class Watch {
    constructor(private status: (s: string) => void) {}
    onDials = () => {};
    async connect() {
      return { name: "CMF Watch Pro 2-1A2B", battery: null, firmware: null, serial: null };
    }
    async uploadWatchface() {
      this.status("disconnected");
      throw new Error("GATT Server is disconnected. Cannot perform GATT operations.");
    }
  }

  return { ...(await importOriginal<object>()), Watch };
});

test("a flash cut off by a disconnect still names the watch it was going to", async () => {
  const sent: [string, unknown][] = [];

  (window as { umami?: { track: (n: string, p?: unknown) => void } }).umami = {
    track: (name, props) => sent.push([name, props]),
  };
  bleModel.connectRequested();
  await vi.waitFor(() => expect(bleModel.$bleInfo.getState()).not.toBeNull());
  bleModel.flashRequested({ bin: new Uint8Array() });
  await vi.waitFor(() => expect(sent).toHaveLength(2));

  expect(sent).toEqual([
    ["watch_connect", { device: "CMF Watch Pro 2" }],
    ["watch_upload_failed", { device: "CMF Watch Pro 2", reason: "disconnected" }],
  ]);
});
