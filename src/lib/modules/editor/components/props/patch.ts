// One checkpointed patch, shared by every inspector section: undo history is per edit, so
// each field write goes through the model rather than mutating the node in the component.
import { editorModel } from "../../model";
import type { FaceNode } from "../../lib/wf";

export const set = (node: FaceNode, patch: Partial<FaceNode>) => {
  editorModel.checkpoint();
  editorModel.patched({ node, patch });
};

export const num = (s: string) => Number(s) || 0;
