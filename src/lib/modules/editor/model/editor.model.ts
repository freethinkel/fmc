// Effector-модель редактора. Дерево face остаётся мутабельным (канвас читает его
// через rAF + getState), но каждое изменение проходит через событие и возвращает
// новый корень стора — этого достаточно, чтобы Svelte-компоненты обновились.
import { createEffect, createEvent, createStore, sample } from 'effector';
import { parseBin, buildBin, decodePixels, encodePixels, TAG, hex, unhex,
  type Face, type FaceNode, type Resource } from '../lib/wf';
import { defaultSim, collectIds, render, ACCENT_SENTINEL, type Sim } from '../lib/render';

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

// ---- события ----
export const select = createEvent<FaceNode | null>();
export const screenTagSet = createEvent<number>();
export const checkpoint = createEvent<number | void>(); // payload: coalesce мс (по умолчанию 600)
export const undo = createEvent();
export const redo = createEvent();
export const patched = createEvent<{ node: FaceNode; patch: Partial<FaceNode> }>();
export const simPatched = createEvent<Partial<Sim>>();
export const overrideSet = createEvent<{ id: number; value: number | string }>();
export const errored = createEvent<string>();
const faceLoaded = createEvent<{ face: Face; label: string; dirty?: boolean }>();
const treeChanged = createEvent<(s: EditorState) => void>(); // мутация дерева после checkpoint

// ---- undo/redo вне стора (в сторе только счётчики; tree only, resources вне истории) ----
let undoStack: string[] = [], redoStack: string[] = [], lastCp = 0;
const snap = (s: EditorState) => JSON.stringify(s.face!.screens);

export const editor = createStore<EditorState>({
  face: null, sel: null, screenTag: TAG.main, sim: defaultSim(), ids: [], err: '',
  undoN: 0, redoN: 0, dirty: false, fileLabel: '',
})
  .on(faceLoaded, (s, { face, label, dirty = false }) => {
    undoStack = []; redoStack = []; lastCp = 0;
    return {
      ...s, face, sel: null, screenTag: TAG.main, ids: collectIds(face),
      fileLabel: label, err: '', dirty, undoN: 0, redoN: 0,
    };
  })
  .on(select, (s, sel) => ({ ...s, sel }))
  .on(screenTagSet, (s, screenTag) => ({ ...s, screenTag }))
  .on(checkpoint, (s, coalesce) => {
    if (!s.face) return;
    const now = Date.now();
    if (now - lastCp < (coalesce ?? 600)) return;
    lastCp = now;
    undoStack.push(snap(s));
    if (undoStack.length > 100) undoStack.shift();
    redoStack = [];
    return { ...s, dirty: true, undoN: undoStack.length, redoN: 0 };
  })
  .on(undo, s => {
    if (!undoStack.length || !s.face) return;
    redoStack.push(snap(s));
    s.face.screens = JSON.parse(undoStack.pop()!);
    lastCp = 0;
    return { ...s, sel: null, undoN: undoStack.length, redoN: redoStack.length };
  })
  .on(redo, s => {
    if (!redoStack.length || !s.face) return;
    undoStack.push(snap(s));
    s.face.screens = JSON.parse(redoStack.pop()!);
    lastCp = 0;
    return { ...s, sel: null, undoN: undoStack.length, redoN: redoStack.length };
  })
  .on(patched, (s, { node, patch }) => {
    Object.assign(node, patch);
    return { ...s };
  })
  .on(treeChanged, (s, fn) => {
    fn(s);
    return { ...s };
  })
  .on(simPatched, (s, patch) => ({ ...s, sim: { ...s.sim, ...patch } }))
  .on(overrideSet, (s, { id, value }) => ({
    ...s, sim: { ...s.sim, overrides: { ...s.sim.overrides, [id]: value } },
  }))
  .on(errored, (s, err) => ({ ...s, err }));

// ---- загрузка ----
export async function bitmapOf(r: Resource): Promise<ImageBitmap> {
  const px = decodePixels(r);
  return px
    ? createImageBitmap(new ImageData(px, r.w, r.h))
    : createImageBitmap(new Blob([r.data as BlobPart], { type: 'image/jpeg' }));
}

export const loadBufferFx = createEffect(
  async ({ buf, label }: { buf: ArrayBuffer | Uint8Array; label: string }) => {
    const face = parseBin(buf);
    for (const r of face.resources) r.bitmap = await bitmapOf(r);
    return { face, label };
  });

// preview-only recolor of the RGB(255,44,0) accent sentinel (cmf-format-reference.md) —
// returns undefined (leave r.bitmap as-is) if the resource has no sentinel pixels at all.
// Never touches r.data — the exported .bin must keep the literal sentinel for the real
// watch to substitute its own accent color.
async function accentBitmapFor(r: Resource, colorHex: string): Promise<ImageBitmap | undefined> {
  const px = decodePixels(r);
  if (!px) return undefined; // cf=1 (JPEG) — no per-pixel recolor
  const n = parseInt(colorHex.slice(1), 16);
  const cr = (n >> 16) & 255, cg = (n >> 8) & 255, cb = n & 255;
  let changed = false;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i] === ACCENT_SENTINEL.r && px[i + 1] === ACCENT_SENTINEL.g && px[i + 2] === ACCENT_SENTINEL.b && px[i + 3] > 0) {
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
  accentQueue = accentQueue.then(() => Promise.all(face.resources.map(async r => {
    r.accentBitmap = color ? await accentBitmapFor(r, color) : undefined;
  }))).then(() => {});
  return accentQueue;
}

simPatched.watch(patch => {
  if (!('accentColor' in patch)) return;
  const { face } = editor.getState();
  if (face) queueAccent(face, patch.accentColor ?? null);
});
faceLoaded.watch(({ face }) => {
  const { accentColor } = editor.getState().sim;
  if (accentColor) queueAccent(face, accentColor);
});

export const newFaceFx = createEffect(async (name: string = 'Custom') => {
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

sample({ clock: [loadBufferFx.doneData, newFaceFx.doneData], target: faceLoaded });
loadBufferFx.fail.watch(({ params, error }) => errored(`${params.label}: ${error.message}`));

// ---- операции с виджетами ----
function findParent(nodes: FaceNode[], target: FaceNode): FaceNode | null {
  for (const n of nodes) {
    if (n.subs?.includes(target)) return n;
    const p = n.subs && findParent(n.subs, target);
    if (p) return p;
  }
  return null;
}

export function deleteWidget() {
  const s = editor.getState();
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
export const addWidgetFx = createEffect(
  async ({ kind, files }: { kind: 'image' | 'number' | 'hand'; files: File[] }) => {
    const s = editor.getState();
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
          { tag: 1, x: 233 - px, y: 233 - py, meta: metaWith(0x0a, 60), refType: 0x61, images: imgs, _kind: 'minute' },
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
addWidgetFx.fail.watch(({ error }) => errored(`add widget: ${error.message}`));

export const replaceImageFx = createEffect(
  async ({ resIdx, file }: { resIdx: number; file: File }) => {
    const { face } = editor.getState();
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
editor.on(replaceImageFx.done, s => ({ ...s, dirty: true }));
replaceImageFx.fail.watch(({ error }) => errored(`image replace: ${error.message}`));

// ---- экспорт ----
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
  const s = editor.getState();
  if (s.dirty) regenPreviews(s.face!, s.sim); // embedded 0x28 previews = current render
  const out = buildBin(s.face!);
  parseBin(out); // self-check
  return out;
}

// PNG snapshot of the main screen, for marketplace cards
export function previewBlob(): Promise<Blob> {
  const { face, sim } = editor.getState();
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
    a.download = `${editor.getState().face!.name || 'watchface'}.bin`;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch (e) {
    errored(`export: ${(e as Error).message}`);
  }
}
