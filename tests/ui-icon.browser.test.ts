// The set is an icon font keyed by ligature: the name prop IS the Material Symbols name, so a
// typo renders the word "chevron_rihgt" where the arrow should be. Assert the ligature lands on
// the asked-for size and axes, and that every name the app spells is one Google actually ships.
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import { Icon } from "$lib/shared/components/icon";

test("an icon renders its ligature at the requested size", async () => {
  await render(Icon, { name: "favorite", size: 16, color: "rgb(255, 0, 0)", fill: true });

  const icon = document.querySelector(".icon")!;

  expect(icon.textContent).toBe("favorite");

  const style = getComputedStyle(icon);

  // the box is one em wide once the face is there — loading it is app.html's job, so measure
  // what the component itself sets
  expect(style.fontSize).toBe("16px");
  expect(style.color).toBe("rgb(255, 0, 0)");
  expect(style.fontFamily).toContain("Material Symbols Rounded");
  // fill is the FILL axis — the liked heart is the solid glyph, not a painted outline
  expect(style.fontVariationSettings).toContain('"FILL" 1');
});

// A name the font doesn't know renders as its own word — many ems wide, where a real glyph is
// exactly one. So subset the face to the names the app actually spells and measure each one.
test("every icon name in the app is one Material Symbols ships", async () => {
  const sources = import.meta.glob("/src/**/*.svelte", {
    query: "?raw",
    import: "default",
    eager: true,
  });
  const names = new Set<string>();

  // only what the name prop spells: a literal, or both arms of the `hidden ? a : b` it toggles
  for (const source of Object.values(sources) as string[])
    for (const tag of source.match(/<Icon\b[\s\S]*?\/>/g) ?? [])
      for (const [, literal, expression] of tag.matchAll(/name=(?:"([a-z0-9_]+)"|\{([^}]*)\})/g))
        if (literal) names.add(literal);
        else for (const [, arm] of expression.matchAll(/"([a-z0-9_]+)"/g)) names.add(arm);

  expect(names.size).toBeGreaterThan(20);

  const css = await (
    await fetch(
      `https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded&icon_names=${[...names].sort().join(",")}`,
    )
  ).text();
  const url = css.match(/url\((https:[^)]+)\)/)![1];

  document.fonts.add(await new FontFace("Material Symbols Rounded", `url(${url})`).load());

  const ctx = document.createElement("canvas").getContext("2d")!;

  ctx.font = '24px "Material Symbols Rounded"';

  expect([...names].filter((name) => ctx.measureText(name).width !== 24)).toEqual([]);
});
