// Effector model of the editor. The `face` tree stays mutable (the canvas reads it
// via rAF + getState), but every change goes through an event and returns a new
// store root — that's enough for Svelte components to update.
import { createEffect, createEvent, createStore, sample } from "effector";
import {
  parseBin,
  buildBin,
  TAG,
  hex,
  unhex,
  type Face,
  type FaceNode,
  type Resource,
} from "../lib/wf";
import { render } from "../lib/render";
import { PREVIEW, SCREEN } from "../lib/screen";
import {
  buildBind,
  collectIds,
  defaultSim,
  FRAME_LABELS,
  isSlotSel,
  parseBind,
  SLOT_SEL_ID,
  type Sim,
} from "../lib/sources";
import {
  accentBitmapFor,
  accentFlaggedResources,
  bitmapOf,
  blankFrame,
  filterOf,
  flushResized,
  invertResource,
  opaqueBlack,
  regenPreviews,
  resourceFromFile,
} from "../lib/pixels";
import {
  blankFace,
  contains,
  containerOrigin,
  findParent,
  imagesUnder,
  newBind,
  newGroup,
  newRing,
  newSlot,
  newWidget,
  nodeOrigin,
  setFaceName,
  shiftNode,
  structOf,
  SLOT_METRICS,
  SLOT_SIZE,
  type WidgetKind,
} from "../lib/tree";

export type { Face, FaceNode, Resource, Sim };

export interface EditorState {
  face: Face | null;
  sel: FaceNode | null;
  screenTag: number;
  sim: Sim;
  ids: { id: number; max?: number }[];
  err: string;
  undoN: number;
  redoN: number;
  dirty: boolean;
  fileLabel: string;
}

// Figma-style alignment direction — see alignSelected below.
export type AlignDir = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

// ---- undo/redo live outside the store (only counters in the store; tree only, resources are out of history) ----
let undoStack: string[] = [],
  redoStack: string[] = [],
  lastCp = 0;
const snap = (s: EditorState) => JSON.stringify(s.face!.screens);

// ---- stores ----
export const $editor = createStore<EditorState>({
  face: null,
  sel: null,
  screenTag: TAG.main,
  sim: defaultSim(),
  ids: [],
  err: "",
  undoN: 0,
  redoN: 0,
  dirty: false,
  fileLabel: "",
});
// right-side panel tab (Properties/Simulator) — UI state, but driven by a model event (select),
// not a reactive read of $editor.sel: $editor changes on every simPatched (a simulator tweak),
// and if a node stayed selected from before, deriving off $editor.sel would flip the tab back
// to Properties on every input. Keyed off the select event itself instead.
export const $rightPanel = createStore<"props" | "sim">("props");

// ---- events ----
export const select = createEvent<FaceNode | null>();
export const screenTagSet = createEvent<number>();
export const checkpoint = createEvent<number | void>(); // payload: coalesce ms (default 600)
export const undo = createEvent();
export const redo = createEvent();
export const patched = createEvent<{
  node: FaceNode;
  patch: Partial<FaceNode>;
}>();
export const simPatched = createEvent<Partial<Sim>>();
export const overrideSet = createEvent<{
  id: number;
  value: number | string;
}>();
export const errored = createEvent<string>();
const faceLoaded = createEvent<{
  face: Face;
  label: string;
  dirty?: boolean;
}>();
const treeChanged = createEvent<(s: EditorState) => void>(); // tree mutation after checkpoint
export const rightPanelSet = createEvent<"props" | "sim">();
export const loadRequested = createEvent<{
  buf: ArrayBuffer | Uint8Array;
  label: string;
}>();
// fired on any successful load (drag-drop import, or opened from the marketplace) — pages that
// need to react (e.g. navigate once the face is ready) subscribe; others just ignore it
export const loadDone = createEvent<{ face: Face; label: string }>();
export const newFaceRequested = createEvent<string | void>();
export const importFacerRequested = createEvent<File[]>();

export interface AddWidget {
  kind: WidgetKind;
  files: File[];
}

export const addWidgetRequested = createEvent<AddWidget>();
export const replaceImageRequested = createEvent<{
  resIdx: number;
  file: File;
}>();
export const invertColorsRequested = createEvent();
export const addSlotRequested = createEvent();
// meta byte 9 — the data source a widget reads. Not a plain `patched` because the value-indexed
// sources also fix the widget's frame count, see sourceIdFx.
export const sourceIdSet = createEvent<{ node: FaceNode; id: number }>();
export const adjustImageRequested = createEvent<{
  node: FaceNode;
  adjust: Resource["adjust"];
}>();
// node: the widget node (or its struct); w/h: target size of its FIRST frame
export const resizeImageRequested = createEvent<{
  node: FaceNode;
  w: number;
  h: number;
}>();

// ---- effects ----
const loadBufferFx = createEffect(
  async ({ buf, label }: { buf: ArrayBuffer | Uint8Array; label: string }) => {
    const face = parseBin(buf);

    for (const r of face.resources) r.bitmap = await bitmapOf(r);
    return { face, label };
  },
);
// Facer and WatchMaker exports are both directories, and tell each other apart by their
// manifest — no need to make the user pick the format they downloaded.
const importFacerFx = createEffect(async (files: File[]) => {
  const has = (n: string) => files.some((f) => (f.webkitRelativePath || f.name).endsWith(n));
  const wm = has("watch.pxml");
  const toFace = wm
    ? (await import("../lib/watchmaker")).watchmakerToFace
    : (await import("../lib/facer")).facerToFace;

  if (!wm && !has("watchface.json"))
    throw new Error("not a watchface export: no watchface.json (Facer) or watch.pxml (WatchMaker)");
  const { face, skipped } = await toFace(files);

  for (const r of face.resources) if (!r.bitmap) r.bitmap = await bitmapOf(r);
  return { face, label: wm ? "watchmaker" : "facer", dirty: true, skipped };
});

export const $loading = loadBufferFx.pending;

// serialized — faceLoaded (reapplying the current color to a freshly parsed face) and a
// simPatched({accentColor}) can fire back-to-back; without a queue whichever promise
// resolves last wins, regardless of call order
let accentQueue = Promise.resolve();

const accentFx = createEffect(({ face, color }: { face: Face; color: string | null }) => {
  const flagged = color ? accentFlaggedResources(face) : null;

  accentQueue = accentQueue
    .then(() =>
      Promise.all(
        face.resources.map(async (r, i) => {
          r.accentBitmap = color && flagged!.has(i) ? await accentBitmapFor(r, color) : undefined;
        }),
      ),
    )
    .then(() => {});
  return accentQueue;
});

const newFaceFx = createEffect(async (name: string = "Custom") => ({
  face: blankFace(name, await opaqueBlack(PREVIEW, PREVIEW), await opaqueBlack(SCREEN, SCREEN)),
  label: "new",
  dirty: true,
}));

const addWidgetFx = createEffect(async ({ kind, files }: AddWidget) => {
  const s = $editor.getState();

  if (!s.face || !files.length) return;
  checkpoint(0);
  const face = s.face;
  const scr = face.screens.find((x) => x.tag === s.screenTag) || face.screens[0];
  const imgs: number[] = [];

  for (const file of files) {
    imgs.push(face.resources.push(await resourceFromFile(file, 5)) - 1);
  }
  const node = newWidget(kind, imgs, face.resources[imgs[0]]);

  treeChanged((st) => {
    scr.subs!.push(node);
    st.sel = node;
    st.ids = collectIds(st.face!);
  });
});

// Frames dropped by a shrinking source change, keyed by the struct they belonged to. Switching
// month (12 frames) -> weekday (7) trims the run but keeps the originals here, so switching back
// restores the art instead of 12 blanks. Cleared as soon as the selection moves to another layer
// (see the `select` sample) — that's the point where the trim becomes permanent.
let frameStash = new Map<FaceNode, number[]>();

// A value-indexed frame set (AM/PM, weekday, month) has a length the format fixes: the widget
// draws images[value % count], so a 7-frame set bound to `month` shows the wrong art for five
// months of the year. Picking one of those sources therefore resizes the run to match — missing
// slots become transparent placeholders to drop art on, extra ones are trimmed (and stashed).
const sourceIdFx = createEffect(async ({ node, id }: { node: FaceNode; id: number }) => {
  const { face } = $editor.getState();
  const st = structOf(node);

  if (!face || !st?.meta) return;
  const meta = unhex(st.meta);

  meta[9] = id;
  const need = FRAME_LABELS[id]?.length;
  const src = frameStash.get(st) ?? st.images;
  let next = src && need ? src.slice(0, need) : undefined;

  if (src?.length && need && need > src.length) {
    // frames are stored as a base offset + count, so the run has to stay consecutive
    // (refTailBytes rejects anything else) — a longer set means a fresh run at the end of the
    // resource table. ponytail: the old run stays in the file as dead weight, same as a deleted
    // widget's; a resource GC pass over the whole tree is the fix if files ever get fat.
    const first = face.resources[src[0]];
    const base = face.resources.length;

    for (let i = 0; i < need; i++)
      face.resources.push(
        i < src.length ? { ...face.resources[src[i]] } : await blankFrame(first.w, first.h),
      );
    next = Array.from({ length: need }, (_, i) => base + i);
  }
  if (src && next) frameStash.set(st, src.length >= next.length ? src : next);
  checkpoint();
  treeChanged((s) => {
    st.meta = hex(meta);
    if (next) st.images = next;
    s.ids = collectIds(s.face!);
  });
});

// A widget slot needs one placeholder + one icon per metric, so unlike the group/ring it can't
// be a plain synchronous factory — the blank frames have to be encoded first.
const addSlotFx = createEffect(async () => {
  const s = $editor.getState();

  if (!s.face) return;
  const face = s.face;
  const scr = face.screens.find((x) => x.tag === s.screenTag) || face.screens[0];
  // slotIndex is the node's position among the screen's existing slots — that's what the
  // 0x79 + slotIndex condition on its sibling groups is keyed to (zero exceptions in the corpus)
  let slots = 0;
  const tally = (n: FaceNode) => {
    if (n.tag === 0x85) slots++;
    n.subs?.forEach(tally);
  };

  scr.subs?.forEach(tally);
  const base = face.resources.length;

  for (let i = 0; i <= SLOT_METRICS.length; i++)
    face.resources.push(await blankFrame(SLOT_SIZE, SLOT_SIZE));
  const node = newSlot(
    slots,
    Array.from({ length: SLOT_METRICS.length + 1 }, (_, i) => base + i),
  );

  checkpoint(0);
  treeChanged((st) => {
    scr.subs!.push(node);
    st.sel = node;
    st.ids = collectIds(st.face!);
  });
});

const replaceImageFx = createEffect(async ({ resIdx, file }: { resIdx: number; file: File }) => {
  const { face } = $editor.getState();
  const r = face!.resources[resIdx];

  if (r.cf === 1) {
    // JPEG stays JPEG — the file's own bytes are the resource
    const data = new Uint8Array(await file.arrayBuffer());
    const bitmap = await createImageBitmap(new Blob([data], { type: "image/jpeg" }));

    // the uploaded file is the new original — drop any pinned resize source
    treeChanged(() =>
      Object.assign(r, { data, w: bitmap.width, h: bitmap.height, bitmap, srcBitmap: undefined }),
    );
    return;
  }
  const fresh = await resourceFromFile(file, r.cf);

  treeChanged(() => Object.assign(r, fresh, { srcBitmap: undefined }));
});

// A widget is drawn 1:1 from its resource (the format has no draw-time scale), so a resize
// really is a rescale of the pixels. Encoding them is deferred: resize only rescales the
// bitmap off r.srcBitmap (the untouched original), so shrinking and growing again costs no
// quality, and flushResized re-encodes from that same source when the file is built.
const resizeImageFx = createEffect(
  async ({ node, w, h }: { node: FaceNode; w: number; h: number }) => {
    const { face } = $editor.getState();
    const st = structOf(node);
    const imgs = st?.images;

    if (!face || !imgs?.length) return;
    const dim = (v: number) => Math.max(1, Math.min(2047, Math.round(v))); // 11-bit fields, see encodePixels
    const tw = dim(w),
      th = dim(h);
    const r0 = face.resources[imgs[0]];

    if (!r0 || (tw === r0.w && th === r0.h)) return;
    const sx = tw / r0.w,
      sy = th / r0.h;

    // every frame of a multi-frame widget (digits, weekday icons) scales by the same ratio
    for (const ri of new Set(imgs)) {
      const r = face.resources[ri];

      if (!r) continue;
      r.srcBitmap ??= r.bitmap ?? (await bitmapOf(r)); // first resize pins the original
      const rw = ri === imgs[0] ? tw : dim(r.w * sx),
        rh = ri === imgs[0] ? th : dim(r.h * sy);

      Object.assign(r, {
        w: rw,
        h: rh,
        // always off the ORIGINAL, so shrink-then-grow is lossless
        bitmap: await createImageBitmap(r.srcBitmap, {
          resizeWidth: rw,
          resizeHeight: rh,
          resizeQuality: "high",
        }),
        // stale accent tint would keep the old size — accentFx recomputes it on done below
        accentBitmap: undefined,
      });
    }
    const pivot = node.subs?.find((s) => s.tag === TAG.pivot);

    treeChanged(() => {
      // a hand rotates around x+pivot — scale the pivot with the art and shift x/y so the
      // rotation center stays put, otherwise the hand jumps off the dial on every resize
      if (pivot && st?.x != null) {
        const px = Math.round(pivot.pivotX! * sx),
          py = Math.round(pivot.pivotY! * sy);

        st.x += pivot.pivotX! - px;
        st.y = (st.y || 0) + pivot.pivotY! - py;
        pivot.pivotX = px;
        pivot.pivotY = py;
      }
    });
  },
);

// Brightness/contrast/saturation of a widget's frames. Non-destructive: the untouched pixels
// are pinned in srcBitmap (same slot the resize uses) and every move re-filters from there, so
// dragging a slider back to 100 restores the original exactly. Only the preview bitmap is
// rebuilt here — the .bin gets the filter re-applied once, in flushResized.
const adjustImageFx = createEffect(
  async ({ node, adjust }: { node: FaceNode; adjust: Resource["adjust"] }) => {
    const { face } = $editor.getState();
    const st = structOf(node);

    if (!face || !st?.images?.length) return;
    for (const ri of new Set(st.images)) {
      const r = face.resources[ri];

      if (!r) continue;
      r.srcBitmap ??= r.bitmap ?? (await bitmapOf(r));
      r.adjust = adjust;
      const c = new OffscreenCanvas(r.w, r.h);
      const cx = c.getContext("2d")!;

      cx.filter = filterOf(r);
      cx.drawImage(r.srcBitmap, 0, 0, r.w, r.h);
      r.bitmap = await createImageBitmap(c);
      r.accentBitmap = undefined; // computed off the old pixels
    }
  },
);

// Invert the pixels of every image under the selection (or the whole current screen when
// nothing is selected) — the quick way to turn a light layout into an AOD-friendly dark one.
// Involutive: hit it twice to get back. Resources shared with another screen are cloned first,
// so inverting the AOD can't repaint the main screen.
const invertColorsFx = createEffect(async () => {
  const { face, sel, screenTag } = $editor.getState();

  if (!face) return;
  const roots = sel ? [sel] : face.screens.filter((s) => s.tag === screenTag);
  const mine = new Set<number>();

  roots.forEach((r) => imagesUnder(r, mine));
  const outside = new Set<number>();
  const walkOutside = (n: FaceNode) => {
    if (roots.includes(n)) return;
    n.images?.forEach((i) => outside.add(i));
    n.subs?.forEach(walkOutside);
  };

  face.screens.forEach(walkOutside);
  const remap = new Map<number, number>();

  for (const i of mine) {
    if (outside.has(i)) remap.set(i, face.resources.push({ ...face.resources[i] }) - 1);
  }
  if (remap.size) {
    const repoint = (n: FaceNode) => {
      if (n.images) n.images = n.images.map((i) => remap.get(i) ?? i);
      n.subs?.forEach(repoint);
    };

    checkpoint(0);
    treeChanged(() => roots.forEach(repoint));
  }
  for (const idx of mine) {
    const r = face.resources[remap.get(idx) ?? idx];

    if (r) await invertResource(r);
  }
});

// ---- imperative actions ----
// deleteWidget/alignSelected/buildCurrentBin/previewBlob/exportBin below stay as plain functions
// reading $editor.getState() directly: they're one-shot imperative actions fired straight from a
// component event handler (not data derived from a clock), so there's no sample() clock to hang
// them on — the mutations they trigger (checkpoint/treeChanged/patched) still go through events.
export function deleteWidget() {
  const s = $editor.getState();

  if (!s.sel || !s.face) return;
  const p = findParent(s.face.screens, s.sel);

  if (!p) return;
  checkpoint(0);
  treeChanged((st) => {
    p.subs!.splice(p.subs!.indexOf(st.sel!), 1);
    st.sel = null;
    // ponytail: orphaned resources stay in the file — harmless to the watch, space is cheap
  });
}

/** Layers that need no bitmap at all: an empty group, or a procedural progress ring. Their
 *  file-bearing counterparts go through addWidgetFx instead (it has to read the images first). */
export function addNode(kind: "group" | "ring") {
  const s = $editor.getState();

  if (!s.face) return;
  const scr = s.face.screens.find((x) => x.tag === s.screenTag) || s.face.screens[0];
  const node = kind === "group" ? newGroup() : newRing();

  checkpoint(0);
  treeChanged((st) => {
    scr.subs!.push(node);
    st.sel = node;
    st.ids = collectIds(st.face!);
  });
}

/** Add/remove the selected layer's visibility condition (tag 0x02). The entries themselves are
 *  edited as hex in the props panel — a per-entry editor can come later if anyone asks. */
export function toggleCondition(node: FaceNode) {
  const s = $editor.getState();
  const existing = node.subs?.find((n) => n.tag === TAG.bind);

  if (!s.face || (!existing && !node.subs)) return; // a leaf (struct/pivot) can't carry one
  checkpoint(0);
  treeChanged((st) => {
    if (existing) node.subs!.splice(node.subs!.indexOf(existing), 1);
    else node.subs!.push(newBind());
    st.ids = collectIds(st.face!);
  });
}

/** Bind a layer to one metric of one widget slot — the inverse direction of the link, and the
 *  one the format actually stores: the slot's own 0x5f only says which metric is selected, and
 *  it's each candidate layer that carries the condition deciding whether it shows.
 *  Rewrites only the slot-selection entry (id 0x79 + slotIndex), leaving any real metric
 *  conditions on the same node alone; `slot: null` unbinds. op 0x81 matches the corpus. */
export function setSlotBind(node: FaceNode, slot: number | null, metric = 0) {
  const s = $editor.getState();

  if (!s.face || !node.subs) return;
  const bind = node.subs.find((n) => n.tag === TAG.bind);
  const kept = parseBind(bind?.hex).filter((e) => !isSlotSel(e.id));
  const next = slot == null ? kept : [...kept, { id: SLOT_SEL_ID + slot, op: 0x81, val: metric }];

  checkpoint(0);
  treeChanged((st) => {
    if (!next.length) {
      if (bind) node.subs!.splice(node.subs!.indexOf(bind), 1);
    } else if (bind) bind.hex = buildBind(next);
    else node.subs!.push({ tag: TAG.bind, hex: buildBind(next) });
    st.ids = collectIds(st.face!);
  });
}

// ponytail: the copy shares its resource indices with the original, so resize/adjust/invert on
// one hits both. Splitting them means cloning every frame — do it if that ever surprises anyone.
export function duplicateSelected() {
  const s = $editor.getState();

  if (!s.sel || !s.face) return;
  const p = findParent(s.face.screens, s.sel);

  if (!p) return;
  const copy = structuredClone(s.sel);

  checkpoint(0);
  treeChanged((st) => {
    p.subs!.splice(p.subs!.indexOf(st.sel!) + 1, 0, copy);
    st.sel = copy;
  });
}

/** Wrap the selection in a new group, in place. ponytail: screen-level only — a group nested in
 *  another group is laid out by the parent's flex rules (x=0 means "center me", see drawGroup),
 *  so the wrapper couldn't keep its child where it was without solving that layout first. */
export function groupSelected() {
  const s = $editor.getState();

  if (!s.sel || !s.face) return;
  const p = findParent(s.face.screens, s.sel);

  if (!p || (p.tag !== TAG.main && p.tag !== TAG.aod)) return;
  const g = newGroup();

  checkpoint(0);
  treeChanged((st) => {
    p.subs!.splice(p.subs!.indexOf(st.sel!), 1, g);
    g.subs!.push(st.sel!);
    st.sel = g;
  });
}

/** Dissolve the selected group, lifting its children into the parent at the group's own slot.
 *  ponytail: AUTO children (meta.w 0x8000) were positioned by the group's flex row and ignore
 *  x/y entirely, so they land wherever their raw coordinates say — re-place them by hand. */
export function ungroupSelected() {
  const s = $editor.getState();
  const g = s.sel;

  if (!s.face || g?.tag !== TAG.group) return;
  const p = findParent(s.face.screens, g);

  if (!p) return;
  const o = nodeOrigin(g) || { x: 0, y: 0 };
  const kids = (g.subs || []).filter((n) => n.tag !== TAG.frame && n.tag !== TAG.bind);

  checkpoint(0);
  treeChanged((st) => {
    kids.forEach((k) => shiftNode(k, o.x, o.y));
    p.subs!.splice(p.subs!.indexOf(g), 1, ...kids);
    st.sel = kids[0] ?? null;
  });
}

// Drop a node next to `target` (subs order is draw order, so within one parent this is
// z-ordering), or INTO it when `into` — that's how a layer gets into a group.
// A child's x/y is measured from its container's frame, so a cross-parent move shifts the node
// by the difference of the two origins and it stays visually put. AUTO children (meta.w 0x8000)
// are placed by the group's flex row and ignore x/y — moving one out drops it at its raw
// coordinates, same caveat as ungroupSelected.
export function moveNode(node: FaceNode, target: FaceNode, after: boolean, into = false) {
  const s = $editor.getState();

  if (!s.face || node === target || contains(node, target)) return;
  const from = findParent(s.face.screens, node);
  const to = into ? target : findParent(s.face.screens, target);

  if (!from || !to) return;
  checkpoint(0);
  treeChanged(() => {
    const subs = (to.subs ??= []);

    from.subs!.splice(from.subs!.indexOf(node), 1);
    subs.splice(into ? subs.length : subs.indexOf(target) + (after ? 1 : 0), 0, node);
    if (from !== to) {
      const a = containerOrigin(s.face!.screens, from),
        b = containerOrigin(s.face!.screens, to);

      shiftNode(node, a.x - b.x, a.y - b.y);
    }
  });
}

export function renameFace(name: string) {
  const s = $editor.getState();

  if (!s.face || name === s.face.name) return;
  checkpoint();
  treeChanged((st) => setFaceName(st.face!, name));
}

// Reorder a widget's frames — for value-indexed sets (weekday, month, AM/PM, digits) the
// index IS the value, so this is how a set imported in the wrong order gets fixed.
// A widget's frames are stored as a base resource offset + count, so `images` HAS to stay a
// consecutive ascending run (buildBin's refTailBytes rejects anything else). Permuting the
// index list would therefore build a file the format can't express — what moves is the
// resources themselves, inside the window the widget already owns.
// ponytail: assumes the run isn't shared with another widget (nothing in the corpus shares
// one) — scan the tree for overlapping runs here if a face ever turns up that does.
export function moveImage(node: FaceNode, from: number, to: number) {
  const imgs = node.images;
  const face = $editor.getState().face;

  if (!face || !imgs || from === to) return;
  if (imgs[from] === undefined || to < 0 || to >= imgs.length) return;
  checkpoint(0);
  treeChanged(() => {
    const frames = imgs.map((ri) => face.resources[ri]);
    const [moved] = frames.splice(from, 1);

    frames.splice(to, 0, moved);
    imgs.forEach((ri, i) => (face.resources[ri] = frames[i]));
  });
}

// Figma-style alignment: nudge the selected node so its RENDERED bounding box lands on the
// container's edge/center. The container is the parent group's frame when the node is a
// group child (Figma aligns relative to the parent), the screen otherwise. Delta-based off
// the render hits, so it works uniformly for groups (frame x/y), widgets (struct x/y) and
// grouped children whose drawn position differs from their raw x/y. Widget x/y may go
// negative (int16, see wf.ts); group frames stay clamped to >=0 — their x/y is unsigned in
// the file. ponytail: AUTO (meta.w 0x8000) children ignore x/y entirely, so they don't move.
export function alignSelected(dir: AlignDir) {
  const s = $editor.getState();

  if (!s.face || !s.sel) return;
  const sel = s.sel;
  const c = document.createElement("canvas");

  c.width = c.height = SCREEN;
  let parent: FaceNode | null = null;
  const walk = (n: FaceNode) => {
    if (n.tag === TAG.group && n.subs?.includes(sel)) parent = n;
    n.subs?.forEach(walk);
  };

  for (const scr of s.face.screens) walk(scr);

  const pass = (): boolean => {
    const hits = render(c.getContext("2d")!, s.face!, s.screenTag, s.sim);
    const h = hits.findLast((h) => h.node === sel);

    if (!h) return false;
    let cont = { x: 0, y: 0, w: SCREEN, h: SCREEN };

    if (parent) {
      const ph = hits.findLast((x) => x.node === parent);
      // auto-sized frames report w/h 0 — fall back to the screen for those
      if (ph) cont = { x: ph.x, y: ph.y, w: ph.w || SCREEN, h: ph.h || SCREEN };
    }
    let dx =
      dir === "left"
        ? cont.x - h.x
        : dir === "hcenter"
          ? Math.round(cont.x + (cont.w - h.w) / 2 - h.x)
          : dir === "right"
            ? cont.x + cont.w - h.w - h.x
            : 0;
    let dy =
      dir === "top"
        ? cont.y - h.y
        : dir === "vcenter"
          ? Math.round(cont.y + (cont.h - h.h) / 2 - h.y)
          : dir === "bottom"
            ? cont.y + cont.h - h.h - h.y
            : 0;
    // a hand's bbox rotates with the live angle — centering means "pivot on container
    // center", not "AABB centered" (which would drift with the current second)
    const pivot = sel.subs?.find((n) => n.tag === TAG.pivot);
    const pst = pivot && sel.subs?.find((n) => n.tag === TAG.struct);

    if (pivot && pst) {
      if (dir === "hcenter") dx = Math.round(cont.x + cont.w / 2) - pivot.pivotX! - pst.x!;
      if (dir === "vcenter") dy = Math.round(cont.y + cont.h / 2) - pivot.pivotY! - pst.y!;
    }
    if (!dx && !dy) return false;
    if (sel.tag === TAG.group) {
      const f = sel.subs!.find((n) => n.tag === TAG.frame)!;
      const v = unhex(f.hex!);
      const fx = Math.max(0, (v[0] | (v[1] << 8)) + dx),
        fy = Math.max(0, (v[2] | (v[3] << 8)) + dy);

      v[0] = fx;
      v[1] = fx >> 8;
      v[2] = fy;
      v[3] = fy >> 8;
      patched({ node: f, patch: { hex: hex(v) } });
    } else {
      const st = sel.subs?.find((n) => n.tag === TAG.struct);

      if (!st || st.x == null) return false;
      patched({ node: st, patch: { x: st.x + dx, y: (st.y || 0) + dy } });
    }
    return true;
  };

  checkpoint(0);
  // two passes: patching can change a coordinate's meaning mid-flight (a packed NUMBER's
  // y=0 draws frame-centered, but any nonzero y is literal — see drawGroup's rowCross), so
  // the first delta may land off-target; a second measure-and-nudge against the re-render
  // converges exactly for literal coordinates.
  if (pass()) pass();
}

// async because of flushResized — resized images are only re-encoded here, on the way out
export async function buildCurrentBin(): Promise<Uint8Array> {
  const s = $editor.getState();

  await flushResized(s.face!);
  if (s.dirty) regenPreviews(s.face!, s.sim); // embedded 0x28 previews = current render
  const out = buildBin(s.face!);

  parseBin(out); // self-check
  return out;
}

// PNG snapshot of the main screen, for marketplace cards
export function previewBlob(): Promise<Blob> {
  const { face, sim } = $editor.getState();
  const c = document.createElement("canvas");

  c.width = SCREEN;
  c.height = SCREEN;
  render(c.getContext("2d")!, face!, TAG.main, sim);
  return new Promise((res) => c.toBlob((b) => res(b!), "image/png"));
}

// Tiny JPEG data URL of the main screen, stored next to the flashed dial id so the watch's
// id-only list can show what each slot holds (see device/lib/catalog-names). 96px keeps it
// around 5 KB — previewBlob's full 466px PNG is ~100× that and localStorage is the sink.
export function previewThumb(): string {
  const { face, sim } = $editor.getState();
  const full = document.createElement("canvas");

  full.width = full.height = SCREEN;
  render(full.getContext("2d")!, face!, TAG.main, sim);
  const thumb = document.createElement("canvas");

  thumb.width = thumb.height = 96;
  thumb.getContext("2d")!.drawImage(full, 0, 0, 96, 96);
  return thumb.toDataURL("image/jpeg", 0.7);
}

export async function exportBin() {
  try {
    const out = await buildCurrentBin();
    const a = document.createElement("a");

    a.href = URL.createObjectURL(new Blob([out as BlobPart]));
    a.download = `${$editor.getState().face!.name || "watchface"}.bin`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    errored(`export: ${(e as Error).message}`);
  }
}

// ---- business logic ----
sample({
  clock: faceLoaded,
  source: $editor,
  fn: (s, { face, label, dirty = false }) => {
    undoStack = [];
    redoStack = [];
    lastCp = 0;
    return {
      ...s,
      face,
      sel: null,
      screenTag: TAG.main,
      ids: collectIds(face),
      fileLabel: label,
      err: "",
      dirty,
      undoN: 0,
      redoN: 0,
    };
  },
  target: $editor,
});
sample({
  clock: select,
  source: $editor,
  fn: (s, sel) => {
    // leaving a layer is what makes a source change's frame trim permanent — see frameStash
    if (sel !== s.sel) frameStash = new Map();
    return { ...s, sel };
  },
  target: $editor,
});
sample({
  clock: screenTagSet,
  source: $editor,
  fn: (s, screenTag) => ({ ...s, screenTag }),
  target: $editor,
});
sample({
  clock: checkpoint,
  source: $editor,
  fn: (s, coalesce) => {
    if (!s.face) return s;
    const now = Date.now();

    if (now - lastCp < (coalesce ?? 600)) return s;
    lastCp = now;
    undoStack.push(snap(s));
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    return { ...s, dirty: true, undoN: undoStack.length, redoN: 0 };
  },
  target: $editor,
});
sample({
  clock: undo,
  source: $editor,
  fn: (s) => {
    if (!undoStack.length || !s.face) return s;
    redoStack.push(snap(s));
    s.face.screens = JSON.parse(undoStack.pop()!);
    lastCp = 0;
    return {
      ...s,
      sel: null,
      undoN: undoStack.length,
      redoN: redoStack.length,
    };
  },
  target: $editor,
});
sample({
  clock: redo,
  source: $editor,
  fn: (s) => {
    if (!redoStack.length || !s.face) return s;
    undoStack.push(snap(s));
    s.face.screens = JSON.parse(redoStack.pop()!);
    lastCp = 0;
    return {
      ...s,
      sel: null,
      undoN: undoStack.length,
      redoN: redoStack.length,
    };
  },
  target: $editor,
});
sample({
  clock: patched,
  source: $editor,
  fn: (s, { node, patch }) => {
    Object.assign(node, patch);
    return { ...s };
  },
  target: $editor,
});
sample({
  clock: treeChanged,
  source: $editor,
  fn: (s, mutate) => {
    mutate(s);
    return { ...s };
  },
  target: $editor,
});
sample({
  clock: simPatched,
  source: $editor,
  fn: (s, patch) => ({ ...s, sim: { ...s.sim, ...patch } }),
  target: $editor,
});
sample({
  clock: overrideSet,
  source: $editor,
  fn: (s, { id, value }) => ({
    ...s,
    sim: { ...s.sim, overrides: { ...s.sim.overrides, [id]: value } },
  }),
  target: $editor,
});
sample({
  clock: errored,
  source: $editor,
  fn: (s, err) => ({ ...s, err }),
  target: $editor,
});

sample({
  clock: rightPanelSet,
  target: $rightPanel,
});
sample({
  clock: select,
  filter: Boolean,
  fn: () => "props" as const,
  target: $rightPanel,
});

sample({
  clock: loadRequested,
  target: loadBufferFx,
});
sample({
  clock: loadBufferFx.doneData,
  target: loadDone,
});
sample({
  clock: loadBufferFx.fail,
  fn: ({ params, error }) => `${params.label}: ${error.message}`,
  target: errored,
});

sample({
  clock: simPatched,
  source: $editor,
  filter: (s, patch) => "accentColor" in patch && Boolean(s.face),
  fn: (s, patch) => ({ face: s.face!, color: patch.accentColor ?? null }),
  target: accentFx,
});
sample({
  clock: faceLoaded,
  source: $editor,
  filter: (s) => Boolean(s.sim.accentColor),
  fn: (s, { face }) => ({ face, color: s.sim.accentColor! }),
  target: accentFx,
});
// PropsPanel's "tints with device accent color" checkbox flips meta[7] via `patched` — re-run
// so a live accent preview picks up the change immediately, not just on the next color pick
sample({
  clock: patched,
  source: $editor,
  filter: (s) => Boolean(s.face && s.sim.accentColor),
  fn: (s) => ({ face: s.face!, color: s.sim.accentColor! }),
  target: accentFx,
});

sample({
  clock: newFaceRequested,
  target: newFaceFx,
});
sample({
  clock: [loadBufferFx.doneData, newFaceFx.doneData, importFacerFx.doneData],
  target: faceLoaded,
});

sample({
  clock: importFacerRequested,
  target: importFacerFx,
});
sample({
  clock: importFacerFx.doneData,
  filter: ({ skipped }) => skipped.length > 0,
  fn: ({ skipped }) => `facer: skipped layers — ${skipped.join(", ")}`,
  target: errored,
});
sample({
  clock: importFacerFx.fail,
  fn: ({ error }) => `facer import: ${error.message}`,
  target: errored,
});

sample({
  clock: addWidgetFx.fail,
  fn: ({ error }) => `add widget: ${error.message}`,
  target: errored,
});
sample({
  clock: addWidgetRequested,
  target: addWidgetFx,
});

sample({
  clock: [replaceImageFx.done, resizeImageFx.done, invertColorsFx.done, adjustImageFx.done],
  source: $editor,
  fn: (s) => ({ ...s, dirty: true }),
  target: $editor,
});
sample({
  clock: adjustImageRequested,
  target: adjustImageFx,
});
sample({
  clock: adjustImageFx.fail,
  fn: ({ error }) => `image adjust: ${error.message}`,
  target: errored,
});
sample({
  clock: invertColorsRequested,
  target: invertColorsFx,
});
sample({
  clock: addSlotRequested,
  target: addSlotFx,
});
sample({
  clock: addSlotFx.fail,
  fn: ({ error }) => `add widget slot: ${error.message}`,
  target: errored,
});
sample({
  clock: sourceIdSet,
  target: sourceIdFx,
});
sample({
  clock: sourceIdFx.fail,
  fn: ({ error }) => `source: ${error.message}`,
  target: errored,
});
sample({
  clock: invertColorsFx.fail,
  fn: ({ error }) => `invert colors: ${error.message}`,
  target: errored,
});
sample({
  clock: replaceImageFx.fail,
  fn: ({ error }) => `image replace: ${error.message}`,
  target: errored,
});
sample({
  clock: resizeImageFx.fail,
  fn: ({ error }) => `image resize: ${error.message}`,
  target: errored,
});
sample({
  clock: replaceImageRequested,
  target: replaceImageFx,
});
sample({
  clock: resizeImageRequested,
  target: resizeImageFx,
});
// new pixels — the accent tint was computed off the old ones
sample({
  clock: [replaceImageFx.done, resizeImageFx.done],
  source: $editor,
  filter: (s) => Boolean(s.face && s.sim.accentColor),
  fn: (s) => ({ face: s.face!, color: s.sim.accentColor! }),
  target: accentFx,
});
