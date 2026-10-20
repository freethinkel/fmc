// The layers the editor creates from scratch. `edits.ts` changes layers that already exist;
// everything here mints a new one. Kept apart from doc.ts so the parser stays about reading the
// format and these stay about the editor's defaults — where a fresh widget lands, what a new
// ring gauges, which metrics a slot offers.

import { CENTER, SCREEN } from "../render/screen";
import { ARC_REST, type ArcSpec } from "../render/arc";
import {
  newImageId,
  newNodeId,
  type Condition,
  type Doc,
  type GroupLayer,
  type HandLayer,
  type ImageAsset,
  type ImageId,
  type ImageLayer,
  type Layer,
  type NumberLayer,
  type RingLayer,
  type Screen,
  type SlotLayer,
  type WidgetMeta,
} from "./doc";
import { TAG, hex, unhex, type Resource } from "../format";

const META0: WidgetMeta = {
  w: 0,
  h: 0,
  auto: false,
  source: 0,
  sub: 0,
  max: 0,
  rgb: [0, 0, 0],
  flags: 0,
  reserved: 0,
};

const metaWith = (extra: Partial<WidgetMeta>): WidgetMeta => ({ ...META0, ...extra });
const base = () => ({ id: newNodeId(), conditions: [] as readonly Condition[] });

/** A fresh image widget over already-added assets, centred. */
export const newImage = (frames: readonly ImageId[]): ImageLayer => ({
  ...base(),
  tag: 0x30,
  kind: "image",
  x: 183,
  y: 183,
  meta: META0,
  refType: 0x61,
  frames,
});

/** One frame per battery percent, 0..100: the image widget draws frames[value % count]. */
export const PROGRESS_STEPS = 101;

/** A progress line. The format has no linear gauge, so this borrows the node shape of the stock
 *  Analog__370__Hemisphere's battery-percent text: a plain image widget on battery (0x24) picking
 *  one of 101 pre-drawn frames (rotated '0%'..'100%' text there, not a gauge), meta copied from
 *  that face (max 100000, no w/h). Filling-bar frames on this picker are unverified on a watch.
 *  ponytail: battery only. Across the 100 stock faces every goal-percent id (0x25/0x26/0x46/
 *  0x49/0x6a/0x6c/0x6f/0x82) drives a 0x80/0x81 ring and nothing else — no 0x30 picker and no
 *  0x38 bucketed gauge (the tag Energetic/Vintage/Widgets/Tumbler draw battery and heart rate
 *  through, 7..26 frames). A picker on them, and how 0x38 buckets a value, needs a watch. */
export const newProgressLine = (frames: readonly ImageId[], w: number, h: number): ImageLayer => ({
  ...newImage(frames),
  x: CENTER - (w >> 1),
  y: CENTER - (h >> 1),
  meta: metaWith({ source: 0x24, max: 100000 }),
});

/** The progress line `l` is, or null for any other widget. Hemisphere's stock '0%'..'100%' text
 *  has the same meta and frame count, so the bar shape is what tells them apart.
 *  ponytail: shape heuristic (one side >= 4x the other); store a marker if a hand-made 101-frame
 *  battery strip ever gets mistaken for one. */
export function progressLineOf(doc: Doc, l: Layer): { vertical: boolean; full: ImageAsset } | null {
  if (l.kind !== "image" || l.meta.source !== 0x24 || l.frames.length !== PROGRESS_STEPS)
    return null;
  const full = doc.images.get(l.frames[PROGRESS_STEPS - 1]);

  if (!full || Math.max(full.w, full.h) < 4 * Math.min(full.w, full.h)) return null;
  return { vertical: full.h > full.w, full };
}

/** A step counter over a 10-glyph atlas. fmt byte 0x82 = two digits, zero-padded. */
export const newNumber = (glyphs: readonly ImageId[]): NumberLayer => ({
  ...base(),
  tag: TAG.number,
  kind: "number",
  x: 183,
  y: 217,
  meta: metaWith({ source: 0x19, max: 100000 }),
  refType: 0x61,
  glyphs,
  digits: 2,
  padZero: true,
});

/** A minute hand pivoted near the bottom of its own art, so it sweeps around the dial centre. */
export function newHand(frames: readonly ImageId[], first: { w: number; h: number }): HandLayer {
  const pivotX = first.w >> 1,
    pivotY = Math.round(first.h * 0.9);

  return {
    ...base(),
    tag: TAG.hand,
    kind: "hand",
    x: CENTER - pivotX,
    y: CENTER - pivotY,
    // source 0x0e is what makes the parser call this a minute hand (see handKinds)
    meta: metaWith({ source: 0x0e, max: 60 }),
    refType: 0x61,
    frames,
    pivotX,
    pivotY,
    pivotFlag: 1,
  };
}

/** An empty group: a 0,0 full-screen frame, so children keep the coordinates they already had
 *  (drawGroup adds the frame origin) and wrapping a widget doesn't move it. */
export const newGroup = (): GroupLayer => ({
  ...base(),
  tag: TAG.group,
  kind: "group",
  // 12 bytes past the align byte, always zero in the corpus — kept for an exact round trip
  frame: { x: 0, y: 0, w: SCREEN, h: SCREEN, main: 0, track: 0, rest: "0".repeat(24) },
  children: [],
});

/** A procedural progress ring: no bitmap at all — geometry and gauge live in the arc spec, the
 *  stroke color follows the device accent. 0x5b with the corpus's trailing bytes and a 2-byte
 *  struct tail is the shape the watch draws; `radius` is editor-side only from here on (0x5b
 *  writes none — see bareRing in doc.ts). */
export function newRing(): RingLayer {
  const d = 200;
  const spec: ArcSpec = {
    kind: TAG.arcClipped,
    min: 0,
    max: 100,
    start: 0,
    end: 360,
    width: 10,
    radius: d / 2,
    rest: ARC_REST,
  };

  return {
    ...base(),
    tag: 0x81,
    kind: "ring",
    x: CENTER - d / 2,
    y: CENTER - d / 2,
    // steps, as a percent-of-goal gauge; flags 4 + byte 4 = accent slot 1, the same color source
    // every stock imageless ring uses (a ring with no art has nothing else to stroke with)
    meta: metaWith({ w: d, h: d, source: 0x19, max: 100, flags: 4, rgb: [1, 0, 0] }),
    tail: "0000",
    spec,
    frames: [],
  };
}

/** What a fresh widget slot offers the wearer. Any set works — the list lives in the file, not
 *  the firmware — these are just the four the corpus's own slots lean on. */
/** Every metric id a stock slot offers, ordered by how often the corpus uses it (100 files, 14
 *  of them with slots, 23 slots). What each one means comes from ID_LABELS; the three that read
 *  as guesses there are guesses here too — the companion-app icons a face ships are its own art
 *  and are NOT laid out in metric order, so they can't be used to name the ids. */
export const SLOT_METRIC_CHOICES = [0x1c, 0x48, 0x24, 0x19, 0x76, 0x8b, 0x6a, 0x1a, 0x5f, 0x6d];
/** What a freshly added slot offers — the four the corpus's own slots lean on. */
export const SLOT_METRICS = [0x19, 0x1a, 0x1c, 0x24]; // steps, heart rate, calories, battery
export const SLOT_SIZE = 136; // the tile Function's slots use; meta w/h and the art both take it

/** A widget slot (0x85) — the tile the companion app lets the wearer point at one of several
 *  metrics. `frames[0]` is the on-watch "tap to configure" placeholder, `frames[1..]` the icons
 *  the companion app's own picker shows, so frames is one longer than the metric list. Nothing
 *  here draws on the watch face itself: the real per-metric visual is a sibling group gated by a
 *  condition on id 0x79 + index (see withSlotOverrides). */
export function newSlot(
  index: number,
  frames: readonly ImageId[],
  metrics: readonly number[] = SLOT_METRICS,
): SlotLayer {
  return {
    ...base(),
    tag: 0x85,
    kind: "slot",
    x: CENTER - SLOT_SIZE / 2,
    y: CENTER - SLOT_SIZE / 2,
    meta: metaWith({ w: SLOT_SIZE, h: SLOT_SIZE }),
    refType: 0x61,
    index,
    active: 0,
    metrics,
    frames,
    // the 0x5f body is a fixed 33 bytes; everything past the metric list is padding
    slotRest: "0".repeat(2 * (33 - 3 - metrics.length)),
  };
}

/** A visibility condition that starts out always-true (steps ≥ 0), for the props panel to edit. */
export const newCondition = (): Condition => ({ source: 0x19, op: "gte", value: 0 });

// The name lives in two places: `name`, which the marketplace record and the exported filename
// use, and the 16-byte header field, where it is cut to 15 bytes. `nameRaw` keeps the trailing
// byte (meaning unknown) so a round trip stays exact. The 0x86 node toLegacy writes is derived
// from `name`, so it needs nothing here.
export function withName(doc: Doc, name: string): Doc {
  const tail = doc.nameRaw ? unhex(doc.nameRaw)[15] : 0x0a;
  const head = new Uint8Array(16);

  new TextEncoder().encodeInto(name.slice(0, 14), head.subarray(0, 15));
  head[15] = tail;
  return { ...doc, name, nameRaw: hex(head) };
}

const assetOf = (r: Resource): ImageAsset => ({
  id: newImageId(),
  cf: r.cf,
  w: r.w,
  h: r.h,
  data: r.data,
});

/** A screen with nothing on it but the thumbnail the store list reads and a black background —
 *  the shape every screen in the corpus starts with, AOD included (a 0x28 preview, then art). */
export function blankScreen(
  kind: Screen["kind"],
  previewId: ImageId,
  backgroundId: ImageId,
): Screen {
  return {
    id: newNodeId(),
    kind,
    // no 0x86 name layer here — toLegacy synthesizes one from doc.name for every main screen
    layers: [
      {
        ...base(),
        tag: TAG.preview,
        kind: "raw",
        children: [
          {
            ...base(),
            tag: TAG.pvStruct,
            kind: "raw",
            prefix: "0000000000",
            refType: 0x61,
            frames: [previewId],
          },
        ],
      },
      {
        ...base(),
        tag: 0x30,
        kind: "image",
        x: 0,
        y: 0,
        meta: metaWith({ w: SCREEN, h: SCREEN }), // 466×466, no source, no accent
        refType: 0x61,
        frames: [backgroundId],
      },
    ],
  };
}

/** An empty face: one screen, a black background and the thumbnail the store list shows. */
export function blankDoc(name: string, preview: Resource, background: Resource): Doc {
  const nameRaw = new Uint8Array(16);

  new TextEncoder().encodeInto(name.slice(0, 14), nameRaw);
  nameRaw[15] = 0x0a; // same as CDN files, byte meaning not figured out

  const previewAsset = assetOf(preview),
    backgroundAsset = assetOf(background);
  const screen = blankScreen("main", previewAsset.id, backgroundAsset.id);

  return {
    name,
    nameRaw: hex(nameRaw),
    screens: [screen],
    images: new Map([
      [previewAsset.id, previewAsset],
      [backgroundAsset.id, backgroundAsset],
    ]),
  };
}
