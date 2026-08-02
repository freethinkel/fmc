// The font-to-sprites generator: which widget it targets, the settings it holds, the font list it
// offers and the preview it renders. The dialog is a view over these stores — it draws the preview
// bitmaps and fires the events, and decides nothing itself.
//
// The sprites previewed here are NOT the ones that land in the document: `glyphsRequested` runs
// the same pure `glyphSprites` again in edit.model, so the preview is a promise about the result
// rather than the result itself.
import { createEffect, createEvent, createStore, sample } from "effector";
import {
  DIGITS,
  glyphSprites,
  localFamilies,
  registerFont,
  type GlyphSpec,
} from "../core/render/glyphs";
import { FRAME_LABELS } from "../core/document/sources";
import { findLayer } from "../core/document/edits";
import type { NodeId } from "../core/document/doc";
import { $doc } from "./doc.model";
import { glyphsRequested } from "./edit.model";
import { errored } from "./ui.model";

/** One entry of the font picker: a CSS family list, and what to call it. */
export type FontOption = { value: string; label: string };
/** The dialog's form. `labelsText` is free-form — the labels are whitespace-separated. */
export type GlyphForm = Omit<GlyphSpec, "labels"> & { labelsText: string };

/** The families the app ships, always at the bottom of the picker. Spelled as CSS family lists,
 *  since that is what a canvas font shorthand takes. */
export const APP_FAMILIES: FontOption[] = [
  { value: '"Geist Mono", ui-monospace, monospace', label: "Geist Mono (app)" },
  { value: '"Instrument Serif", Georgia, serif', label: "Instrument Serif (display)" },
  { value: "system-ui, sans-serif", label: "System sans" },
  { value: "ui-monospace, monospace", label: "System mono" },
];
/** The nine CSS weights. A family that has fewer just snaps to its nearest. */
export const WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];

const FORM0: GlyphForm = {
  family: APP_FAMILIES[0].value,
  sizePx: 48,
  weight: 500,
  italic: false,
  color: "#ffffff",
  spacing: 0,
  labelsText: DIGITS.join(" "),
};

export const labelsOf = (form: GlyphForm) => form.labelsText.split(/\s+/).filter(Boolean);
const specOf = (form: GlyphForm): GlyphSpec => ({ ...form, labels: labelsOf(form) });

// ---- stores ----
/** null when closed, otherwise the layer whose frames the generator will replace. */
export const $glyphDialog = createStore<NodeId | null>(null);
export const $glyphForm = createStore<GlyphForm>(FORM0);
export const $fontOptions = createStore<FontOption[]>(APP_FAMILIES);
/** The strip the dialog draws, plus what the set costs in the file. */
export const $glyphPreview = createStore<{
  bitmaps: readonly ImageBitmap[];
  w: number;
  h: number;
  bytes: number;
} | null>(null);

// ---- events ----
export const glyphDialogOpened = createEvent<NodeId>();
export const glyphDialogClosed = createEvent();
export const glyphFormPatched = createEvent<Partial<GlyphForm>>();
export const fontFilePicked = createEvent<File>();
/** Ask for the machine's own font list — Chromium only, and behind a permission prompt. */
export const installedFontsRequested = createEvent();
export const glyphsGenerateRequested = createEvent();

// ---- effects ----
const previewFx = createEffect(async (form: GlyphForm) => ({
  form,
  sprites: await glyphSprites(specOf(form)),
}));
const registerFontFx = createEffect((file: File) => registerFont(file));
const localFontsFx = createEffect(() => localFamilies());

export const $localFontsPending = localFontsFx.pending;

// ---- business logic ----
sample({
  clock: glyphDialogOpened,
  target: $glyphDialog,
});
// Closed by the request the generator actually accepted, NOT by glyphsGenerateRequested: that
// one is also what the target is read from below, and clearing it on the same clock would race
// the read (declaration order decides who wins — it did, and the generate silently did nothing).
sample({
  clock: [glyphDialogClosed, glyphsRequested],
  fn: () => null,
  target: $glyphDialog,
});
/** What the widget being replaced has to hold: a value-indexed source fixes both the labels and
 *  their order (index = value), a number gets the ten digits, and a plain image whose source
 *  fixes nothing gets a single placeholder — one label, one static text sprite. */
sample({
  clock: glyphDialogOpened,
  source: $doc,
  fn: (doc, id) => {
    const l = doc ? findLayer(doc, id) : null;
    const fixed = l && l.kind !== "group" && l.kind !== "raw" ? FRAME_LABELS[l.meta.source] : null;
    const labels = fixed ?? (l?.kind === "image" ? ["Text"] : DIGITS);

    return { labelsText: labels.join(" ") };
  },
  target: glyphFormPatched,
});
sample({
  clock: glyphFormPatched,
  source: $glyphForm,
  fn: (form, patch) => ({ ...form, ...patch }),
  target: $glyphForm,
});

// Preview: re-rendered on every change of the form, including the seeding above.
sample({
  clock: $glyphForm,
  filter: (form) => labelsOf(form).length > 0,
  target: previewFx,
});
sample({
  clock: $glyphForm,
  filter: (form) => labelsOf(form).length === 0,
  fn: () => null,
  target: $glyphPreview,
});
// Rasterizing is async (a font may still be loading), so a slow render can land after a newer
// one — the form the render started from has to still be the current one. Reference equality is
// enough: every patch replaces the object.
sample({
  clock: previewFx.doneData,
  source: $glyphForm,
  filter: (form, done) => done.form === form,
  fn: (_, { sprites }) => ({
    bitmaps: sprites.map((s) => s.bitmap),
    w: sprites[0]?.resource.w ?? 0,
    h: sprites[0]?.resource.h ?? 0,
    bytes: sprites.reduce((n, s) => n + s.resource.data.length, 0),
  }),
  target: $glyphPreview,
});

// A font file the user picked goes to the top of the list and becomes the selection.
sample({
  clock: fontFilePicked,
  target: registerFontFx,
});
sample({
  clock: registerFontFx.done,
  source: $fontOptions,
  fn: (options, { params, result }) => [
    { value: result, label: params.name },
    ...options.filter((o) => o.value !== result),
  ],
  target: $fontOptions,
});
sample({
  clock: registerFontFx.doneData,
  fn: (family) => ({ family }),
  target: glyphFormPatched,
});
sample({
  clock: registerFontFx.fail,
  fn: ({ params }) => `${params.name} is not a font the browser can read`,
  target: errored,
});

// The installed families replace whatever was picked from a file — one source of truth in the
// list at a time. An empty answer is a denied permission (or a browser without the API), which
// is a normal outcome rather than a failure.
sample({
  clock: installedFontsRequested,
  target: localFontsFx,
});
sample({
  clock: localFontsFx.doneData,
  filter: (families) => families.length > 0,
  fn: (families) => [...families.map((f) => ({ value: `"${f}"`, label: f })), ...APP_FAMILIES],
  target: $fontOptions,
});
sample({
  clock: localFontsFx.doneData,
  filter: (families) => families.length > 0,
  fn: (families) => ({ family: `"${families[0]}"` }),
  target: glyphFormPatched,
});
sample({
  clock: localFontsFx.doneData,
  filter: (families) => families.length === 0,
  fn: () => "No access to installed fonts — upload a font file instead",
  target: errored,
});

// Frames only: the accent flag and the data source are the inspector's own controls.
sample({
  clock: glyphsGenerateRequested,
  source: { target: $glyphDialog, form: $glyphForm },
  filter: ({ target, form }) => Boolean(target) && labelsOf(form).length > 0,
  fn: ({ target, form }) => ({ target: target!, ...specOf(form) }),
  target: glyphsRequested,
});
