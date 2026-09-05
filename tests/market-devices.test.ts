// The device filter decides what a Watch Pro 2 owner sees on the front page, and most of the
// marketplace predates the field — so the untagged-face rule is the part worth pinning down.
// Runs in the "unit" (node) vitest project.
import { describe, test, expect } from "vitest";
import {
  DEFAULT_DEVICE,
  DEVICES,
  deviceLabel,
  matchesDevice,
} from "$lib/modules/market/lib/devices";

describe("matchesDevice", () => {
  test("no filter keeps everything", () => {
    for (const wf of ["watch_pro_2", "watch_3_pro", undefined])
      expect(matchesDevice(wf, "")).toBe(true);
  });

  test("a tagged face only shows on its own shelf", () => {
    expect(matchesDevice("watch_3_pro", "watch_3_pro")).toBe(true);
    expect(matchesDevice("watch_3_pro", "watch_pro_2")).toBe(false);
    expect(matchesDevice("watch_3_pro", "watch_pro")).toBe(false);
  });

  test("an untagged face falls under the default device, not every shelf", () => {
    expect(matchesDevice(undefined, DEFAULT_DEVICE)).toBe(true);
    for (const d of DEVICES.filter((d) => d.value !== DEFAULT_DEVICE))
      expect(matchesDevice(undefined, d.value)).toBe(false);
  });

  test("an empty-string device is untagged too — PocketBase writes '' for an unset select", () => {
    expect(matchesDevice("", DEFAULT_DEVICE)).toBe(true);
    expect(matchesDevice("", "watch_3_pro")).toBe(false);
  });
});

describe("deviceLabel", () => {
  test("badges only the devices we know", () => {
    expect(deviceLabel("watch_3_pro")).toBe("Watch 3 Pro");
    expect(deviceLabel("")).toBe("");
    expect(deviceLabel(undefined)).toBe("");
    expect(deviceLabel("watch_9_ultra")).toBe("");
  });
});
