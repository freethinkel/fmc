// Face-tree navigation and the node shapes the editor creates. Pure: nothing here reads the
// store or touches the canvas.
import { arcSpecHex } from "./arc";
import { CENTER, SCREEN } from "./screen";
import { hex, unhex, TAG, type Face, type FaceNode, type Resource } from "./wf";

/** The struct that carries a widget's geometry — the node itself when it already is one. */
export const structOf = (node: FaceNode | null | undefined): FaceNode | undefined =>
  node?.tag === TAG.struct ? node : node?.subs?.find((s) => s.tag === TAG.struct);

export function findParent(nodes: FaceNode[], target: FaceNode): FaceNode | null {
  for (const n of nodes) {
    if (n.subs?.includes(target)) return n;
    const p = n.subs && findParent(n.subs, target);

    if (p) return p;
  }
  return null;
}

/** Is `target` this node or anything under it? Guards a drag from dropping a group into itself. */
export const contains = (n: FaceNode, target: FaceNode): boolean =>
  n === target || Boolean(n.subs?.some((c) => contains(c, target)));

const frameOf = (n: FaceNode) => n.subs?.find((s) => s.tag === TAG.frame);
const i16 = (v: Uint8Array, o: number) => ((v[o] | (v[o + 1] << 8)) << 16) >> 16;

/** Where a node sits inside its parent: a widget's struct x/y, a group's frame x/y. */
export function nodeOrigin(node: FaceNode): { x: number; y: number } | null {
  const st = structOf(node);

  if (st?.x != null) return { x: st.x, y: st.y || 0 };
  const f = frameOf(node);
  const v = f?.hex ? unhex(f.hex) : null;

  return v && v.length >= 4 ? { x: i16(v, 0), y: i16(v, 2) } : null;
}

/** Move a node by a delta, whichever field carries its position. */
export function shiftNode(node: FaceNode, dx: number, dy: number) {
  const o = nodeOrigin(node);

  if (!o || (!dx && !dy)) return;
  const st = structOf(node);

  if (st?.x != null) {
    st.x = o.x + dx;
    st.y = o.y + dy;
    return;
  }
  const f = frameOf(node)!;
  const v = unhex(f.hex!);

  v[0] = o.x + dx;
  v[1] = (o.x + dx) >> 8;
  v[2] = o.y + dy;
  v[3] = (o.y + dy) >> 8;
  f.hex = hex(v);
}

/** Screen-absolute origin of a container: a screen is 0,0, a group is its frame x/y plus its own
 *  ancestors'. The reference frame a child's x/y is measured against — see moveNode's reparenting. */
export function containerOrigin(
  screens: FaceNode[],
  container: FaceNode,
): { x: number; y: number } {
  let x = 0,
    y = 0;

  for (let n: FaceNode | null = container; n; n = findParent(screens, n)) {
    const o = n.tag === TAG.group ? nodeOrigin(n) : null;

    if (o) {
      x += o.x;
      y += o.y;
    }
  }
  return { x, y };
}

/** Every resource index referenced by a node or anything under it. */
export function imagesUnder(node: FaceNode, out = new Set<number>()): Set<number> {
  node.images?.forEach((i) => out.add(i));
  node.subs?.forEach((c) => imagesUnder(c, out));
  return out;
}

const EMPTY_META = "0000000000000000000000000000";

const metaWith = (id: number, max: number) => {
  const v = unhex(EMPTY_META);

  v[9] = id;
  v[11] = max;
  v[12] = max >> 8;
  v[13] = max >> 16;
  return hex(v);
};

export type WidgetKind = "image" | "number" | "hand";

/** A fresh widget over already-added resources: centred image, step counter, or minute hand. */
export function newWidget(kind: WidgetKind, imgs: number[], first: Resource): FaceNode {
  if (kind === "image")
    return {
      tag: 0x30,
      subs: [{ tag: TAG.struct, x: 183, y: 183, meta: EMPTY_META, refType: 0x61, images: imgs }],
    };
  if (kind === "number")
    return {
      tag: TAG.number,
      subs: [
        {
          tag: TAG.struct,
          x: 183,
          y: 217,
          meta: metaWith(0x19, 100000),
          refType: 0x61,
          images: imgs,
        },
        { tag: TAG.fmt, hex: "82" },
      ],
    };
  const px = first.w >> 1,
    py = Math.round(first.h * 0.9);

  return {
    tag: TAG.hand,
    subs: [
      {
        tag: TAG.struct,
        x: CENTER - px,
        y: CENTER - py,
        meta: metaWith(0x0e, 60),
        refType: 0x61,
        images: imgs,
        _kind: "minute",
      },
      { tag: TAG.pivot, flag: 1, pivotX: px, pivotY: py },
    ],
  };
}

/** An empty group: a 0,0 full-screen frame, so children keep the coordinates they already had
 *  (drawGroup adds the frame origin) and wrapping a widget doesn't move it. */
export const newGroup = (): FaceNode => {
  const v = new Uint8Array(21); // x/y i16, w/h u16, align byte, then 12 bytes always zero

  v[4] = SCREEN & 0xff;
  v[5] = SCREEN >> 8;
  v[6] = SCREEN & 0xff;
  v[7] = SCREEN >> 8;
  return { tag: TAG.group, subs: [{ tag: TAG.frame, hex: hex(v) }] };
};

/** A procedural progress ring (0x81): no bitmap at all — geometry and gauge live in the 0x5a
 *  spec, the stroke color follows the device accent (meta byte 7 left at 0, see arc.ts). */
export function newRing(): FaceNode {
  const d = 200;
  const meta = unhex(metaWith(0x19, 100)); // steps, as a percent-of-goal gauge

  meta[0] = d & 0xff;
  meta[1] = d >> 8;
  meta[2] = d & 0xff;
  meta[3] = d >> 8;
  return {
    tag: 0x81,
    subs: [
      { tag: TAG.struct, x: CENTER - d / 2, y: CENTER - d / 2, meta: hex(meta) },
      {
        tag: 0x5a,
        hex: arcSpecHex({ min: 0, max: 100, start: 0, end: 360, width: 10, radius: d / 2 }),
      },
    ],
  };
}

/** What a fresh widget slot offers the wearer. Any set works — the list lives in the file, not
 *  the firmware — these are just the four the corpus's own slots lean on. */
export const SLOT_METRICS = [0x19, 0x1a, 0x1c, 0x24]; // steps, heart rate, calories, battery
export const SLOT_SIZE = 136; // the tile Function's slots use; meta w/h and the art both take it

/** A widget slot (0x85) — the tile the companion app lets the wearer point at one of several
 *  metrics. 0x5f body: [slotIndex][count][activeIdx][count × metric id], zero-padded to the
 *  33 bytes every corpus slot carries. `imgs[0]` is the on-watch "tap to configure" placeholder,
 *  `imgs[1..count]` the icons the companion app's own picker shows — so imgs is one longer than
 *  the metric list. Nothing here draws on the watch face itself: the real per-metric visual is a
 *  sibling Group gated by a condition on id 0x79 + slotIndex (see withSlotOverrides). */
export function newSlot(slotIndex: number, imgs: number[], ids = SLOT_METRICS): FaceNode {
  const v = new Uint8Array(33);

  v[0] = slotIndex;
  v[1] = ids.length;
  v[2] = 0; // activeIdx
  v.set(ids, 3);
  const meta = unhex(EMPTY_META);

  meta[0] = SLOT_SIZE & 0xff;
  meta[1] = SLOT_SIZE >> 8;
  meta[2] = SLOT_SIZE & 0xff;
  meta[3] = SLOT_SIZE >> 8;
  return {
    tag: 0x85,
    subs: [
      {
        tag: TAG.struct,
        x: CENTER - SLOT_SIZE / 2,
        y: CENTER - SLOT_SIZE / 2,
        meta: hex(meta),
        refType: 0x61,
        images: imgs,
      },
      { tag: 0x5f, hex: hex(v) },
    ],
  };
}

/** A visibility condition that starts out always-true (steps ≥ 0), for the props panel to edit.
 *  Body: [count][id][op][val u24] — see parseBind. */
export const newBind = (): FaceNode => ({
  tag: TAG.bind,
  hex: hex(new Uint8Array([1, 0x19, 0x05, 0, 0, 0])),
});

/** An empty face: one screen, a black background and the thumbnail the store list shows. */
export function blankFace(name: string, preview: Resource, background: Resource): Face {
  const nameRaw = new Uint8Array(16);

  new TextEncoder().encodeInto(name.slice(0, 14), nameRaw);
  nameRaw[15] = 0x0a; // same as CDN files, byte meaning not figured out

  return {
    name,
    nameRaw: hex(nameRaw),
    screens: [
      {
        tag: TAG.main,
        subs: [
          { tag: TAG.name, text: name },
          {
            tag: TAG.preview,
            subs: [{ tag: TAG.pvStruct, prefix: "0000000000", refType: 0x61, images: [0] }],
          },
          {
            tag: 0x30,
            subs: [
              {
                tag: TAG.struct,
                x: 0,
                y: 0,
                meta: "d201d20100000000000000000000", // 466×466, no source, no accent
                refType: 0x61,
                images: [1],
              },
            ],
          },
        ],
      },
    ],
    resources: [preview, background],
  };
}

// The name lives in three places: the 16-byte header field (NUL-terminated; nameRaw keeps its
// trailing byte, meaning unknown, for an exact round-trip), the 0x86 node the watch's own face
// list reads, and face.name — which is what the marketplace record and the exported filename
// use. The header field is the tight one: 15 bytes, so long names are cut there and only there.
export function setFaceName(face: Face, name: string) {
  const tail = face.nameRaw ? unhex(face.nameRaw)[15] : 0x0a;
  const head = new Uint8Array(16);

  new TextEncoder().encodeInto(name.slice(0, 14), head.subarray(0, 15));
  head[15] = tail;
  face.name = name;
  face.nameRaw = hex(head);
  for (const scr of face.screens)
    for (const n of scr.subs ?? []) if (n.tag === TAG.name) n.text = name.slice(0, 63);
}
