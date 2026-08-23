import { startFaviconClock } from "$lib/shared/lib/favicon";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

const href = () => document.querySelector<HTMLLinkElement>('link[rel="icon"]')!.href;
const svg = () => decodeURIComponent(href().replace("data:image/svg+xml,", ""));

let stop = () => {};

beforeEach(() => {
  document.head.append(Object.assign(document.createElement("link"), { rel: "icon" }));
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 1, 21, 37));
});

afterEach(() => {
  stop();
  vi.useRealTimers();
  document.querySelector('link[rel="icon"]')?.remove();
});

test("cycles junk digits, then settles on the wall clock", () => {
  stop = startFaviconClock();

  const cracking = svg();

  vi.advanceTimersByTime(70 * 8);
  const settled = svg();

  expect(settled).not.toBe(cracking);
  // 21:37 lights 14 + 10 + 14 + 11 dots, plus the one <circle> the dim grid pattern is made of
  expect((settled.match(/circle/g) ?? []).length).toBe(49 + 1);
  // the minutes row is the accent one
  expect(settled).toContain("#ffc700");
  // and it holds there while the minute doesn't change
  vi.advanceTimersByTime(1000);
  expect(svg()).toBe(settled);
});

test("re-cracks when the minute flips, and stops on teardown", () => {
  stop = startFaviconClock();
  vi.advanceTimersByTime(70 * 8);

  const at2137 = svg();

  vi.setSystemTime(new Date(2026, 0, 1, 21, 38));
  vi.advanceTimersByTime(1000 + 70 * 8);
  expect(svg()).not.toBe(at2137);

  const at2138 = svg();

  stop();
  vi.setSystemTime(new Date(2026, 0, 1, 21, 39));
  vi.advanceTimersByTime(5000);
  expect(svg()).toBe(at2138);
});
