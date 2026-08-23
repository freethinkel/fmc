// The set is inlined: a name that has no file under icons/ would render an empty span, and
// nothing else would fail — so assert the markup actually lands, at the asked-for size.
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import { Icon } from "$lib/shared/components/icon";

test("an icon inlines its svg at the requested size", async () => {
  await render(Icon, { name: "heart", size: 16, color: "rgb(255, 0, 0)" });

  const svg = document.querySelector("svg")!;

  expect(svg).toBeTruthy();
  expect(svg.getBoundingClientRect().width).toBe(16);
  // stroke follows the colour prop, fill stays off unless asked for
  expect(getComputedStyle(svg).stroke).toBe("rgb(255, 0, 0)");
  expect(getComputedStyle(svg).fill).toBe("none");
});
