// The select is a Menu underneath; callers still bind:value and listen to onChange exactly as
// they did with the native <select>, so that contract is what gets asserted. (The white-on-white
// dropdown of #37 is gone by construction — the list is ours, painted on --color-background.)
import { test, expect, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import SelectFixture from "./__fixtures__/select-fixture.svelte";

test("picking a row updates the bound value and reports it", async () => {
  const onChange = vi.fn();
  const screen = await render(SelectFixture, { onChange });

  await expect.element(screen.getByRole("button", { name: "Newest" })).toBeInTheDocument();

  await screen.getByRole("button", { name: "Newest" }).click();
  await screen.getByRole("menuitem", { name: "Popular" }).click();

  expect(onChange).toHaveBeenCalledWith("popular");
  await expect.element(screen.getByTestId("bound")).toHaveTextContent("popular");
  await expect.element(screen.getByRole("button", { name: "Popular" })).toBeInTheDocument();
  // the list closed on pick
  await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
});
