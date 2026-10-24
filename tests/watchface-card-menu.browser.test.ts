// The stretched showcase link must leave the card's menu actions independently clickable.
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
  const onRemove = vi.fn();
  const onPublishToggle = vi.fn();
  const screen = await render(WatchfaceCard, {
    wf,
    manage: true,
    canRemove: true,
    onRemove,
    onPublishToggle,
  });

  await screen.getByTitle("More").click();
  await screen.getByRole("menuitem", { name: "Publish" }).click();
  expect(onPublishToggle).toHaveBeenCalledOnce();

  await screen.getByTitle("More").click();
  await screen.getByRole("menuitem", { name: "Delete" }).click();
  expect(onRemove).toHaveBeenCalledOnce();

  await expect
    .element(screen.getByRole("link", { name: "Open Test face" }))
    .toHaveAttribute("href", "/market/wf1");
});

test("touch clicks keep native link behavior without a tap timer", async () => {
  const screen = await render(WatchfaceCard, { wf });
  const link = screen.container.querySelector<HTMLAnchorElement>(".open-link")!;

  link.dispatchEvent(new PointerEvent("pointerdown", { pointerType: "touch", bubbles: true }));

  // Stop navigation only after checking whether the component intercepted the click.
  let intercepted = true;

  window.addEventListener(
    "click",
    (event) => {
      intercepted = event.defaultPrevented;
      event.preventDefault();
    },
    { once: true },
  );
  link.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  expect(intercepted).toBe(false);
});
