// Effector model of the editor. The `face` tree stays mutable (the canvas reads it
// via rAF + getState), but every change goes through an event and returns a new
// store root — that's enough for Svelte components to update.
import { createEffect, createEvent, createStore, sample } from 'effector';
import { parseBin, buildBin, decodePixels, encodePixels, TAG, hex, unhex,
  type Face, type FaceNode, type Resource } from '../lib/wf';
import { defaultSim, collectIds, render, metaInfo, type Sim } from '../lib/render';

export type { Face, FaceNode, Resource, Sim };

export interface EditorState {
  face: Face | null;
  sel: FaceNode | null;
  screenTag: number;
  sim: Sim;
  ids: { id: number; max?: number }[];
  err: string;
  undoN: number; redoN: number;
  dirty: boolean;
  fileLabel: string;
}

// ---- events ----
export const select = createEvent<FaceNode | null>();
export const screenTagSet = createEvent<number>();
export const checkpoint = createEvent<number | void>(); // payload: coalesce ms (default 600)
export const undo = createEvent();
export const redo = createEvent();
export const patched = createEvent<{ node: FaceNode; patch: Partial<FaceNode> }>();
export const simPatched = createEvent<Partial<Sim>>();
export const overrideSet = createEvent<{ id: number; value: number | string }>();
export const errored = createEvent<string>();
const faceLoaded = createEvent<{ face: Face; label: string; dirty?: boolean }>();
const treeChanged = createEvent<(s: EditorState) => void>(); // tree mutation after checkpoint

// ---- undo/redo live outside the store (only counters in the store; tree only, resources are out of history) ----
let undoStack: string[] = [], redoStack: string[] = [], lastCp = 0;
const snap = (s: EditorState) => JSON.stringify(s.face!.screens);

export const $editor = createStore<EditorState>({
  face: null, sel: null, screenTag: TAG.main, sim: defaultSim(), ids: [], err: '',
  undoN: 0, redoN: 0, dirty: false, fileLabel: '',
});

sample({
  clock: faceLoaded,
  source: $editor,
  fn: (s, { face, label, dirty = false }) => {
    undoStack = []; redoStack = []; lastCp = 0;
    return {
      ...s, face, sel: null, screenTag: TAG.main, ids: collectIds(face),
      fileLabel: label, err: '', dirty, undoN: 0, redoN: 0,
    };
  },
  target: $editor,
});
sample({ clock: select, source: $editor, fn: (s, sel) => ({ ...s, sel }), target: $editor });
sample({ clock: screenTagSet, source: $editor, fn: (s, screenTag) => ({ ...s, screenTag }), target: $editor });
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
  fn: s => {
    if (!undoStack.length || !s.face) return s;
    redoStack.push(snap(s));
    s.face.screens = JSON.parse(undoStack.pop()!);
    lastCp = 0;
    return { ...s, sel: null, undoN: undoStack.length, redoN: redoStack.length };
  },
  target: $editor,
});
sample({
  clock: redo,
  source: $editor,
  fn: s => {
    if (!redoStack.length || !s.face) return s;
    undoStack.push(snap(s));
    s.face.screens = JSON.parse(redoStack.pop()!);
    lastCp = 0;
    return { ...s, sel: null, undoN: undoStack.length, redoN: redoStack.length };
  },
  target: $editor,
});
sample({
  clock: patched,
  source: $editor,
  fn: (s, { node, patch }) => { Object.assign(node, patch); return { ...s }; },
  target: $editor,
});
sample({
  clock: treeChanged,
  source: $editor,
  fn: (s, mutate) => { mutate(s); return { ...s }; },
  target: $editor,
});
sample({ clock: simPatched, source: $editor, fn: (s, patch) => ({ ...s, sim: { ...s.sim, ...patch } }), target: $editor });
sample({
  clock: overrideSet,
  source: $editor,
  fn: (s, { id, value }) => ({
    ...s, sim: { ...s.sim, overrides: { ...s.sim.overrides, [id]: value } },
  }),
  target: $editor,
});
sample({ clock: errored, source: $editor, fn: (s, err) => ({ ...s, err }), target: $editor });

// right-side panel tab (Properties/Simulator) — UI state, but driven by a model event (select),
// not a reactive read of $editor.sel: $editor changes on every simPatched (a simulator tweak),
// and if a node stayed selected from before, deriving off $editor.sel would flip the tab back
// to Properties on every input. Keyed off the select event itself instead.
export const $rightPanel = createStore<'props' | 'sim'>('props');
export const rightPanelSet = createEvent<'props' | 'sim'>();
sample({ clock: rightPanelSet, target: $rightPanel });
sample({ clock: select, filter: Boolean, fn: () => 'props' as const, target: $rightPanel });

// ---- loading ----
export async function bitmapOf(r: Resource): Promise<ImageBitmap> {
  const px = decodePixels(r);
  return px
    ? createImageBitmap(new ImageData(px, r.w, r.h))
    : createImageBitmap(new Blob([r.data as BlobPart], { type: 'image/jpeg' }));
}

const loadBufferFx = createEffect(
  async ({ buf, label }: { buf: ArrayBuffer | Uint8Array; label: string }) => {
    const face = parseBin(buf);
    for (const r of face.resources) r.bitmap = await bitmapOf(r);
    return { face, label };
  });

export const loadRequested = createEvent<{ buf: ArrayBuffer | Uint8Array; label: string }>();
sample({ clock: loadRequested, target: loadBufferFx });
export const $loading = loadBufferFx.pending;
// fired on any successful load (drag-drop import, or opened from the marketplace) — pages that
// need to react (e.g. navigate once the face is ready) subscribe; others just ignore it
export const loadDone = createEvent<{ face: Face; label: string }>();
sample({ clock: loadBufferFx.doneData, target: loadDone });

// which resource indices are accent-tintable: struct.meta[7]===4 (metaInfo's `accent` field)
// — a real per-widget capability flag, confirmed against 7 real-device test cases including
// ones where the accent widget is baked plain white (not a color to pattern-match at all).
// Supersedes the old pixel-color guessing entirely — see docs/cmf-protocol.md "Accent color".
function accentFlaggedResources(face: Face): Set<number> {
  const flagged = new Set<number>();
  const walk = (n: FaceNode) => {
    if (n.tag === TAG.struct && n.images && metaInfo(n).accent) {
      n.images.forEach(i => flagged.add(i));
    }
    n.subs?.forEach(walk);
  };
  face.screens.forEach(walk);
  return flagged;
}

// preview-only recolor of an accent-flagged resource: replace every non-transparent pixel's
// RGB with the chosen color (alpha untouched) — the flag identifies the whole resource as
// tintable regardless of its baked color, so there's no per-pixel color test here. Never
// touches r.data — the exported .bin must keep the original bytes for the real watch to
// substitute its own accent color.
async function accentBitmapFor(r: Resource, colorHex: string): Promise<ImageBitmap | undefined> {
  const px = decodePixels(r);
  if (!px) return undefined; // cf=1 (JPEG) — no per-pixel recolor
  const n = parseInt(colorHex.slice(1), 16);
  const cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
  let changed = false;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) {
      px[i] = cr; px[i + 1] = cg; px[i + 2] = cb;
      changed = true;
    }
  }
  return changed ? createImageBitmap(new ImageData(px, r.w, r.h)) : undefined;
}

// serialized — faceLoaded (reapplying the current color to a freshly parsed face) and a
// simPatched({accentColor}) can fire back-to-back; without a queue whichever promise
// resolves last wins, regardless of call order
let accentQueue = Promise.resolve();
function queueAccent(face: Face, color: string | null) {
  const flagged = color ? accentFlaggedResources(face) : null;
  accentQueue = accentQueue.then(() => Promise.all(face.resources.map(async (r, i) => {
    r.accentBitmap = color && flagged!.has(i) ? await accentBitmapFor(r, color) : undefined;
  }))).then(() => {});
  return accentQueue;
}

const accentFx = createEffect(({ face, color }: { face: Face; color: string | null }) =>
  queueAccent(face, color));

sample({
  clock: simPatched,
  source: $editor,
  filter: (s, patch) => 'accentColor' in patch && !!s.face,
  fn: (s, patch) => ({ face: s.face!, color: patch.accentColor ?? null }),
  target: accentFx,
});
sample({
  clock: faceLoaded,
  source: $editor,
  filter: s => !!s.sim.accentColor,
  fn: (s, { face }) => ({ face, color: s.sim.accentColor! }),
  target: accentFx,
});
// PropsPanel's "tints with device accent color" checkbox flips meta[7] via `patched` — re-run
// so a live accent preview picks up the change immediately, not just on the next color pick
sample({
  clock: patched,
  source: $editor,
  filter: s => !!(s.face && s.sim.accentColor),
  fn: s => ({ face: s.face!, color: s.sim.accentColor! }),
  target: accentFx,
});

// Figma-style alignment: nudge the selected node so its RENDERED bounding box lands on the
// container's edge/center. The container is the parent group's frame when the node is a
// group child (Figma aligns relative to the parent), the screen otherwise. Delta-based off
// the render hits, so it works uniformly for groups (frame x/y), widgets (struct x/y) and
// grouped children whose drawn position differs from their raw x/y. ponytail: clamped to
// >=0 — a group child at the x=0 "center me" convention can't be pushed further left than
// the format can express, and AUTO (0x8000) children ignore x/y entirely.
export type AlignDir = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom';
export function alignSelected(dir: AlignDir) {
  const s = $editor.getState();
  if (!s.face || !s.sel) return;
  const sel = s.sel;
  const c = document.createElement('canvas');
  c.width = c.height = 466;
  let parent: FaceNode | null = null;
  const walk = (n: FaceNode) => {
    if (n.tag === TAG.group && n.subs?.includes(sel)) parent = n;
    n.subs?.forEach(walk);
  };
  for (const scr of s.face.screens) walk(scr);

  const pass = (): boolean => {
    const hits = render(c.getContext('2d')!, s.face!, s.screenTag, s.sim);
    const h = hits.findLast(h => h.node === sel);
    if (!h) return false;
    let cont = { x: 0, y: 0, w: 466, h: 466 };
    if (parent) {
      const ph = hits.findLast(x => x.node === parent);
      // auto-sized frames report w/h 0 — fall back to the screen for those
      if (ph) cont = { x: ph.x, y: ph.y, w: ph.w || 466, h: ph.h || 466 };
    }
    let dx = dir === 'left' ? cont.x - h.x
      : dir === 'hcenter' ? Math.round(cont.x + (cont.w - h.w) / 2 - h.x)
      : dir === 'right' ? cont.x + cont.w - h.w - h.x : 0;
    let dy = dir === 'top' ? cont.y - h.y
      : dir === 'vcenter' ? Math.round(cont.y + (cont.h - h.h) / 2 - h.y)
      : dir === 'bottom' ? cont.y + cont.h - h.h - h.y : 0;
    // a hand's bbox rotates with the live angle — centering means "pivot on container
    // center", not "AABB centered" (which would drift with the current second)
    const pivot = sel.subs?.find(n => n.tag === TAG.pivot);
    const pst = pivot && sel.subs?.find(n => n.tag === TAG.struct);
    if (pivot && pst) {
      if (dir === 'hcenter') dx = Math.round(cont.x + cont.w / 2) - pivot.pivotX! - pst.x!;
      if (dir === 'vcenter') dy = Math.round(cont.y + cont.h / 2) - pivot.pivotY! - pst.y!;
    }
    if (!dx && !dy) return false;
    if (sel.tag === TAG.group) {
      const f = sel.subs!.find(n => n.tag === TAG.frame)!;
      const v = unhex(f.hex!);
      const fx = Math.max(0, (v[0] | v[1] << 8) + dx), fy = Math.max(0, (v[2] | v[3] << 8) + dy);
      v[0] = fx; v[1] = fx >> 8; v[2] = fy; v[3] = fy >> 8;
      patched({ node: f, patch: { hex: hex(v) } });
    } else {
      const st = sel.subs?.find(n => n.tag === TAG.struct);
      if (!st || st.x == null) return false;
      patched({ node: st, patch: { x: Math.max(0, st.x + dx), y: Math.max(0, (st.y || 0) + dy) } });
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

const newFaceFx = createEffect(async (name: string = 'Custom') => {
  const black = (w: number, h: number): Resource => {
    const px = new Uint8ClampedArray(w * h * 4);
    for (let i = 3; i < px.length; i += 4) px[i] = 255;
    return encodePixels(px, w, h, 4);
  };
  const preview = black(270, 270);
  const bg = black(466, 466);
  preview.bitmap = await bitmapOf(preview);
  bg.bitmap = await bitmapOf(bg);
  const nameRaw = new Uint8Array(16);
  new TextEncoder().encodeInto(name.slice(0, 14), nameRaw);
  nameRaw[15] = 0x0a; // same as CDN files, byte meaning not figured out
  const face: Face = {
    name, nameRaw: hex(nameRaw),
    screens: [{
      tag: TAG.main, subs: [
        { tag: TAG.name, text: name },
        { tag: TAG.preview, subs: [{ tag: TAG.pvStruct, prefix: '0000000000', refType: 0x61, images: [0] }] },
        { tag: 0x30, subs: [{ tag: 1, x: 0, y: 0, meta: 'd201d2010000000000000000000000'.slice(0, 28), refType: 0x61, images: [1] }] },
      ],
    }],
    resources: [preview, bg],
  };
  return { face, label: 'new', dirty: true };
});

export const newFaceRequested = createEvent<string | void>();
sample({ clock: newFaceRequested, target: newFaceFx });

sample({ clock: [loadBufferFx.doneData, newFaceFx.doneData], target: faceLoaded });
sample({
  clock: loadBufferFx.fail,
  fn: ({ params, error }) => `${params.label}: ${error.message}`,
  target: errored,
});

// ---- widget operations ----
function findParent(nodes: FaceNode[], target: FaceNode): FaceNode | null {
  for (const n of nodes) {
    if (n.subs?.includes(target)) return n;
    const p = n.subs && findParent(n.subs, target);
    if (p) return p;
  }
  return null;
}

// deleteWidget/buildCurrentBin/previewBlob/exportBin below stay as plain functions reading
// $editor.getState() directly: they're one-shot imperative actions fired straight from a
// component event handler (not data derived from a clock), so there's no sample() clock to
// hang them on — the mutations they trigger (checkpoint/treeChanged) still go through events.
export function deleteWidget() {
  const s = $editor.getState();
  if (!s.sel || !s.face) return;
  const p = findParent(s.face.screens, s.sel);
  if (!p) return;
  checkpoint(0);
  treeChanged(st => {
    p.subs!.splice(p.subs!.indexOf(st.sel!), 1);
    st.sel = null;
    // ponytail: orphaned resources stay in the file — harmless to the watch, space is cheap
  });
}

async function addResources(face: Face, files: File[], cf: number) {
  const idxs: number[] = [];
  for (const file of files) {
    const img = await createImageBitmap(file);
    const c = new OffscreenCanvas(img.width, img.height);
    const cx = c.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    const enc: Resource = encodePixels(cx.getImageData(0, 0, img.width, img.height).data, img.width, img.height, cf);
    enc.bitmap = await bitmapOf(enc);
    idxs.push(face.resources.length);
    face.resources.push(enc);
  }
  return idxs;
}

const META0 = '0000000000000000000000000000';
function metaWith(id: number, max: number) {
  const v = unhex(META0);
  v[9] = id;
  v[11] = max; v[12] = max >> 8; v[13] = max >> 16;
  return hex(v);
}

// kind: image | number (10 digit files 0..9) | hand
const addWidgetFx = createEffect(
  async ({ kind, files }: { kind: 'image' | 'number' | 'hand'; files: File[] }) => {
    const s = $editor.getState();
    if (!s.face || !files.length) return;
    checkpoint(0);
    const scr = s.face.screens.find(x => x.tag === s.screenTag) || s.face.screens[0];
    const imgs = await addResources(s.face, [...files], 5);
    let node: FaceNode;
    if (kind === 'image') {
      node = { tag: 0x30, subs: [{ tag: 1, x: 183, y: 183, meta: META0, refType: 0x61, images: imgs }] };
    } else if (kind === 'number') {
      node = {
        tag: 0x60, subs: [
          { tag: 1, x: 183, y: 217, meta: metaWith(0x19, 100000), refType: 0x61, images: imgs },
          { tag: 0x40, hex: '82' },
        ],
      };
    } else {
      const r = s.face.resources[imgs[0]];
      const px = r.w >> 1, py = Math.round(r.h * 0.9);
      node = {
        tag: 0x70, subs: [
          { tag: 1, x: 233 - px, y: 233 - py, meta: metaWith(0x0e, 60), refType: 0x61, images: imgs, _kind: 'minute' },
          { tag: 5, flag: 1, pivotX: px, pivotY: py },
        ],
      };
    }
    treeChanged(st => {
      scr.subs!.push(node);
      st.sel = node;
      st.ids = collectIds(st.face!);
    });
  });
sample({ clock: addWidgetFx.fail, fn: ({ error }) => `add widget: ${error.message}`, target: errored });

export const addWidgetRequested = createEvent<{ kind: 'image' | 'number' | 'hand'; files: File[] }>();
sample({ clock: addWidgetRequested, target: addWidgetFx });

const replaceImageFx = createEffect(
  async ({ resIdx, file }: { resIdx: number; file: File }) => {
    const { face } = $editor.getState();
    const r = face!.resources[resIdx];
    if (r.cf === 1) {
      const data = new Uint8Array(await file.arrayBuffer());
      const b = await createImageBitmap(new Blob([data], { type: 'image/jpeg' }));
      treeChanged(() => Object.assign(r, { data, w: b.width, h: b.height, bitmap: b }));
      return;
    }
    const img = await createImageBitmap(file);
    const c = new OffscreenCanvas(img.width, img.height);
    const cx = c.getContext('2d')!;
    cx.drawImage(img, 0, 0);
    const enc: Resource = encodePixels(cx.getImageData(0, 0, img.width, img.height).data, img.width, img.height, r.cf);
    enc.bitmap = await bitmapOf(enc);
    treeChanged(() => Object.assign(r, enc));
  });
sample({ clock: replaceImageFx.done, source: $editor, fn: s => ({ ...s, dirty: true }), target: $editor });
sample({ clock: replaceImageFx.fail, fn: ({ error }) => `image replace: ${error.message}`, target: errored });

export const replaceImageRequested = createEvent<{ resIdx: number; file: File }>();
sample({ clock: replaceImageRequested, target: replaceImageFx });

// ---- export ----
function regenPreviews(face: Face, sim: Sim) {
  for (const scr of face.screens) {
    const pv = scr.subs?.find(s => s.tag === TAG.preview)?.subs?.find(s => s.tag === TAG.pvStruct);
    const ri = pv?.images?.[0];
    if (ri == null) continue;
    const r = face.resources[ri];
    if (r.cf === 1) continue; // don't re-encode JPEG previews
    const c = document.createElement('canvas');
    c.width = 466; c.height = 466;
    render(c.getContext('2d')!, face, scr.tag, sim);
    const c2 = document.createElement('canvas');
    c2.width = r.w; c2.height = r.h;
    const cx2 = c2.getContext('2d')!;
    cx2.drawImage(c, 0, 0, r.w, r.h);
    Object.assign(r, encodePixels(cx2.getImageData(0, 0, r.w, r.h).data, r.w, r.h, r.cf));
    bitmapOf(r).then(b => (r.bitmap = b));
  }
}

export function buildCurrentBin(): Uint8Array {
  const s = $editor.getState();
  if (s.dirty) regenPreviews(s.face!, s.sim); // embedded 0x28 previews = current render
  const out = buildBin(s.face!);
  parseBin(out); // self-check
  return out;
}

// PNG snapshot of the main screen, for marketplace cards
export function previewBlob(): Promise<Blob> {
  const { face, sim } = $editor.getState();
  const c = document.createElement('canvas');
  c.width = 466; c.height = 466;
  render(c.getContext('2d')!, face!, TAG.main, sim);
  return new Promise(res => c.toBlob(b => res(b!), 'image/png'));
}

export function exportBin() {
  try {
    const out = buildCurrentBin();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([out as BlobPart]));
    a.download = `${$editor.getState().face!.name || 'watchface'}.bin`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    errored(`export: ${(e as Error).message}`);
  }
}
