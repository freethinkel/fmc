// Appearance: the accent colour the user picked in Account → Accent color.
//
// Kept on the device (localStorage), not on the users record: the backend lives in a separate
// repo, and a colour preference isn't worth a schema change. The choice is applied by setting
// `--color-accent` on <html>, which beats the stylesheet's :root rule in both colour schemes —
// every component already reads that one token, so nothing else needs to know.
import { createEffect, createEvent, createStore, sample } from "effector";
import { accentById, DEFAULT_ACCENT } from "../lib/accents";

const STORAGE_KEY = "fmc:accent";

// storage can throw (private mode, blocked cookies) — a missing preference is just the default
const readStored = (): string | null => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

// ---- stores ----
export const $accent = createStore(accentById(readStored()).id);
export const $accentDialogOpen = createStore(false);

// ---- events ----
export const accentPicked = createEvent<string>();
export const accentDialogOpened = createEvent();
export const accentDialogClosed = createEvent();

// ---- effects ----
const applyAccentFx = createEffect((id: string) => {
  const accent = accentById(id);
  const root = document.documentElement;

  if (accent.value) root.style.setProperty("--color-accent", accent.value);
  else root.style.removeProperty("--color-accent");

  try {
    if (accent.id === DEFAULT_ACCENT) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, accent.id);
  } catch {
    // the colour still applies for this session
  }
});

// ---- business logic ----
sample({
  clock: accentPicked,
  fn: (id) => accentById(id).id,
  target: $accent,
});
sample({
  clock: $accent,
  target: applyAccentFx,
});
sample({
  clock: accentDialogOpened,
  fn: () => true,
  target: $accentDialogOpen,
});
sample({
  clock: accentDialogClosed,
  fn: () => false,
  target: $accentDialogOpen,
});

// the saved colour goes on at startup, not on the first pick ($accent's own initial value
// doesn't fire its updates)
if (typeof document !== "undefined") applyAccentFx(accentById(readStored()).id);
