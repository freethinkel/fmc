# fmc_frontend — project rules

SvelteKit (Svelte 5 runes) + Tailwind 4 + shadcn-svelte, static SPA build
(`@sveltejs/adapter-static`, `fallback: 'index.html'`). Backend — the sibling repo
`fmc_pocketbase` (PocketBase); the address comes from `VITE_PB_URL`, and falls back to
same-origin (`location.origin`) without it: in dev this works through the `/api` proxy →
PocketBase in `vite.config.js`, in prod — through Caddy on the same domain as the backend
(see `fmc_pocketbase/README.md`).

App: landing page (`/`), marketplace (`/market`, `/my`), watchface editor (`/editor`,
with a BLE connection to the CMF Watch Pro 2) and auth (`/login`, `/register`).

## Architecture

Modular structure like in gymmate — all code in TypeScript:

```
src/lib/
  shared/
    api/          # PocketBase client (pb, fileUrl, downloadUrl)
    helpers/      # cn() + shadcn type helpers (WithElementRef, etc.)
    components/   # app-sidebar, nav-user, site-header + ui/ (shadcn)
  modules/<feature>/   # auth, market, editor, device
    model/        # <feature>.model.ts + index.ts (export * as fooModel)
    lib/          # module domain libraries (editor: wf, render, facer; device: ble)
    components/   # module components
    pages/        # pages + index.ts (export { default as FooPage })
src/routes/       # thin: import a page from the module and render it
```

- **All logic lives in effector models** (`modules/*/model/*.model.ts`). Components are
  view only: `import { editorModel } from '../model'`, destructure stores/events at the
  top, subscribe via `$store`. Don't put business logic or data loading in components.
- Domain types: `Face`, `FaceNode`, `Resource` — in `modules/editor/lib/wf.ts`;
  `Sim`, `Hit` — in `modules/editor/lib/render.ts`.
- `checkJs` is off: strict TS for `.ts`, `<script>` in Svelte components is plain JS.
- Cross-module imports — through barrels: `$lib/modules/auth/model`, `$lib/modules/device/model`.

## Effector conventions

- Busy flags — from `someFx.pending`, don't add manual `$state` flags.
- Effect errors — via `fail`/`failData` into an error store (`errored` in editor, `marketErr` in market).
- Fire-and-forget effect calls in components — with `.catch(() => {})`, the error is already
  handled in the model.
- Editor model: the `face` tree is mutable, but every change goes through an event
  (`patched`, `treeChanged`) that returns a new store root — that's how the UI updates.
  The canvas is drawn via rAF and reads `editor.getState()`, not a subscription.
  Undo/redo stacks live outside the store; the store only holds the `undoN`/`redoN` counters.

## UI

- shadcn-svelte: components in `lib/shared/components/ui`, semantic tokens
  (`bg-background`, `text-muted-foreground`), no manual `dark:` color overrides.
- Theme is automatic: `dark:` works via `prefers-color-scheme` (Tailwind 4 default),
  dark tokens in `@media (prefers-color-scheme: dark)` in `app.css`. Don't add a `.dark`
  class on `<html>`, don't bring back `@custom-variant dark`.
- The catalog dialog in the editor was removed intentionally — don't restore it. Catalog
  watchfaces are visible in the shared marketplace.
- bits-ui sets the `data-state="checked|unchecked|active|..."` attribute, not
  `data-checked`/`data-active` — the mapping is done via custom Tailwind variants in
  `app.css` (`@custom-variant data-checked (&[data-state="checked"])` etc.). If you add a
  new shadcn component with `data-active:`/`data-checked:` in its classes, it won't work
  until the variant is set up the same way.

## Bluetooth (device/lib/ble.ts)

- Pairing with the watch happens entirely in the browser — `SERVICES` in `ble.ts` must
  list **all** GATT services the runtime needs: Web Bluetooth only returns what's
  explicitly declared in `optionalServices` at `requestDevice()` time via
  `getPrimaryServices()`, even if the device actually exposes more services (verify via
  `chrome://bluetooth-internals`, which shows everything, bypassing this limitation).
- The shell/pairing service lives under UUID `77d4e67c-...` on the verified watch unit,
  not `77d4ff00-...` as the old protocol docs assumed — its child characteristics
  (`77d4ff01`/`77d4ff02`) didn't change though. Not verified on other physical watches:
  if pairing stops finding the shell service, look up the current UUID the same way
  (`chrome://bluetooth-internals`) and add it to `SERVICES`.
- No dev bridge or external process is needed — pairing (`AT GETSECRET` →
  `authPairReq`/`authPairRep` → session key) happens entirely over Web Bluetooth.

## Style

- Ponytail: minimal solutions, stdlib/platform before dependencies, short diffs.
  Mark deliberate simplifications with a `ponytail:` comment stating the ceiling and the
  upgrade path.
- Code comments — in English, matching the surrounding file.
