// The editor keymap: one table, matched against a keydown and rendered into the help overlay.
// Nothing here imports Svelte or the model — an entry names an action on the `ShortcutActions`
// bag the page hands in, so the same table is both the binding list and the documentation and
// the two can't drift apart.
//
// A combo is written mod+alt+shift+key, in that order. `mod` is ⌘ on a Mac and Ctrl elsewhere —
// the two are never told apart, so a Mac user with an external PC keyboard gets both.

/** The bits of a KeyboardEvent the matcher reads — spelled out so tests can pass a literal. */
export type KeyLike = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey"
>;

/** What the page can do. Every entry's `run` reaches for exactly one of these. */
export interface ShortcutActions {
  undo(): void;
  redo(): void;
  copy(): void;
  cut(): void;
  paste(): void;
  duplicate(): void;
  remove(): void;
  /** Draw order among siblings: +1 towards the front, -1 towards the back. */
  order(dir: 1 | -1): void;
  clearSelection(): void;
  selectAll(): void;
  /** Move the selection to the next (+1) or previous (-1) sibling. */
  sibling(dir: 1 | -1): void;
  /** Step into a group (+1, its first child) or out to the parent (-1). */
  nest(dir: 1 | -1): void;
  move(dx: number, dy: number): void;
  resize(dw: number, dh: number): void;
  save(): void;
  exportBin(): void;
  flash(): void;
  panel(tab: "props" | "sim"): void;
  screen(kind: "main" | "aod"): void;
  help(): void;
}

/** What decides whether a binding applies right now. */
export interface ShortcutCtx {
  /** A document is open. */
  readonly doc: boolean;
  /** At least one layer is selected. */
  readonly selection: boolean;
  /** Focus sits in a text field or inside a dialog — nothing fires there. */
  readonly field: boolean;
  /** Focus is on the page itself rather than on a control. Tab and Enter are the browser's while
   *  a button has focus — stealing them there would break keyboard navigation of the toolbar. */
  readonly roving: boolean;
}

export interface Shortcut {
  /** Every combo that runs this action. */
  readonly combos: readonly string[];
  /** How the keys are written in the overlay: `+`-separated tokens, `Mod`/`Shift`/`Alt` are
   *  swapped for the platform's symbols by `formatKeys`. */
  readonly keys: string;
  readonly label: string;
  readonly group: string;
  readonly when?: (ctx: ShortcutCtx) => boolean;
  readonly run: (a: ShortcutActions, e: KeyLike) => void;
}

// ---- key naming ----
const NAMED: Record<string, string> = {
  Escape: "esc",
  Delete: "delete",
  Backspace: "backspace",
  Enter: "enter",
  Tab: "tab",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
};

/** The combo a keydown stands for, e.g. `mod+shift+e`.
 *
 *  Letters and digits are read off `e.code`, not `e.key`: on a non-Latin layout ⌘C reports a
 *  Cyrillic `с`, and matching on that would leave half the keymap dead for anyone not typing in
 *  English. Everything else — the named keys and `?` — goes by `e.key`, which is layout-correct
 *  by definition (`?` is shift+/ on one layout and shift+7 on another). */
export function comboOf(e: KeyLike): string {
  const base =
    e.key === "?"
      ? "?"
      : /^Key[A-Z]$/.test(e.code)
        ? e.code.slice(3).toLowerCase()
        : /^Digit\d$/.test(e.code)
          ? e.code.slice(5)
          : e.code === "BracketLeft"
            ? "["
            : e.code === "BracketRight"
              ? "]"
              : (NAMED[e.key] ?? e.key.toLowerCase());
  // `?` already carries its shift — listing it would make the combo unwritable
  if (base === "?") return "?";
  const mods = [];

  if (e.metaKey || e.ctrlKey) mods.push("mod");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  return [...mods, base].join("+");
}

/** Does focus sit somewhere that owns the keyboard? Takes the event target rather than an
 *  element so a test can hand it a bare `{ tagName }`. */
export function inField(target: EventTarget | null): boolean {
  const el = target as (HTMLElement & { closest?: (s: string) => unknown }) | null;

  if (!el?.tagName) return false;
  if (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return true;
  if (el.isContentEditable) return true;
  return Boolean(el.closest?.("dialog"));
}

/** Is focus on the page rather than on a control of its own? Same duck-typing as `inField`. */
export const isRoving = (target: EventTarget | null): boolean => {
  const el = target as (HTMLElement & { matches?: (s: string) => boolean }) | null;

  if (!el?.tagName || el.tagName === "CANVAS") return true;
  return !el.matches?.("a[href], button, [tabindex], [role]");
};

const step = (e: KeyLike) => (e.shiftKey ? 10 : 1);
/** The direction an arrow key points, scaled by ⇧. */
const arrow = (e: KeyLike): [number, number] => {
  const d = step(e);

  switch (NAMED[e.key]) {
    case "left":
      return [-d, 0];
    case "right":
      return [d, 0];
    case "up":
      return [0, -d];
    default:
      return [0, d];
  }
};
const ARROWS = ["left", "right", "up", "down"];
const withShift = (combos: string[]) => [...combos, ...combos.map((c) => `shift+${c}`)];
const hasDoc = (c: ShortcutCtx) => c.doc;
const hasSel = (c: ShortcutCtx) => c.selection;
// Tab and Enter belong to whatever control has focus — take them only on the page itself
const roving = (c: ShortcutCtx) => c.selection && c.roving;

export const SHORTCUTS: readonly Shortcut[] = [
  // ---- File ----
  {
    combos: ["mod+s"],
    keys: "Mod+S",
    label: "Save the watchface",
    group: "File",
    when: hasDoc,
    run: (a) => a.save(),
  },
  {
    combos: ["mod+e"],
    keys: "Mod+E",
    label: "Export .bin",
    group: "File",
    when: hasDoc,
    run: (a) => a.exportBin(),
  },
  {
    combos: ["mod+shift+e"],
    keys: "Mod+Shift+E",
    label: "Flash to the watch",
    group: "File",
    when: hasDoc,
    run: (a) => a.flash(),
  },

  // ---- Edit ----
  {
    combos: ["mod+z"],
    keys: "Mod+Z",
    label: "Undo",
    group: "Edit",
    run: (a) => a.undo(),
  },
  {
    combos: ["mod+shift+z"],
    keys: "Mod+Shift+Z",
    label: "Redo",
    group: "Edit",
    run: (a) => a.redo(),
  },
  {
    combos: ["mod+c"],
    keys: "Mod+C",
    label: "Copy",
    group: "Edit",
    when: hasSel,
    run: (a) => a.copy(),
  },
  {
    combos: ["mod+x"],
    keys: "Mod+X",
    label: "Cut",
    group: "Edit",
    when: hasSel,
    run: (a) => a.cut(),
  },
  {
    combos: ["mod+v"],
    keys: "Mod+V",
    label: "Paste",
    group: "Edit",
    when: hasDoc,
    run: (a) => a.paste(),
  },
  {
    combos: ["mod+d"],
    keys: "Mod+D",
    label: "Duplicate",
    group: "Edit",
    when: hasSel,
    run: (a) => a.duplicate(),
  },
  {
    combos: ["delete", "backspace"],
    keys: "Delete / Backspace",
    label: "Delete the selection",
    group: "Edit",
    when: hasSel,
    run: (a) => a.remove(),
  },
  {
    combos: ["mod+]"],
    keys: "Mod+]",
    label: "Bring forward",
    group: "Edit",
    when: hasSel,
    run: (a) => a.order(1),
  },
  {
    combos: ["mod+["],
    keys: "Mod+[",
    label: "Send backward",
    group: "Edit",
    when: hasSel,
    run: (a) => a.order(-1),
  },

  // ---- Selection ----
  {
    combos: ["esc"],
    keys: "Esc",
    label: "Clear the selection",
    group: "Selection",
    when: hasSel,
    run: (a) => a.clearSelection(),
  },
  {
    combos: ["mod+a"],
    keys: "Mod+A",
    label: "Select everything on this screen",
    group: "Selection",
    when: hasDoc,
    run: (a) => a.selectAll(),
  },
  {
    combos: ["mod+shift+a"],
    keys: "Mod+Shift+A",
    label: "Deselect",
    group: "Selection",
    when: hasDoc,
    run: (a) => a.clearSelection(),
  },
  {
    combos: ["tab"],
    keys: "Tab",
    label: "Next sibling layer",
    group: "Selection",
    when: roving,
    run: (a) => a.sibling(1),
  },
  {
    combos: ["shift+tab"],
    keys: "Shift+Tab",
    label: "Previous sibling layer",
    group: "Selection",
    when: roving,
    run: (a) => a.sibling(-1),
  },
  {
    combos: ["enter"],
    keys: "Enter",
    label: "Enter the group",
    group: "Selection",
    when: roving,
    run: (a) => a.nest(1),
  },
  {
    combos: ["shift+enter"],
    keys: "Shift+Enter",
    label: "Step out to the parent",
    group: "Selection",
    when: roving,
    run: (a) => a.nest(-1),
  },

  // ---- Layout ----
  {
    combos: withShift(ARROWS),
    keys: "←/→/↑/↓",
    label: "Move by 1px (⇧ — 10px)",
    group: "Layout",
    when: hasSel,
    run: (a, e) => a.move(...arrow(e)),
  },
  {
    combos: withShift(ARROWS.map((k) => `alt+${k}`)),
    keys: "Alt+←/→/↑/↓",
    label: "Resize by 1px (⇧ — 10px)",
    group: "Layout",
    when: hasSel,
    run: (a, e) => a.resize(...arrow(e)),
  },

  // ---- View ----
  {
    combos: ["1"],
    keys: "1",
    label: "Properties tab",
    group: "View",
    run: (a) => a.panel("props"),
  },
  {
    combos: ["2"],
    keys: "2",
    label: "Simulator tab",
    group: "View",
    when: hasDoc,
    run: (a) => a.panel("sim"),
  },
  {
    combos: ["m"],
    keys: "M",
    label: "Main screen",
    group: "View",
    when: hasDoc,
    run: (a) => a.screen("main"),
  },
  {
    combos: ["a"],
    keys: "A",
    label: "AOD screen",
    group: "View",
    when: hasDoc,
    run: (a) => a.screen("aod"),
  },
  {
    combos: ["?"],
    keys: "?",
    label: "This list",
    group: "View",
    run: (a) => a.help(),
  },
];

/** The binding a keydown fires, or null. Nothing fires while a field or dialog has focus. */
export function matchShortcut(e: KeyLike, ctx: ShortcutCtx): Shortcut | null {
  if (ctx.field) return null;
  const combo = comboOf(e);

  return SHORTCUTS.find((s) => s.combos.includes(combo) && (s.when?.(ctx) ?? true)) ?? null;
}

/** `Mod+Shift+E` -> the keycaps to draw, in this platform's alphabet. */
export const formatKeys = (keys: string, mac: boolean): string[] =>
  keys
    .split("+")
    .map((k) =>
      k === "Mod"
        ? mac
          ? "⌘"
          : "Ctrl"
        : k === "Shift"
          ? mac
            ? "⇧"
            : "Shift"
          : k === "Alt"
            ? mac
              ? "⌥"
              : "Alt"
            : k,
    );

export const isMac = () => /Mac|iPhone|iPad/.test(globalThis.navigator?.userAgent ?? "");

/** The keycaps bound to `combo`, ready to draw next to a menu entry — empty when nothing is
 *  bound, so a menu can ask about any action without checking first. Where an entry lists
 *  alternatives (`Delete / Backspace`) only the first is shown: a menu has room for one. */
export const capsFor = (combo: string): string[] => {
  const s = SHORTCUTS.find((x) => x.combos.includes(combo));

  return s ? formatKeys(s.keys.split(" / ")[0], isMac()) : [];
};

/** The table as the overlay shows it: groups in table order, entries within them too. */
export const shortcutGroups = (): { group: string; items: readonly Shortcut[] }[] => {
  const out: { group: string; items: Shortcut[] }[] = [];

  for (const s of SHORTCUTS) {
    const bucket =
      out.find((g) => g.group === s.group) ??
      (out.push({ group: s.group, items: [] }), out[out.length - 1]);

    bucket.items.push(s);
  }
  return out;
};
