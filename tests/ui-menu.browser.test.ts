import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
// the menu's transition reads --spring-transition; without the tokens the whole shorthand is
// invalid and the close would be instant
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
  const menu = document.querySelector<HTMLElement>('[role="menu"]')!;

  await screen.getByTestId("trigger").click();
  await new Promise((r) => setTimeout(r, 600));
  expect(getComputedStyle(menu).opacity).toBe("1");

  // a transition has to actually run on the way out — polling for a mid-flight opacity is a
  // race on a loaded machine, so wait for the browser to tell us it started
  const closing = new Promise<string[]>((resolve, reject) => {
    const seen: string[] = [];

    menu.addEventListener("transitionrun", (e) => {
      seen.push(e.propertyName);
      // display and overlay run discretely alongside the visible fade
      if (seen.includes("opacity")) resolve(seen);
    });
    setTimeout(() => reject(new Error(`no opacity transition, saw: ${seen}`)), 1000);
  });

  await screen.getByTestId("outside").click();
  expect(await closing).toContain("opacity");

  await new Promise((r) => setTimeout(r, 600));
  expect(getComputedStyle(menu).display).toBe("none");
});
