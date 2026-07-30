// The CMF Watch Pro 2's panel. Deliberately dependency-free so every layer — format, renderer,
// tree factories, UI — can import it without pulling anything else in.
//
// This is device geometry, not a format constant: the file itself stores sizes per widget, and
// a different panel would change these while the .bin layout stayed identical.

/** Panel width and height in pixels — the canvas everything is authored against. */
export const SCREEN = 466;

/** Dial centre. Hands rotate about it and full-bleed rings are centred on it. */
export const CENTER = SCREEN / 2;

/** The embedded catalog thumbnail a new face starts with (0x28), not the panel size. */
export const PREVIEW = 270;
