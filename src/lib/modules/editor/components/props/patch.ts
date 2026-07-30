// One checkpointed patch, shared by every inspector section: undo history is per edit, so each
// field write goes through the model rather than rebuilding the layer in the component.
import { editorModel } from "../../model";
import type { Layer, NodeId } from "../../core/document/doc";

export const set = (id: NodeId, patch: Partial<Layer>) => {
  editorModel.checkpoint();
  editorModel.layerPatched({ id, patch });
};

export const num = (s: string) => Number(s) || 0;
