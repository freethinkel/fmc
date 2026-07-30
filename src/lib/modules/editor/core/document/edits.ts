// Tree edits as pure functions: (Doc, …) -> Doc. No store, no mutation, no bytes.
//
// This is where the editor's actual behaviour lives once the model is switched over — the model
// then only decides when to run them, what to checkpoint, and what stays selected. Everything
// here is keyed by NodeId, which is what makes the layer identity survive an immutable update:
// the old code compared node objects, so any rebuilt parent silently invalidated `sel`.
import {
  framesOf,
  isPlaced,
  newNodeId,
  type Condition,
  type Doc,
  type GroupLayer,
  type Layer,
  type NodeId,
  type Screen,
} from "./doc";
import { SLOT_SEL_ID, isSlotSel } from "./sources";

const childrenOf = (l: Layer): readonly Layer[] =>
  l.kind === "group" ? l.children : l.kind === "raw" ? (l.children ?? []) : [];

const withChildren = (l: Layer, children: readonly Layer[]): Layer =>
  l.kind === "group" ? { ...l, children } : l.kind === "raw" ? { ...l, children } : l;

export function findLayer(doc: Doc, id: NodeId): Layer | null {
  const walk = (ls: readonly Layer[]): Layer | null => {
    for (const l of ls) {
      if (l.id === id) return l;
      const hit = walk(childrenOf(l));

      if (hit) return hit;
    }
    return null;
  };

  for (const s of doc.screens) {
    const hit = walk(s.layers);

    if (hit) return hit;
  }
  return null;
}

/** The group holding `id`, or null when it sits directly on a screen. */
export function parentOf(doc: Doc, id: NodeId): Layer | null {
  const walk = (ls: readonly Layer[], parent: Layer | null): Layer | null => {
    for (const l of ls) {
      if (l.id === id) return parent;
      const hit = walk(childrenOf(l), l);

      if (hit !== null || childrenOf(l).some((c) => c.id === id)) return hit;
    }
    return null;
  };

  for (const s of doc.screens) {
    if (s.layers.some((l) => l.id === id)) return null;
    const hit = walk(s.layers, null);

    if (hit) return hit;
  }
  return null;
}

export const contains = (l: Layer, id: NodeId): boolean =>
  l.id === id || childrenOf(l).some((c) => contains(c, id));

/** Rebuild every screen, applying `fn` to each layer; returning null drops it. */
function mapLayers(doc: Doc, fn: (l: Layer) => Layer | null): Doc {
  const walk = (ls: readonly Layer[]): Layer[] =>
    ls
      .map((l) => {
        const kids = childrenOf(l);
        const next = kids.length ? withChildren(l, walk(kids)) : l;

        return fn(next);
      })
      .filter((l): l is Layer => l !== null);

  return { ...doc, screens: doc.screens.map((s) => ({ ...s, layers: walk(s.layers) })) };
}

export const patchLayer = (doc: Doc, id: NodeId, patch: Partial<Layer>): Doc =>
  mapLayers(doc, (l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l));

export const removeLayer = (doc: Doc, id: NodeId): Doc =>
  mapLayers(doc, (l) => (l.id === id ? null : l));

/** Append to a screen — the plain "add a widget" path. */
export function addLayer(doc: Doc, screen: Screen["kind"], layer: Layer): Doc {
  return {
    ...doc,
    screens: doc.screens.map((s) =>
      s.kind === screen ? { ...s, layers: [...s.layers, layer] } : s,
    ),
  };
}

/** Insert `layer` next to `targetId` (or into it when `into`), removing it from wherever it was.
 *  Coordinates are the caller's problem — see shiftForReparent in the model. */
export function moveLayer(
  doc: Doc,
  id: NodeId,
  targetId: NodeId,
  after: boolean,
  into = false,
): Doc {
  const moving = findLayer(doc, id);
  const target = findLayer(doc, targetId);

  if (!moving || id === targetId || contains(moving, targetId)) return doc;
  // Both guards exist because the layer is removed before it is re-inserted: with no valid
  // destination it would be removed and never come back, i.e. silently dropped from the
  // document. A screen id is the common case here — a screen is not a layer.
  if (!target) return doc;
  if (into && target.kind !== "group") return doc;
  const without = removeLayer(doc, id);

  if (into)
    return mapLayers(without, (l) =>
      l.id === targetId && l.kind === "group" ? { ...l, children: [...l.children, moving] } : l,
    );

  const splice = (ls: readonly Layer[]): Layer[] => {
    const i = ls.findIndex((l) => l.id === targetId);

    if (i < 0) return [...ls];
    const out = [...ls];

    out.splice(i + (after ? 1 : 0), 0, moving);
    return out;
  };
  const walk = (ls: readonly Layer[]): Layer[] =>
    splice(ls).map((l) => (childrenOf(l).length ? withChildren(l, walk(childrenOf(l))) : l));

  return { ...without, screens: without.screens.map((s) => ({ ...s, layers: walk(s.layers) })) };
}

/** Wrap a layer in `group`, in place. */
export function wrapInGroup(doc: Doc, id: NodeId, group: GroupLayer): Doc {
  return mapLayers(doc, (l) => (l.id === id ? { ...group, children: [l] } : l));
}

/** Where a layer's own coordinates sit: a group carries them on its frame, a widget on itself. */
export const originOf = (l: Layer): { x: number; y: number } =>
  l.kind === "group"
    ? { x: l.frame.x, y: l.frame.y }
    : isPlaced(l)
      ? { x: l.x, y: l.y }
      : { x: 0, y: 0 };

/** Move a layer by a delta. Group frames stay clamped to >=0 — their x/y is unsigned in the file,
 *  unlike a widget's int16 x/y, which may legitimately hang off the left/top edge. */
export const shiftLayer = (l: Layer, dx: number, dy: number): Layer =>
  l.kind === "group"
    ? {
        ...l,
        frame: { ...l.frame, x: Math.max(0, l.frame.x + dx), y: Math.max(0, l.frame.y + dy) },
      }
    : isPlaced(l)
      ? { ...l, x: l.x + dx, y: l.y + dy }
      : l;

/** Absolute origin of the container a layer lives in: child coordinates are measured from their
 *  group's frame, so reparenting has to shift by the difference of two of these to stay put. */
export function containerOrigin(doc: Doc, id: NodeId | null): { x: number; y: number } {
  let out = { x: 0, y: 0 };

  for (let at = id; at;) {
    const l = findLayer(doc, at);

    if (!l) break;
    const o = originOf(l);

    out = { x: out.x + o.x, y: out.y + o.y };
    at = parentOf(doc, at)?.id ?? null;
  }
  return out;
}

/** Dissolve a group, lifting its children into its own slot. The children's coordinates were
 *  measured from the group's frame, so they shift by its origin and stay visually put.
 *  ponytail: AUTO children (meta.auto) were placed by the group's flex row and ignore x/y — they
 *  land at their raw coordinates, same caveat the old tree code carried. */
export function ungroup(doc: Doc, id: NodeId): Doc {
  const walk = (ls: readonly Layer[]): Layer[] =>
    ls.flatMap((l) => {
      if (l.id === id && l.kind === "group") {
        const o = originOf(l);

        return l.children.map((c) => shiftLayer(c, o.x, o.y));
      }
      const kids = childrenOf(l);

      return [kids.length ? withChildren(l, walk(kids)) : l];
    });

  return { ...doc, screens: doc.screens.map((s) => ({ ...s, layers: walk(s.layers) })) };
}

/** A copy with fresh ids, sharing the original's assets. */
export function cloneLayer(l: Layer): Layer {
  const kids = childrenOf(l);
  const copy = { ...l, id: newNodeId() } as Layer;

  return kids.length ? withChildren(copy, kids.map(cloneLayer)) : copy;
}

/** Insert `layer` right after `afterId`, wherever that sits. */
export function insertAfter(doc: Doc, afterId: NodeId, layer: Layer): Doc {
  const walk = (ls: readonly Layer[]): Layer[] =>
    ls.flatMap((l) => {
      const kids = childrenOf(l);
      const self = kids.length ? withChildren(l, walk(kids)) : l;

      return l.id === afterId ? [self, layer] : [self];
    });

  return { ...doc, screens: doc.screens.map((s) => ({ ...s, layers: walk(s.layers) })) };
}

export function duplicateLayer(doc: Doc, id: NodeId): { doc: Doc; copy: Layer } | null {
  const src = findLayer(doc, id);

  if (!src) return null;
  const copy = cloneLayer(src);
  const walk = (ls: readonly Layer[]): Layer[] =>
    ls.flatMap((l) => {
      const kids = childrenOf(l);
      const self = kids.length ? withChildren(l, walk(kids)) : l;

      return l.id === id ? [self, copy] : [self];
    });

  return {
    doc: { ...doc, screens: doc.screens.map((s) => ({ ...s, layers: walk(s.layers) })) },
    copy,
  };
}

/** Rewrite only the slot-selection condition, leaving real metric conditions alone. */
export function setSlotBinding(doc: Doc, id: NodeId, slot: number | null, metric = 0): Doc {
  return mapLayers(doc, (l) => {
    if (l.id !== id) return l;
    const kept = l.conditions.filter((c) => !isSlotSel(c.source));
    const conditions: Condition[] =
      slot == null
        ? kept
        : [...kept, { source: SLOT_SEL_ID + slot, op: "eq", value: metric, exclusive: true }];

    return { ...l, conditions };
  });
}

/** The slot binding currently on a layer, if any. */
export function slotBindingOf(l: Layer): { slot: number; metric: number } | null {
  const c = l.conditions.find((x) => isSlotSel(x.source));

  return c ? { slot: c.source - SLOT_SEL_ID, metric: c.value } : null;
}

/** Every asset referenced anywhere — what a "which images are still in use" check wants. */
export function usedAssets(doc: Doc) {
  const out = new Set<string>();
  const walk = (ls: readonly Layer[]) => {
    for (const l of ls) {
      framesOf(l).forEach((i) => out.add(i));
      walk(childrenOf(l));
    }
  };

  doc.screens.forEach((s) => walk(s.layers));
  return out;
}
