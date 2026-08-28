import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
// the menu paints on --color-background from the tokens; without them it has no surface
import "$lib/styles/tokens.css";
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

test("the menu animates shut instead of vanishing", async () => {
  const screen = await render(MenuFixture);

  await screen.getByTestId("trigger").click();

  // the menu is only in the DOM while it is open — it is Svelte's transition, not a CSS one
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;

  await new Promise((r) => setTimeout(r, 200));
  expect(getComputedStyle(menu).opacity).toBe("1");

  // the outro runs inline, frame by frame, so the node has to stay mounted and fade before it
  // leaves — polling for one mid-flight opacity is a race, so sample every frame until it goes
  await screen.getByTestId("outside").click();

  const fading: number[] = [];

  while (menu.isConnected && fading.length < 100) {
    fading.push(Number(getComputedStyle(menu).opacity));
    await new Promise((r) => requestAnimationFrame(r));
  }

  expect(fading.some((o) => o > 0 && o < 1)).toBe(true);
  expect(document.querySelector('[role="menu"]')).toBe(null);
});
