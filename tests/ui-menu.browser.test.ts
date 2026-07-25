import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import MenuFixture from "./__fixtures__/menu-fixture.svelte";

test("menu opens on trigger and closes on outside pointerdown", async () => {
  const screen = await render(MenuFixture);

  await screen.getByTestId("trigger").click();
  await expect.element(screen.getByRole("menu")).toBeInTheDocument();

  await screen.getByTestId("outside").click();
  await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
});
