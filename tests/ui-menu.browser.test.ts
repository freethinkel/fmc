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

  await expect.poll(() => getComputedStyle(menu).opacity).toBe("1");

  // the outro lasts 100ms, and under a loaded suite the click's round trip alone can take longer,
  // so sampling it against the clock finds it already gone. Svelte drives it through
  // element.animate: freeze the fade as it starts and step it by hand instead
  const animate = Element.prototype.animate;
  const fades: Animation[] = [];

  Element.prototype.animate = function (keyframes, options) {
    const a = animate.call(this, keyframes, options);

    // the zero-length one is Svelte's delay placeholder, not the fade
    if (this === menu && typeof options === "object" && Number(options.duration) > 0) {
      a.pause();
      fades.push(a);
    }
    return a;
  };

  try {
    await screen.getByTestId("outside").click();
    await expect.poll(() => fades.length).toBe(1);

    const [fade] = fades;

    fade.currentTime = Number(fade.effect!.getTiming().duration) / 2;

    const mid = Number(getComputedStyle(menu).opacity);

    expect(menu.isConnected).toBe(true);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    fade.finish();
  } finally {
    Element.prototype.animate = animate;
  }

  await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
});
