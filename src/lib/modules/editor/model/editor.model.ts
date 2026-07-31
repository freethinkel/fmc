// The editor model, split by concern. This file is the single import surface: components do
// `import { editorModel } from "../model"` and read `editorModel.$doc`, `editorModel.select`, …
//
//   doc.model        the document and its history — every edit goes through `committed`
//   selection.model  what is selected (by NodeId) and which screen is open
//   sim.model        the simulated watch state the canvas renders against
//   ui.model         panel tab and the last error
//   assets.model     image assets, the decoded-bitmap cache, and pixel operations
//   edit.model       every action on the layer tree
//   io.model         open, create, import, export
//   font-sprite.model  the "sprites from a font" generator: its dialog, form and preview
//
// Importing this module is what wires them up — the sample() calls in each file run on import.
export * from "./doc.model";
export * from "./selection.model";
export * from "./sim.model";
export * from "./ui.model";
export * from "./assets.model";
export * from "./edit.model";
export * from "./io.model";
export * from "./font-sprite.model";
