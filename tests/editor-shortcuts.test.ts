import { describe, expect, it, vi } from "vitest";
import {
  SHORTCUTS,
  capsFor,
  comboOf,
  formatKeys,
  inField,
  isMac,
  isRoving,
  matchShortcut,
  shortcutGroups,
  type KeyLike,
  type ShortcutActions,
  type ShortcutCtx,
} from "../src/lib/modules/editor/shared/shortcuts";

const key = (over: Partial<KeyLike> & { key: string }): KeyLike => ({
  code: "",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  ...over,
});
const CTX: ShortcutCtx = { doc: true, selection: true, field: false, roving: true };
const ctx = (over: Partial<ShortcutCtx> = {}): ShortcutCtx => ({ ...CTX, ...over });

/** Every action stubbed, so a `run` can be watched without the editor around it. */
const actions = () =>
  new Proxy({} as ShortcutActions & Record<string, ReturnType<typeof vi.fn>>, {
    get: (t, k: string) => (t[k] ??= vi.fn()),
  });

describe("comboOf", () => {
  it("names modifiers in a fixed order, ⌘ and Ctrl alike", () => {
    expect(comboOf(key({ key: "e", code: "KeyE", metaKey: true }))).toBe("mod+e");
    expect(comboOf(key({ key: "e", code: "KeyE", ctrlKey: true }))).toBe("mod+e");
    expect(comboOf(key({ key: "E", code: "KeyE", metaKey: true, shiftKey: true }))).toBe(
      "mod+shift+e",
    );
    expect(
      comboOf(key({ key: "ArrowLeft", code: "ArrowLeft", altKey: true, shiftKey: true })),
    ).toBe("alt+shift+left");
  });

  it("reads letters and digits off the physical key, not the layout", () => {
    // ⌘C on a Cyrillic layout: e.key is `с`, the key under the finger is still KeyC
    expect(comboOf(key({ key: "с", code: "KeyC", metaKey: true }))).toBe("mod+c");
    expect(comboOf(key({ key: "ц", code: "KeyW" }))).toBe("w");
    expect(comboOf(key({ key: "1", code: "Digit1" }))).toBe("1");
    expect(comboOf(key({ key: "]", code: "BracketRight", metaKey: true }))).toBe("mod+]");
  });

  it("takes ? by character — it is shift+/ on one layout and shift+7 on another", () => {
    expect(comboOf(key({ key: "?", code: "Slash", shiftKey: true }))).toBe("?");
    expect(comboOf(key({ key: "?", code: "Digit7", shiftKey: true }))).toBe("?");
  });
});

describe("matchShortcut", () => {
  it("runs the action a combo is bound to", () => {
    const a = actions();

    matchShortcut(key({ key: "d", code: "KeyD", metaKey: true }), CTX)?.run(a, key({ key: "d" }));
    expect(a.duplicate).toHaveBeenCalled();
  });

  it("scales an arrow by ⇧ and resizes with ⌥", () => {
    const a = actions();
    const down = key({ key: "ArrowDown", code: "ArrowDown", shiftKey: true });
    const wide = key({ key: "ArrowRight", code: "ArrowRight", altKey: true });

    matchShortcut(down, CTX)?.run(a, down);
    matchShortcut(wide, CTX)?.run(a, wide);
    expect(a.move).toHaveBeenCalledWith(0, 10);
    expect(a.resize).toHaveBeenCalledWith(1, 0);
  });

  it("keeps ⌘⇧A and ⌘A apart", () => {
    expect(matchShortcut(key({ key: "a", code: "KeyA", metaKey: true }), CTX)?.label).toMatch(
      /Select everything/,
    );
    expect(
      matchShortcut(key({ key: "a", code: "KeyA", metaKey: true, shiftKey: true }), CTX)?.label,
    ).toBe("Deselect");
  });

  it("fires nothing while a field or a dialog has focus", () => {
    expect(matchShortcut(key({ key: "Delete", code: "Delete" }), ctx({ field: true }))).toBeNull();
    expect(inField({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(inField({ tagName: "DIV", closest: () => ({}) } as unknown as EventTarget)).toBe(true);
    expect(inField({ tagName: "DIV", closest: () => null } as unknown as EventTarget)).toBe(false);
    expect(inField(null)).toBe(false);
  });

  it("honours the context an entry asks for", () => {
    const del = key({ key: "Delete", code: "Delete" });

    expect(matchShortcut(del, CTX)).not.toBeNull();
    expect(matchShortcut(del, ctx({ selection: false }))).toBeNull();
    // undo has no `when` — it works on an empty selection
    expect(
      matchShortcut(key({ key: "z", code: "KeyZ", metaKey: true }), ctx({ doc: false })),
    ).not.toBeNull();
    // the AOD screen needs a document to put one on
    expect(matchShortcut(key({ key: "a", code: "KeyA" }), ctx({ doc: false }))).toBeNull();
  });

  it("leaves Tab and Enter to whatever control has focus", () => {
    const tab = key({ key: "Tab", code: "Tab" });

    expect(matchShortcut(tab, CTX)?.label).toMatch(/Next sibling/);
    expect(matchShortcut(tab, ctx({ roving: false }))).toBeNull();
    expect(isRoving({ tagName: "CANVAS" } as unknown as EventTarget)).toBe(true);
    expect(isRoving({ tagName: "BUTTON", matches: () => true } as unknown as EventTarget)).toBe(
      false,
    );
  });
});

describe("the table itself", () => {
  it("binds every combo exactly once", () => {
    const all = SHORTCUTS.flatMap((s) => s.combos);

    expect(new Set(all).size).toBe(all.length);
  });

  // ShortcutsDialog renders shortcutGroups() and nothing else, so this is the documented list
  it("documents every binding in the overlay", () => {
    expect(shortcutGroups().flatMap((g) => g.items)).toEqual([...SHORTCUTS]);
  });

  it("writes the modifiers in this platform's alphabet", () => {
    expect(formatKeys("Mod+Shift+E", true)).toEqual(["⌘", "⇧", "E"]);
    expect(formatKeys("Mod+Shift+E", false)).toEqual(["Ctrl", "Shift", "E"]);
  });

  it("hands a menu the keycaps for an action, or nothing", () => {
    expect(capsFor("mod+d")).toEqual([isMac() ? "⌘" : "Ctrl", "D"]);
    expect(capsFor("delete")).toEqual(["Delete"]); // one alternative is all a menu has room for
    expect(capsFor("mod+g")).toEqual([]); // grouping isn't bound
  });
});
