// Layer names live beside the document, not in it: the format has no string node for a layer, so
// a name can't ride along in the .bin. localStorage keeps them, keyed by the marketplace record
// the face was opened from — reopening the same watchface from /my brings its names back, on this
// browser.
//
// ponytail: a layer is addressed by its position in the tree ("main/3/1"), because a NodeId is
// minted fresh on every parse and means nothing across sessions. Inserting or deleting a sibling
// therefore shifts the names below it; renaming again fixes it. Upgrade path, if that ever bites:
// key by something the layer carries (kind + coordinates + frame ids). Never pruned either — a
// deleted watchface leaves a few hundred bytes nothing looks up.
import type { Doc, Layer } from "./doc";
import { childrenOf, withChildren } from "./edits";

const STORE = "fmc_layer_names";

type Names = Record<string, string>;

const all = (): Record<string, Names> => {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "{}") as Record<string, Names>;
  } catch {
    return {};
  }
};

// The model calls this on every document change, which during a drag means once per frame — so
// the map is compared before it is written, and only a rename actually reaches localStorage.
let last = "";

/** Collect the names of a document, and drop the whole entry when nothing is named. */
export function saveNames(key: string, doc: Doc) {
  const names: Names = {};
  const walk = (ls: readonly Layer[], at: string) =>
    ls.forEach((l, i) => {
      const path = `${at}/${i}`;

      if (l.name) names[path] = l.name;
      walk(childrenOf(l), path);
    });

  doc.screens.forEach((s) => walk(s.layers, s.kind));
  const seen = `${key}:${JSON.stringify(names)}`;

  if (seen === last) return;
  last = seen;
  const store = all();

  if (Object.keys(names).length) store[key] = names;
  else delete store[key];
  localStorage.setItem(STORE, JSON.stringify(store));
}

/** Put the stored names back on a freshly parsed document. */
export function withNames(doc: Doc, key: string): Doc {
  const names = all()[key];

  if (!names) return doc;
  const walk = (ls: readonly Layer[], at: string): Layer[] =>
    ls.map((l, i) => {
      const path = `${at}/${i}`;
      const kids = childrenOf(l);
      const next = kids.length ? withChildren(l, walk(kids, path)) : l;

      return names[path] ? { ...next, name: names[path] } : next;
    });

  return { ...doc, screens: doc.screens.map((s) => ({ ...s, layers: walk(s.layers, s.kind) })) };
}
