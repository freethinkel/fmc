// Face-tree navigation and the node shapes the editor creates. Pure: nothing here reads the
// store or touches the canvas.
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
        x: 233 - px,
        y: 233 - py,
        meta: metaWith(0x0e, 60),
        refType: 0x61,
        images: imgs,
        _kind: "minute",
      },
      { tag: TAG.pivot, flag: 1, pivotX: px, pivotY: py },
    ],
  };
}

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
