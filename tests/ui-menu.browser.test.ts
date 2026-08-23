import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import MenuFixture from "./__fixtures__/menu-fixture.svelte";

// where the browser has anchor positioning the menu is a popover in the top layer, so a
// scroll container can't clip it — the fallback path keeps it inside the trigger's box
test("an anchored menu opens in the top layer", async () => {
  const screen = await render(MenuFixture);

  await screen.getByTestId("trigger").click();

  const menu = document.querySelector('[role="menu"]')!;

  expect(menu.matches(":popover-open")).toBe(CSS.supports("anchor-name: --a"));
});

test("menu opens on trigger and closes on outside pointerdown", async () => {
  const screen = await render(MenuFixture);

  await screen.getByTestId("trigger").click();
  await expect.element(screen.getByRole("menu")).toBeInTheDocument();

  await screen.getByTestId("outside").click();
  await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
});
