# fmc_frontend — project rules

SvelteKit (Svelte 5 runes) + hand-written components with token-based scoped CSS
(no Tailwind, no shadcn/bits-ui), static SPA build
(`@sveltejs/adapter-static`, `fallback: 'index.html'`). Backend — the sibling repo
`fmc_pocketbase` (PocketBase); the address comes from `VITE_PB_URL` (set in dev via `.env`,
pointing straight at PocketBase — no vite dev-server proxy involved), and falls back to
same-origin (`location.origin`) without it, which is what prod uses — through Caddy on the
same domain as the backend (see `fmc_pocketbase/README.md`).

App: landing page (`/`), marketplace (`/market`, `/my`), watchface editor (`/editor`,
with a BLE connection to the CMF Watch Pro 2) and auth (`/login`, `/register`).

## Architecture

Modular structure like in gymmate — all code in TypeScript:

```
src/lib/
  shared/
    api/          # PocketBase client (pb, fileUrl, downloadUrl)
    styles/       # tokens.css — design tokens, the only source of colors/type/motion
    components/   # one folder per component (button/, input/, dialog/, …) + barrel index.ts;
                  # app chrome: app-header/, bottom-nav.svelte
  modules/<feature>/   # auth, market, editor, device
    model/        # <feature>.model.ts + index.ts (export * as fooModel)
    lib/          # module domain libraries (see the editor/device maps below)
    components/   # module components
    pages/        # pages + index.ts (export { default as FooPage })
src/routes/       # thin: import a page from the module and render it
```

Editor libs, one concern each — keep them that way instead of growing one file:

```
editor/lib/
  wf.ts        # .bin <-> Face tree: TLV parse/build, LZ4, pixel codecs
  tree.ts      # tree navigation + the node shapes the editor creates (pure)
  sources.ts   # data sources: id labels, Sim, idValue, meta/bind decoding
  arc.ts       # progress rings: 0x5a/0x5b spec, fill fraction, both draw paths
  canvas.ts    # renderer types (Ctx/Point/Size/Hit) + Resource -> drawable bitmap
  render.ts    # draw a screen: per-tag draw functions + group auto-layout
  pixels.ts    # Resource pixels: decode, resize/adjust, accent tint, previews
  facer/       # Facer import — assets.ts (files/images/fonts), text.ts (tags), index.ts
  watchmaker.ts

device/lib/
  ble-protocol.ts  # GATT ids, command table, 0xF5 frame codec (AES/CRC)
  ble.ts           # Web Bluetooth session: connect, pair, upload
```

The editor inspector is split the same way: `components/props/` holds `geometry`, `source`
and `frames` sections; `PropsPanel.svelte` is the container and owns the shared field CSS
(via a `:global` block, so the sections only carry styles that are theirs).

- **All logic lives in effector models** (`modules/*/model/*.model.ts`). Components are
  view only: `import { editorModel } from '../model'`, destructure stores/events at the
  top, subscribe via `$store`. Don't put business logic or data loading in components.
- Domain types: `Face`, `FaceNode`, `Resource` — in `modules/editor/lib/wf.ts`;
  `Sim` — in `lib/sources.ts`, `Hit` — in `lib/canvas.ts`.
- All Svelte components use `<script lang="ts">` — TypeScript everywhere, no plain-JS `<script>`.
- Cross-module imports — through barrels: `$lib/modules/auth/model`, `$lib/modules/device/model`.

## Effector conventions

- **Never `store.getState()`** — anywhere, including inside an effect. State reaches an effect as
  a parameter: `attach({ source: $editor, effect(s, params) {…} })` for one that's called, or
  `sample({ clock, source: $editor, fn, target })` for one that's triggered. Components read the
  store through `$store`; code that needs a value outside a reactive context (an rAF loop) mirrors
  `$store` into a plain local, it doesn't reach back into the store. Enforced by the
  `effector/no-get-state` oxlint rule (tests are exempt — they assert on `$store.getState()`).
- One-shot user actions (delete layer, group, align, export) are a plain event the component fires
  + an `attach`ed effect wired with `sample({ clock: event, target: fx })`. Only queries that hand a
  value back (`buildCurrentBin`, `previewBlob`, `previewThumb`) are exported as callable effects.
- Busy flags — from `someFx.pending`, don't add manual `$state` flags.
- Effect errors — via `fail`/`failData` into an error store (`errored` in editor, `marketErr` in market).
- Fire-and-forget effect calls in components — with `.catch(() => {})`, the error is already
  handled in the model.
- Editor model: the `face` tree is mutable, but every change goes through an event
  (`patched`, `treeChanged`) that returns a new store root — that's how the UI updates.
  The canvas is drawn via rAF off a plain mirror of `$editor` (see `scene` in editor.svelte), so
  the render effect isn't re-run — and restarted — by every store update.
  Undo/redo stacks live outside the store; the store only holds the `undoN`/`redoN` counters.

## UI

- Design tokens in `lib/styles/tokens.css`: `--color-accent` (#ff5c00), `--color-text`,
  `--color-background`, `--color-error`, `--border-radius`, `--font-family`,
  `--font-display` (Unbounded, display headings only), `--font-mono`,
  `--spring-transition`. Never hardcode a hex in a component — derive every shade via
  relative color: `oklch(from var(--color-text) l c h / 55%)` (muted text), `/ 12%`
  (borders), `/ 6%` (tinted surfaces).
- All sizes — `rem`, never `px`: `:root { font-size: 16px }` in tokens.css is the single
  scale knob for the whole UI (1rem = 16px, so 8px → `0.5rem`, 12px → `0.75rem`). Exceptions
  that stay in `px`: hairline borders/outlines (`1px`, `2px`) and media-query breakpoints
  (they measure the viewport, not the type scale).
- The 1rem grid sizes boxes; text runs a notch below it — `body { font-size: 0.875rem }`
  (14px) in global.css, and per-component `font-size` snaps to the same 1px step
  (`0.75rem` = 12px, `0.625rem` = 10px). Both move together when `:root` changes.
- Components: Svelte 5 runes, typed `interface Props` + `$props()`, `Snippet` children
  via `{@render}`, callback props (`onClick`, `onChange`), `$bindable()` for form values;
  no event dispatchers. Scoped `<style>` with native `&`-nesting (Lightning CSS via Vite
  `css.transformer` handles targets/minify — no PostCSS, no Tailwind).
- Overlays are native-platform: `dialog/` wraps `<dialog>` (modal + `side` drawer),
  `select/` wraps native `<select>`, `menu/` is absolute-positioned in a relative parent —
  no portal/floating-ui deps. Button & co. don't forward arbitrary attrs; for `title`
  tooltips wrap in a `<span title>` (see `tool-slot` in editor.svelte).
- Theme is automatic via `prefers-color-scheme` (dark overrides in tokens.css). Don't add
  a `.dark` class on `<html>`.
- The catalog dialog in the editor was removed intentionally — don't restore it. Catalog
  watchfaces are visible in the shared marketplace.

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
