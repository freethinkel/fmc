// The option list of a native <select> is painted by the browser, not by us: on the platforms
// where it isn't a native menu it takes the select's own background and the option's own color.
// A translucent background there composites against the UA's white, so a dark-mode list came out
// white while the options kept the light text — white on white (reported on #37). Both colors
// have to be opaque and spelled out; there is no rendering of the popup to assert against.
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import Select from "$lib/shared/components/select/select.svelte";
import "$lib/styles/tokens.css"; // the colors are mixed from tokens — without them there is nothing to mix

/** getComputedStyle always hands back rgb()/rgba() — the 4th component is there only if it is
 *  not fully opaque, and `transparent` (an unresolvable color-mix) comes back as rgba(0,0,0,0). */
const alphaOf = (color: string) => {
  const parts = color.slice(color.indexOf("(") + 1, -1).split(",");

  return parts.length < 4 ? 1 : Number(parts[3]);
};

test("the select and its options paint on opaque colors", async () => {
  const screen = await render(Select, {
    value: "a",
    options: [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ],
  });
  const select = (await screen.getByRole("combobox").element()) as HTMLSelectElement;
  const option = select.options[0];

  expect(alphaOf(getComputedStyle(select).backgroundColor)).toBe(1);
  expect(alphaOf(getComputedStyle(option).backgroundColor)).toBe(1);
  // and the row's own text is set rather than left to whatever painted behind it
  expect(getComputedStyle(option).color).not.toBe(getComputedStyle(option).backgroundColor);
});
