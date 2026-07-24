// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
  interface Window {
    // console access for debugging/automated runs (see routes/(app)/editor/+page.svelte)
    wfEd?: typeof import("$lib/modules/editor/model").editorModel;
  }
  namespace App {
    // interface Error {}
    // interface Locals {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
