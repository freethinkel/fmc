// One checkpointed patch, shared by every inspector section: undo history is per edit, so each
// field write goes through the model rather than rebuilding the layer in the component.
import { editorModel } from "../../model";
import type { Doc, ImageCache, ImageId, Layer, NodeId } from "../../core/document/doc";

export const set = (id: NodeId, patch: Partial<Layer>) => {
  editorModel.checkpoint();
  editorModel.layerPatched({ id, patch });
};

export const num = (s: string) => Number(s) || 0;

/** A frame as a data: URL, for the inspector's thumbnails. Drawn from the decoded bitmap the
 *  cache already holds, so it costs a canvas and no decode. */
export function thumbURL(
  assets: Doc["images"] | undefined,
  cache: ReadonlyMap<ImageId, ImageCache>,
  id: ImageId,
): string {
  const a = assets?.get(id);
  const c = document.createElement("canvas");

  if (!a) return c.toDataURL();
  c.width = a.w;
  c.height = a.h;
  const bitmap = cache.get(id)?.bitmap;

  if (bitmap) c.getContext("2d")?.drawImage(bitmap, 0, 0);
  return c.toDataURL();
}
