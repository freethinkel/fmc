// The device badge is the card's only statement about which watch a face fits, so it has to be
// silent rather than wrong: a record that doesn't claim a device — most of the marketplace,
// which predates the field — must not get a badge guessed for it.
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import type { RecordModel } from "pocketbase";
import { WatchfaceCard } from "$lib/modules/market/components/watchface-card";

const face = (extra: Record<string, unknown>) =>
  ({
    id: "wf1",
    name: "Test face",
    owner: "u1",
    published: true,
    ...extra,
  }) as unknown as RecordModel;

test("a face that claims a device gets a badge", async () => {
  const screen = await render(WatchfaceCard, { wf: face({ device: "watch_3_pro" }) });

  await expect.element(screen.getByText("Watch 3 Pro")).toBeInTheDocument();
});

test("an untagged face gets none", async () => {
  const screen = await render(WatchfaceCard, { wf: face({}) });

  expect(screen.container.querySelectorAll(".badge")).toHaveLength(0);
});
