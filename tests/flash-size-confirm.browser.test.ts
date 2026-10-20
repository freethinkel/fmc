// A face with an image bigger than any factory face uses only goes to the watch once the user
// accepts the risk — drives that through the real ble.model with the transport stubbed out.
import { test, expect, vi } from "vitest";
import { bleModel } from "$lib/modules/device/model";
import { buildBin, parseBin } from "$lib/modules/editor/core/format";
import url from "./__fixtures__/Analog__287__Simple_Dial.bin?url";

const uploads = vi.hoisted((): Uint8Array[] => []);

vi.mock("$lib/modules/device/lib/ble", async (importOriginal) => {
  class Watch {
    serial = null;
    onDials = () => {};
    async connect() {
      return { name: "CMF Watch 3 Pro-9A9D", battery: null, firmware: null, serial: null };
    }
    async uploadWatchface(bin: Uint8Array) {
      uploads.push(bin);
      return { id: 1, name: "big" };
    }
    mergeDials() {}
  }

  return { ...(await importOriginal<object>()), Watch };
});

test("an oversized face waits for the user, and goes out once they accept", async () => {
  const face = parseBin(await (await fetch(url)).arrayBuffer());

  face.resources[0] = { ...face.resources[0], w: 576, h: 530 };
  const bin = buildBin(face);

  bleModel.connectRequested();
  await vi.waitFor(() => expect(bleModel.$bleInfo.getState()).not.toBeNull());

  bleModel.flashRequested({ bin });
  await vi.waitFor(() => expect(bleModel.$sizeWarning.getState()).toMatch(/576×530/));
  bleModel.sizeWarningClosed(); // backing out sends nothing…
  expect(bleModel.$sizeWarning.getState()).toBeNull();

  bleModel.flashRequested({ bin });
  await vi.waitFor(() => expect(bleModel.$sizeWarning.getState()).not.toBeNull());
  bleModel.sizeConfirmed();
  bleModel.sizeWarningClosed(); // what the dialog reports as accepting shuts it
  await vi.waitFor(() => expect(uploads).toHaveLength(1));
  expect(uploads[0]).toBe(bin); // …and accepting sends the file it asked about
});
