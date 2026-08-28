// The whole card opens the showcase on click, and the overflow menu lives inside it — so every
// menu click has to stop before it reaches the card, or deleting a watchface would also
// navigate to it.
import { test, expect, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import type { RecordModel } from "pocketbase";
import { WatchfaceCard } from "$lib/modules/market/components/watchface-card";

const wf = {
  id: "wf1",
  name: "Test face",
  owner: "u1",
  published: false,
  downloads: 3,
} as unknown as RecordModel;

test("menu actions fire without opening the card", async () => {
  const onOpen = vi.fn();
  const onRemove = vi.fn();
  const onPublishToggle = vi.fn();
  const screen = await render(WatchfaceCard, {
    wf,
    manage: true,
    canRemove: true,
    onOpen,
    onRemove,
    onPublishToggle,
  });

  await screen.getByTitle("More").click();
  await screen.getByRole("menuitem", { name: "Publish" }).click();
  expect(onPublishToggle).toHaveBeenCalledOnce();

  await screen.getByTitle("More").click();
  await screen.getByRole("menuitem", { name: "Delete" }).click();
  expect(onRemove).toHaveBeenCalledOnce();

  expect(onOpen).not.toHaveBeenCalled();

  // the card itself still opens
  await screen.getByRole("heading", { name: "Test face" }).click();
  expect(onOpen).toHaveBeenCalledOnce();
});
