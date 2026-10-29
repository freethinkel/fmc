// The accent colors a user can pick in Account → Accent color.
//
// `value` is what lands in `--color-accent` on <html>. The default carries none: choosing it
// removes the override, so the colour comes from tokens.css exactly as before and a future
// change to the token still reaches everyone who never picked anything.
//
// ponytail: every other entry sits at a similar lightness, because `--color-on-accent` is a dark
// ink in both schemes (tokens.css) and has to stay readable on whatever is picked. A new entry
// should keep to L ≈ 0.72–0.88, or text on the accent surfaces (active tab, badges) goes dim.

export interface Accent {
  id: string;
  label: string;
  /** the `--color-accent` override; null keeps the tokens.css one */
  value: string | null;
  /** what the picker's swatch paints */
  swatch: string;
}

export const DEFAULT_ACCENT = "yellow";

export const ACCENTS: readonly Accent[] = [
  // swatch mirrors `--color-accent` in tokens.css — the swatch must show yellow even while
  // another accent is active, so it can't read the live token
  { id: DEFAULT_ACCENT, label: "Yellow", value: null, swatch: "#ffc700" },
  { id: "orange", label: "Orange", value: "oklch(0.78 0.17 55)", swatch: "oklch(0.78 0.17 55)" },
  { id: "red", label: "Red", value: "oklch(0.72 0.19 25)", swatch: "oklch(0.72 0.19 25)" },
  { id: "pink", label: "Pink", value: "oklch(0.76 0.17 350)", swatch: "oklch(0.76 0.17 350)" },
  { id: "purple", label: "Purple", value: "oklch(0.72 0.16 300)", swatch: "oklch(0.72 0.16 300)" },
  { id: "blue", label: "Blue", value: "oklch(0.74 0.14 250)", swatch: "oklch(0.74 0.14 250)" },
  { id: "cyan", label: "Cyan", value: "oklch(0.82 0.12 205)", swatch: "oklch(0.82 0.12 205)" },
  { id: "green", label: "Green", value: "oklch(0.82 0.18 150)", swatch: "oklch(0.82 0.18 150)" },
  { id: "lime", label: "Lime", value: "oklch(0.88 0.19 125)", swatch: "oklch(0.88 0.19 125)" },
];

/** The accent for a stored id; anything unknown (an old or edited value) is the default. */
export const accentById = (id: string | null | undefined): Accent =>
  ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
