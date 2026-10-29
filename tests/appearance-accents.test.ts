// The accent a stored id maps to: an unknown or missing id (an old build's value, a hand-edited
// storage entry) must land on the default instead of leaving the page with no accent at all.
// Runs in the "unit" (node) vitest project.
import { describe, test, expect } from "vitest";
import { ACCENTS, DEFAULT_ACCENT, accentById } from "$lib/modules/appearance/lib/accents";

describe("accentById", () => {
  test("a known id is itself", () => {
    for (const a of ACCENTS) expect(accentById(a.id)).toBe(a);
  });

  test("unknown or missing falls back to the default", () => {
    for (const id of ["nope", "", null, undefined]) expect(accentById(id).id).toBe(DEFAULT_ACCENT);
  });

  test("the default keeps the stylesheet's colour — it sets no override", () => {
    expect(accentById(DEFAULT_ACCENT).value).toBeNull();
  });

  test("ids are unique and every other accent carries a colour", () => {
    expect(new Set(ACCENTS.map((a) => a.id)).size).toBe(ACCENTS.length);
    for (const a of ACCENTS.filter((a) => a.id !== DEFAULT_ACCENT)) expect(a.value).toBeTruthy();
  });
});
