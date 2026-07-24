# Custom Components (no shadcn / no Tailwind) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace shadcn-svelte + bits-ui + Tailwind with hand-written components and token-based scoped CSS in the friendzone style, plus a new top-bar layout.

**Architecture:** Design tokens (4 colors + radius + spring easing) in one CSS file; every component derives shades via `oklch(from var(--color) …)`. Components are Svelte 5 runes with typed `Props`, `Snippet` children, scoped `<style>` with native nesting. Overlays use native `<dialog>`; menus use absolute positioning; select is native. Migration is page-by-page — Tailwind coexists until the final cleanup task.

**Tech Stack:** SvelteKit 2 / Svelte 5 (runes), Lightning CSS via Vite's built-in transformer, `@lucide/svelte` icons, Vitest browser tests (`tests/*.svelte.test.ts`).

**Spec:** `docs/superpowers/specs/2026-07-24-custom-components-design.md`

## Global Constraints

- Package manager: **pnpm**. Verify commands: `pnpm check`, `pnpm build`, `pnpm test`.
- Component contract: Svelte 5 runes, `interface Props` + `$props()`, `Snippet` children via `{@render}`, callback props (`onClick`, `onChange`), `$bindable()` for form values. No event dispatchers, no `cn()`, no Tailwind classes in new code.
- New components live in `src/lib/shared/components/<name>/<name>.svelte` + `index.ts` barrel per folder (`export { default as Button } from "./button.svelte";`).
- Colors ONLY from tokens: `--color-accent` (#ff5c00), `--color-text`, `--color-background`, `--color-error`. Shades derived: `oklch(from var(--color-text) l c h / N%)`. Never hardcode a hex in a component.
- Dark theme via `prefers-color-scheme` only. No `.dark` class (CLAUDE.md rule).
- Fonts: `var(--font-family)` (system rounded stack) for UI, `var(--font-display)` (Unbounded) only for display headings/logo.
- Effector rules from CLAUDE.md stay: components are view-only, logic in models, busy flags from `fx.pending`.
- Code comments in English. Commit messages: short imperative (match repo style), end with:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
- Tailwind → CSS cheatsheet for page migrations:
  | Tailwind class                          | Replacement                                                                |
  | --------------------------------------- | -------------------------------------------------------------------------- |
  | `text-muted-foreground`                 | `color: oklch(from var(--color-text) l c h / 55%)`                         |
  | `bg-muted`, `bg-secondary`, `bg-accent` | `background: oklch(from var(--color-text) l c h / 6%)`                     |
  | `border`, `border-t/b/x`                | `border: 1px solid oklch(from var(--color-text) l c h / 12%)`              |
  | `rounded-*`                             | `border-radius: var(--border-radius)` (halve for small chips)              |
  | `bg-cmf`, `text-cmf`, `--color-cmf`     | `var(--color-accent)`                                                      |
  | `font-display`                          | `font-family: var(--font-display)`                                         |
  | `text-xs` / `text-sm`                   | `font-size: 0.75rem` / `0.875rem`                                          |
  | `bg-background`, `text-foreground`      | `var(--color-background)` / `var(--color-text)` (usually inherited — drop) |
  | spacing utils (`p-4`, `gap-2`…)         | plain CSS, 4px grid                                                        |
  | `md:hidden` / `hidden md:flex`          | `@media (min-width: 768px)` / `(max-width: 767px)`                         |

---

### Task 1: Lightning CSS + design tokens

**Files:**

- Modify: `vite.config.ts`
- Create: `src/lib/styles/tokens.css`
- Modify: `src/routes/+layout.svelte:1-3`
- Modify: `package.json` (dev dep `lightningcss`)

**Interfaces:**

- Produces: CSS custom properties `--color-accent`, `--color-text`, `--color-background`, `--color-error`, `--border-radius`, `--font-family`, `--font-display`, `--spring-transition` — every later task styles against these.

- [ ] **Step 1: Install lightningcss**

```bash
pnpm add -D lightningcss
```

- [ ] **Step 2: Wire Lightning CSS in `vite.config.ts`**

Add a `css` section (tailwind plugin stays for now):

```ts
export default defineConfig({
  css: {
    transformer: "lightningcss",
    lightningcss: {
      // evergreen floor: native nesting + oklch relative color everywhere else
      targets: { chrome: 112 << 16, safari: (16 << 16) | (4 << 8), firefox: 128 << 16 },
    },
  },
  build: { cssMinify: "lightningcss" },
  plugins: [/* unchanged */],
});
```

- [ ] **Step 3: Create `src/lib/styles/tokens.css`**

```css
/* Design tokens — the only source of truth for color/type/motion.
   Components derive every shade via oklch(from …); never add per-shade tokens. */
:root {
  --color-accent: #ff5c00;
  --color-text: #171310;
  --color-background: #ffffff;
  --color-error: #ff3f40;

  --border-radius: 12px;

  --font-family:
    ui-rounded, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-display: "Unbounded", var(--font-family);

  /* spring easing shared by all micro-interactions (from friendzone) */
  --spring-transition: 0.5s
    linear(
      0,
      0.0142,
      0.0525,
      0.1095,
      0.1798,
      0.2591,
      0.3434,
      0.4295,
      0.5147,
      0.5969,
      0.6743,
      0.7458,
      0.8105,
      0.868,
      0.9181,
      0.9608,
      0.9964,
      1.0253,
      1.0479,
      1.0649,
      1.0769,
      1.0845,
      1.0883,
      1.089,
      1.0871,
      1.0832,
      1.0777,
      1.0712,
      1.064,
      1.0564,
      1.0488,
      1.0412,
      1.034,
      1.0272,
      1.021,
      1.0154,
      1.0105,
      1.0062,
      1.0026,
      0.9996,
      0.9972,
      0.9953,
      0.9939,
      0.9929,
      0.9924,
      0.9921,
      0.9921,
      0.9923,
      0.9927,
      0.9932,
      0.9938,
      0.9945,
      0.9952,
      0.9958,
      0.9965,
      0.9971,
      0.9977,
      0.9983,
      0.9987,
      0.9992,
      0.9995,
      0.9998,
      1.0001,
      1.0003,
      1.0005,
      1.0006,
      1.0006,
      1.0007,
      1.0007,
      1.0007,
      1.0007,
      1.0006,
      1.0006,
      1.0005,
      1.0005,
      1.0004,
      1.0004,
      1.0003,
      1.0002,
      1.0002,
      1.0001,
      1.0001,
      1.0001,
      1,
      1,
      1,
      1,
      1,
      0.9999,
      0.9999,
      0.9999,
      0.9999,
      0.9999,
      0.9999,
      0.9999,
      0.9999,
      1,
      1,
      1,
      1,
      1
    );

  color-scheme: light dark;
}

@media (prefers-color-scheme: dark) {
  :root {
    --color-text: #f4efe9;
    --color-background: #141110;
  }
}
```

- [ ] **Step 4: Import tokens in root layout**

In `src/routes/+layout.svelte` add after the existing imports (both stylesheets coexist during migration):

```ts
import "$lib/styles/tokens.css";
```

- [ ] **Step 5: Verify dev + build still work with Tailwind coexisting**

Run: `pnpm build`
Expected: build succeeds. **Contingency:** if Lightning CSS chokes on Tailwind's output, drop `transformer`/`cssMinify` from the config now and re-add them in Task 12 (cleanup) — tokens.css needs no transforms on evergreen browsers.

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Add design tokens and Lightning CSS pipeline"
```

---

### Task 2: Base components — button, badge, card, skeleton, avatar, tabs

**Files:**

- Create: `src/lib/shared/components/button/{button.svelte,index.ts}`
- Create: `src/lib/shared/components/badge/{badge.svelte,index.ts}`
- Create: `src/lib/shared/components/card/{card.svelte,index.ts}`
- Create: `src/lib/shared/components/skeleton/{skeleton.svelte,index.ts}`
- Create: `src/lib/shared/components/avatar/{avatar.svelte,index.ts}`
- Create: `src/lib/shared/components/tabs/{tabs.svelte,index.ts}`

**Interfaces:**

- Consumes: tokens from Task 1.
- Produces:
  - `Button`: `{ type?, kind?: "primary"|"secondary"|"ghost"|"danger", size?: "md"|"sm", disabled?, onClick?: (e: MouseEvent) => void, children? }`
  - `Badge`: `{ children? }` — accent-tinted pill.
  - `Card`: `{ children?, onClick? }` — tinted surface; renders `<button>` when onClick given.
  - `Skeleton`: `{ width?: string, height?: string }` (CSS sizes).
  - `Avatar`: `{ name: string, size?: number }` — initials only (current app never has images).
  - `Tabs`: `{ items: { value: string; label: string }[], value: string, onChange?: (v: string) => void }`

- [ ] **Step 1: Button** — `src/lib/shared/components/button/button.svelte`

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    type?: "submit" | "reset" | "button";
    kind?: "primary" | "secondary" | "ghost" | "danger";
    size?: "md" | "sm";
    disabled?: boolean;
    onClick?: (e: MouseEvent) => void;
    children?: Snippet;
  }
  const {
    type = "button",
    kind = "primary",
    size = "md",
    disabled,
    onClick,
    children,
  }: Props = $props();
</script>

<button class="btn kind__{kind} size__{size}" {type} {disabled} onclick={onClick}>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    border-radius: var(--border-radius);
    color: var(--color, var(--color-text));
    background-color: oklch(from var(--color, var(--color-text)) l c h / 12%);
    transition:
      transform var(--spring-transition),
      background-color 0.15s ease;

    &:hover:not(:disabled) {
      background-color: oklch(from var(--color, var(--color-text)) l c h / 20%);
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
  .size__md {
    height: 40px;
    padding: 0 16px;
  }
  .size__sm {
    height: 30px;
    padding: 0 10px;
    font-size: 0.85rem;
  }
  .kind__primary {
    background-color: var(--color-accent);
    color: oklch(1 0 0);
    &:hover:not(:disabled) {
      background-color: oklch(from var(--color-accent) calc(l * 1.08) c h);
    }
  }
  .kind__secondary {
    --color: var(--color-text);
  }
  .kind__ghost {
    --color: var(--color-text);
    background-color: transparent;
  }
  .kind__danger {
    --color: var(--color-error);
  }
</style>
```

`index.ts`: `export { default as Button } from "./button.svelte";`

- [ ] **Step 2: Badge**

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    children?: Snippet;
  }
  const { children }: Props = $props();
</script>

<span class="badge">{@render children?.()}</span>

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 10px;
    font-size: 0.75rem;
    font-weight: 500;
    border-radius: calc(var(--border-radius) / 2);
    color: var(--color-accent);
    background: oklch(from var(--color-accent) l c h / 12%);
  }
</style>
```

- [ ] **Step 3: Card**

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    onClick?: () => void;
    children?: Snippet;
  }
  const { onClick, children }: Props = $props();
</script>

{#if onClick}
  <button class="card clickable" onclick={onClick}>{@render children?.()}</button>
{:else}
  <div class="card">{@render children?.()}</div>
{/if}

<style>
  .card {
    display: block;
    width: 100%;
    text-align: start;
    font: inherit;
    color: inherit;
    border: none;
    padding: 16px;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 5%);
  }
  .clickable {
    cursor: pointer;
    transition: transform var(--spring-transition);
    &:active {
      transform: scale(0.98);
    }
  }
</style>
```

- [ ] **Step 4: Skeleton**

```svelte
<script lang="ts">
  interface Props {
    width?: string;
    height?: string;
  }
  const { width = "100%", height = "16px" }: Props = $props();
</script>

<div class="skeleton" style:width style:height></div>

<style>
  .skeleton {
    border-radius: calc(var(--border-radius) / 2);
    background: oklch(from var(--color-text) l c h / 8%);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    50% {
      opacity: 0.5;
    }
  }
</style>
```

- [ ] **Step 5: Avatar**

```svelte
<script lang="ts">
  interface Props {
    name: string;
    size?: number;
  }
  const { name, size = 32 }: Props = $props();
  const initials = $derived(name.slice(0, 2).toUpperCase());
</script>

<span class="avatar" style:--size="{size}px">{initials}</span>

<style>
  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: var(--size);
    height: var(--size);
    border-radius: calc(var(--border-radius) / 1.5);
    font-size: calc(var(--size) * 0.38);
    font-weight: 600;
    color: var(--color-accent);
    background: oklch(from var(--color-accent) l c h / 15%);
  }
</style>
```

- [ ] **Step 6: Tabs**

```svelte
<script lang="ts">
  interface Props {
    items: { value: string; label: string }[];
    value: string;
    onChange?: (value: string) => void;
  }
  const { items, value, onChange }: Props = $props();
</script>

<div class="tabs" role="tablist">
  {#each items as item (item.value)}
    <button
      role="tab"
      aria-selected={item.value === value}
      class:active={item.value === value}
      onclick={() => onChange?.(item.value)}
    >
      {item.label}
    </button>
  {/each}
</div>

<style>
  .tabs {
    display: flex;
    gap: 4px;
    padding: 4px;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 6%);
    width: fit-content;
  }
  button {
    border: none;
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    padding: 6px 14px;
    border-radius: calc(var(--border-radius) - 4px);
    background: transparent;
    color: oklch(from var(--color-text) l c h / 60%);
    transition: background-color 0.15s ease;

    &.active {
      background: var(--color-background);
      color: var(--color-text);
    }
  }
</style>
```

- [ ] **Step 7: Verify**

Run: `pnpm check`
Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "Add base components: button, badge, card, skeleton, avatar, tabs"
```

---

### Task 3: Form components — input, textarea, field, select, checkbox, switch

**Files:**

- Create: `src/lib/shared/components/input/{input.svelte,index.ts}`
- Create: `src/lib/shared/components/textarea/{textarea.svelte,index.ts}`
- Create: `src/lib/shared/components/field/{field.svelte,index.ts}`
- Create: `src/lib/shared/components/select/{select.svelte,index.ts}`
- Create: `src/lib/shared/components/checkbox/{checkbox.svelte,index.ts}`
- Create: `src/lib/shared/components/switch/{switch.svelte,index.ts}`

**Interfaces:**

- Produces:
  - `Input`: `{ value?: string ($bindable), type?, placeholder?, disabled?, required?, name?, autocomplete?, onInput?: (v: string) => void }`
  - `Textarea`: `{ value?: string ($bindable), placeholder?, rows?, disabled? }`
  - `Field`: `{ label?: string, error?: string, children? }` — wraps any control in a `<label>`.
  - `Select`: `{ value?: string ($bindable), options: { value: string; label: string }[], disabled?, onChange?: (v: string) => void }` — native `<select>`.
  - `Checkbox`: `{ checked?: boolean ($bindable), disabled?, onChange?: (v: boolean) => void }`
  - `Switch`: same props as Checkbox.

- [ ] **Step 1: Input**

```svelte
<script lang="ts">
  interface Props {
    value?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    autocomplete?: string;
    onInput?: (value: string) => void;
  }
  let {
    value = $bindable(""),
    type = "text",
    placeholder,
    disabled,
    required,
    name,
    autocomplete,
    onInput,
  }: Props = $props();
</script>

<input
  {type}
  {placeholder}
  {disabled}
  {required}
  {name}
  {autocomplete}
  bind:value
  oninput={() => onInput?.(value)}
/>

<style>
  input {
    width: 100%;
    height: 40px;
    padding: 0 12px;
    font: inherit;
    color: var(--color-text);
    background: oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    transition: border-color 0.15s ease;

    &::placeholder {
      color: oklch(from var(--color-text) l c h / 40%);
    }
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
    }
  }
</style>
```

(Note: `type` + `bind:value` on a dynamic-type input is allowed in Svelte 5 runes mode; if `svelte-check` objects, split into a static `type="text"` input plus `{...rest}` spread.)

- [ ] **Step 2: Textarea** — same skin, `rows` default 3:

```svelte
<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
  }
  let { value = $bindable(""), placeholder, rows = 3, disabled }: Props = $props();
</script>

<textarea {placeholder} {rows} {disabled} bind:value></textarea>

<style>
  textarea {
    width: 100%;
    padding: 10px 12px;
    font: inherit;
    color: var(--color-text);
    background: oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    resize: vertical;

    &::placeholder {
      color: oklch(from var(--color-text) l c h / 40%);
    }
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
</style>
```

- [ ] **Step 3: Field**

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    label?: string;
    error?: string;
    children?: Snippet;
  }
  const { label, error, children }: Props = $props();
</script>

<label class="field">
  {#if label}<span class="label">{label}</span>{/if}
  {@render children?.()}
  {#if error}<span class="error">{error}</span>{/if}
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .error {
    font-size: 0.75rem;
    color: var(--color-error);
  }
</style>
```

- [ ] **Step 4: Select** (native)

```svelte
<script lang="ts">
  interface Props {
    value?: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
    onChange?: (value: string) => void;
  }
  let { value = $bindable(""), options, disabled, onChange }: Props = $props();
</script>

<select bind:value {disabled} onchange={() => onChange?.(value)}>
  {#each options as opt (opt.value)}
    <option value={opt.value}>{opt.label}</option>
  {/each}
</select>

<style>
  select {
    width: 100%;
    height: 40px;
    padding: 0 32px 0 12px;
    font: inherit;
    color: var(--color-text);
    background:
      no-repeat right 10px center / 14px
        url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>'),
      oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    appearance: none;
    cursor: pointer;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
    }
  }
</style>
```

- [ ] **Step 5: Switch** (hidden native checkbox, friendzone pattern)

```svelte
<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), disabled, onChange }: Props = $props();
</script>

<label class="root">
  <input type="checkbox" bind:checked {disabled} onchange={() => onChange?.(checked)} />
  <span class="switch"><span class="thumb"></span></span>
</label>

<style>
  .root {
    display: inline-flex;
    cursor: pointer;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .switch {
    width: 40px;
    height: 24px;
    padding: 3px;
    border-radius: 12px;
    background: oklch(from var(--color-text) l c h / 15%);
    transition: background-color 0.2s ease;
  }
  .thumb {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: oklch(1 0 0);
    transition: transform var(--spring-transition);
  }
  input:checked + .switch {
    background: var(--color-accent);
    .thumb {
      transform: translateX(16px);
    }
  }
  input:disabled + .switch {
    opacity: 0.5;
  }
  input:focus-visible + .switch {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
```

- [ ] **Step 6: Checkbox** (same pattern, square + check)

```svelte
<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), disabled, onChange }: Props = $props();
</script>

<label class="root">
  <input type="checkbox" bind:checked {disabled} onchange={() => onChange?.(checked)} />
  <span class="box"><Check size={14} strokeWidth={3} /></span>
</label>

<style>
  .root {
    display: inline-flex;
    cursor: pointer;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 1.5px solid oklch(from var(--color-text) l c h / 25%);
    color: transparent;
    transition: all 0.15s ease;
  }
  input:checked + .box {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: oklch(1 0 0);
  }
  input:focus-visible + .box {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
```

- [ ] **Step 7: Verify + commit**

Run: `pnpm check` → 0 errors.

```bash
git add -A && git commit -m "Add form components: input, textarea, field, select, checkbox, switch"
```

---

### Task 4: Overlays — dialog (modal + drawer) and menu

**Files:**

- Create: `src/lib/shared/components/dialog/{dialog.svelte,index.ts}`
- Create: `src/lib/shared/components/menu/{menu.svelte,menu-item.svelte,index.ts}`
- Test: `tests/ui-menu.svelte.test.ts`, `tests/__fixtures__/menu-fixture.svelte`

**Interfaces:**

- Produces:
  - `Dialog`: `{ open?: boolean, title?: string, side?: boolean, onClose?: () => void, children? }`. `side` turns it into a right-edge drawer (replaces shadcn Sheet). Parent controls `open`; Esc/backdrop/X call `onClose` — parent must set its flag to false there.
  - `Menu`: `{ trigger: Snippet<[{ open: boolean; toggle: () => void }]>, align?: "start" | "end", children? }`. Closes on outside pointerdown and after item click.
  - `MenuItem`: `{ danger?: boolean, onClick?: () => void, children? }`

- [ ] **Step 1: Write the failing menu test**

`tests/__fixtures__/menu-fixture.svelte`:

```svelte
<script lang="ts">
  import { Menu, MenuItem } from "$lib/shared/components/menu";
</script>

<button data-testid="outside">outside</button>
<Menu>
  {#snippet trigger({ toggle })}
    <button data-testid="trigger" onclick={toggle}>open</button>
  {/snippet}
  <MenuItem onClick={() => {}}>Item A</MenuItem>
</Menu>
```

`tests/ui-menu.svelte.test.ts`:

```ts
import { test, expect } from "vitest";
import { render } from "vitest-browser-svelte";
import MenuFixture from "./__fixtures__/menu-fixture.svelte";

test("menu opens on trigger and closes on outside pointerdown", async () => {
  const screen = render(MenuFixture);

  await screen.getByTestId("trigger").click();
  await expect.element(screen.getByRole("menu")).toBeInTheDocument();

  await screen.getByTestId("outside").click();
  await expect.element(screen.getByRole("menu")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- ui-menu`
Expected: FAIL — cannot resolve `$lib/shared/components/menu`.

- [ ] **Step 3: Implement menu**

`menu.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    trigger: Snippet<[{ open: boolean; toggle: () => void }]>;
    align?: "start" | "end";
    children?: Snippet;
  }
  const { trigger, align = "end", children }: Props = $props();

  let open = $state(false);
  let root = $state<HTMLDivElement>();
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && root && !root.contains(e.target as Node)) open = false;
  }}
/>

<div class="root" bind:this={root}>
  {@render trigger({ open, toggle: () => (open = !open) })}
  {#if open}
    <div class="menu align__{align}" role="menu" onclick={() => (open = false)}>
      {@render children?.()}
    </div>
  {/if}
</div>

<style>
  .root {
    position: relative;
    display: inline-flex;
  }
  .menu {
    position: absolute;
    top: calc(100% + 6px);
    z-index: 50;
    min-width: 180px;
    padding: 4px;
    display: flex;
    flex-direction: column;
    border-radius: var(--border-radius);
    background: var(--color-background);
    border: 1px solid oklch(from var(--color-text) l c h / 10%);
    box-shadow: 0 8px 24px oklch(0 0 0 / 12%);
  }
  .align__end {
    inset-inline-end: 0;
  }
  .align__start {
    inset-inline-start: 0;
  }
</style>
```

`menu-item.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    danger?: boolean;
    onClick?: () => void;
    children?: Snippet;
  }
  const { danger, onClick, children }: Props = $props();
</script>

<button class="item" class:danger role="menuitem" onclick={onClick}>
  {@render children?.()}
</button>

<style>
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.875rem;
    color: var(--color-text);
    cursor: pointer;
    padding: 8px 10px;
    border-radius: calc(var(--border-radius) - 4px);
    text-align: start;

    &:hover {
      background: oklch(from var(--color-text) l c h / 6%);
    }
  }
  .danger {
    color: var(--color-error);
  }
</style>
```

`index.ts`:

```ts
export { default as Menu } from "./menu.svelte";
export { default as MenuItem } from "./menu-item.svelte";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- ui-menu`
Expected: PASS.

- [ ] **Step 5: Implement dialog**

`dialog.svelte`:

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";
  import X from "@lucide/svelte/icons/x";

  interface Props {
    open?: boolean;
    title?: string;
    side?: boolean;
    onClose?: () => void;
    children?: Snippet;
  }
  const { open = false, title, side = false, onClose, children }: Props = $props();

  let el = $state<HTMLDialogElement>();

  $effect(() => {
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  });
</script>

<dialog
  bind:this={el}
  class:side
  onclose={() => onClose?.()}
  onclick={(e) => {
    if (e.target === el) el.close();
  }}
>
  <header>
    {#if title}<h2>{title}</h2>{/if}
    <button class="close" aria-label="Close" onclick={() => el?.close()}>
      <X size={18} />
    </button>
  </header>
  <div class="body">{@render children?.()}</div>
</dialog>

<style>
  dialog {
    border: none;
    padding: 0;
    color: var(--color-text);
    background: var(--color-background);
    border-radius: var(--border-radius);
    width: min(480px, calc(100vw - 32px));
    opacity: 0;
    transform: translateY(12px) scale(0.98);
    transition:
      opacity 0.2s ease,
      transform var(--spring-transition),
      display 0.25s allow-discrete,
      overlay 0.25s allow-discrete;

    &[open] {
      opacity: 1;
      transform: none;
      @starting-style {
        opacity: 0;
        transform: translateY(12px) scale(0.98);
      }
    }
    &::backdrop {
      background: oklch(0 0 0 / 40%);
    }
  }
  dialog.side {
    margin: 0 0 0 auto;
    height: 100svh;
    max-height: 100svh;
    width: min(420px, 90vw);
    border-radius: 0;
    transform: translateX(24px);
    &[open] {
      transform: none;
      @starting-style {
        opacity: 0;
        transform: translateX(24px);
      }
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 16px 0;
    h2 {
      margin: 0;
      font-size: 1.05rem;
    }
  }
  .close {
    margin-inline-start: auto;
    border: none;
    background: transparent;
    cursor: pointer;
    color: oklch(from var(--color-text) l c h / 55%);
    padding: 4px;
    border-radius: 6px;
    &:hover {
      background: oklch(from var(--color-text) l c h / 8%);
    }
  }
  .body {
    padding: 16px;
  }
</style>
```

- [ ] **Step 6: Verify + commit**

Run: `pnpm check && pnpm test` → 0 errors, tests pass.

```bash
git add -A && git commit -m "Add dialog and menu overlay components"
```

---

### Task 5: New layout — app-header, bottom-nav rewrite, (app) layout, drop sidebar

**Files:**

- Create: `src/lib/shared/components/app-header/{app-header.svelte,index.ts}`
- Modify: `src/lib/shared/components/bottom-nav.svelte` (full rewrite)
- Modify: `src/routes/(app)/+layout.svelte` (full rewrite)
- Delete: `src/lib/shared/components/ui/sidebar/` (whole dir), `src/lib/shared/components/ui/tooltip/`, `src/lib/shared/components/app-sidebar.svelte`, `src/lib/shared/components/site-header.svelte`, `src/lib/shared/components/nav-user.svelte`

**Interfaces:**

- Consumes: `Avatar`, `Menu`, `MenuItem` (Tasks 2, 4); `authModel` (`$user`, `logout`) from `$lib/modules/auth/model`.
- Produces: `AppHeader` (no props), rewritten `BottomNav` (no props). `(app)/+layout.svelte` renders header + `<main class="content">` + bottom nav; main is the scroll container (`overflow: hidden` like today's Inset — pages manage their own scroll).

- [ ] **Step 1: app-header.svelte**

```svelte
<script lang="ts">
  import { page } from "$app/state";
  import LogOut from "@lucide/svelte/icons/log-out";
  import { authModel } from "$lib/modules/auth/model";
  import { Avatar } from "$lib/shared/components/avatar";
  import { Menu, MenuItem } from "$lib/shared/components/menu";

  const { $user: user, logout } = authModel;
  const nav = $derived([
    { title: "Market", url: "/market" },
    { title: "Editor", url: "/editor" },
    ...($user ? [{ title: "My", url: "/my" }] : []),
    { title: "Watch", url: "/watch" },
  ]);
</script>

<header>
  <a class="logo" href="/">fmc</a>
  <nav>
    {#each nav as item (item.url)}
      <a href={item.url} class:active={page.url.pathname.startsWith(item.url)}>
        {item.title}
      </a>
    {/each}
  </nav>
  <div class="user">
    {#if $user}
      <Menu>
        {#snippet trigger({ toggle })}
          <button class="avatar-btn" onclick={toggle} aria-label="Account">
            <Avatar name={$user.name || $user.email} />
          </button>
        {/snippet}
        <MenuItem danger onClick={() => logout()}>
          <LogOut size={16} />
          Log out
        </MenuItem>
      </Menu>
    {:else}
      <a class="signin" href="/login">Sign in</a>
    {/if}
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 24px;
    height: 56px;
    padding: 0 16px;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .logo {
    font-family: var(--font-display);
    font-weight: 600;
    text-decoration: none;
    color: var(--color-accent);
  }
  nav {
    display: flex;
    gap: 4px;

    a {
      text-decoration: none;
      font-size: 0.9rem;
      padding: 6px 12px;
      border-radius: calc(var(--border-radius) / 1.5);
      color: oklch(from var(--color-text) l c h / 60%);

      &:hover {
        background: oklch(from var(--color-text) l c h / 6%);
      }
      &.active {
        color: var(--color-text);
        background: oklch(from var(--color-text) l c h / 8%);
      }
    }
  }
  .user {
    margin-inline-start: auto;
  }
  .avatar-btn {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
  }
  .signin {
    font-size: 0.9rem;
    color: var(--color-accent);
    text-decoration: none;
  }
  @media (max-width: 767px) {
    nav {
      display: none; /* bottom-nav takes over */
    }
  }
</style>
```

- [ ] **Step 2: Rewrite bottom-nav.svelte** (same nav model, no Tailwind/cn)

```svelte
<script lang="ts">
  import Store from "@lucide/svelte/icons/store";
  import Pencil from "@lucide/svelte/icons/pencil";
  import WatchIcon from "@lucide/svelte/icons/watch";
  import FolderHeart from "@lucide/svelte/icons/folder-heart";
  import { page } from "$app/state";
  import { authModel } from "$lib/modules/auth/model";

  const { $user: user } = authModel;
  const nav = $derived([
    { title: "Market", url: "/market", icon: Store },
    { title: "Editor", url: "/editor", icon: Pencil },
    ...($user ? [{ title: "My", url: "/my", icon: FolderHeart }] : []),
    { title: "Watch", url: "/watch", icon: WatchIcon },
  ]);
</script>

<!-- mobile bottom tab bar; on md+ navigation lives in the app header -->
<nav>
  {#each nav as item (item.url)}
    <a href={item.url} class:active={page.url.pathname.startsWith(item.url)}>
      <item.icon size={20} />
      {item.title}
    </a>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--color-background);
    border-top: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.7rem;
    text-decoration: none;
    color: oklch(from var(--color-text) l c h / 50%);

    &.active {
      color: var(--color-accent);
    }
  }
  @media (min-width: 768px) {
    nav {
      display: none;
    }
  }
</style>
```

- [ ] **Step 3: Rewrite `src/routes/(app)/+layout.svelte`**

```svelte
<script lang="ts">
  import AppHeader from "$lib/shared/components/app-header/app-header.svelte";
  import BottomNav from "$lib/shared/components/bottom-nav.svelte";

  let { children } = $props();
</script>

<div class="shell">
  <AppHeader />
  <main>
    {@render children()}
  </main>
  <BottomNav />
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100svh;
  }
  main {
    flex: 1;
    overflow: hidden;
  }
  @media (max-width: 767px) {
    main {
      /* keep content clear of the fixed bottom tab bar */
      padding-bottom: calc(56px + env(safe-area-inset-bottom));
    }
  }
</style>
```

- [ ] **Step 4: Delete sidebar family**

```bash
rm -r src/lib/shared/components/ui/sidebar src/lib/shared/components/ui/tooltip
rm src/lib/shared/components/app-sidebar.svelte src/lib/shared/components/site-header.svelte src/lib/shared/components/nav-user.svelte
```

Then `grep -rn "sidebar\|site-header\|nav-user\|use-mobile" src/` — fix any leftover import (the `sidebar` ui component had a `use-mobile` hook import; delete `src/lib/shared/hooks/` too if nothing else uses it).

- [ ] **Step 5: Verify**

Run: `pnpm check && pnpm build` → passes.
Run `pnpm dev`, open `/market`: header on top with nav links, no sidebar, bottom tabs on a narrow viewport. Pages themselves still Tailwind-styled — that's expected until Tasks 6–10.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Replace sidebar layout with app header + bottom tab bar"
```

---

### Task 6: Migrate auth pages

**Files:**

- Modify: `src/lib/modules/auth/components/login-form.svelte`
- Modify: `src/lib/modules/auth/components/signup-form.svelte`
- Modify: `src/lib/modules/auth/pages/login.svelte`, `src/lib/modules/auth/pages/register.svelte`

**Interfaces:**

- Consumes: `Button`, `Input`, `Field`, `Card` (Tasks 2–3). Auth logic stays in `authModel` untouched.

- [ ] **Step 1: Rewrite login-form.svelte** — replace `ui/button`, `ui/input`, `ui/field`, `ui/card` imports with the new components; form structure: `Field label="Email" > Input`, `Field label="Password" > Input type="password"`, submit `Button kind="primary" type="submit"`, error from the model shown in red under the form (`color: var(--color-error)`). Remove all Tailwind classes and `cn()`; layout via scoped styles (`display: flex; flex-direction: column; gap: 12px`). Keep the exact effector wiring (`loginFx`, pending flag from `loginFx.pending`, `.catch(() => {})` on calls).
- [ ] **Step 2: Same for signup-form.svelte** (name/email/password fields).
- [ ] **Step 3: Pages login.svelte / register.svelte** — center the form card: scoped style `display: grid; place-items: center; height: 100%` on the page wrapper, form inside `Card` (max-width: 380px). Display heading in `var(--font-display)`. Cross-link ("No account? Register") as a plain accent-colored link.
- [ ] **Step 4: Verify**

Run: `pnpm check` → 0 errors. Run `pnpm dev`, open `/login` and `/register`: forms render in the new style, login flow against dev PocketBase still works.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Migrate auth pages to custom components"
```

---

### Task 7: Migrate market pages

**Files:**

- Modify: `src/lib/modules/market/components/watchface-card/watchface-card.svelte`
- Modify: `src/lib/modules/market/pages/market.svelte`
- Modify: `src/lib/modules/market/pages/my.svelte`

**Interfaces:**

- Consumes: `Card`, `Badge`, `Button`, `Skeleton`, `Input` (search, if present), `Menu`/`MenuItem` (per-card actions in `my.svelte`, if present — check current markup). Market logic stays in `marketModel`.

- [ ] **Step 1: watchface-card.svelte** — keep its current props/contract (it's consumed by both pages). Replace Tailwind grid/spacing with scoped styles: preview image with `border-radius: var(--border-radius)`, title, author `oklch(… / 55%)`, downloads badge → `Badge`. Card is clickable → wrap in `Card onClick` or keep `<a>` with card styles.
- [ ] **Step 2: market.svelte** — page scroll container (`overflow-y: auto; height: 100%`), responsive grid `display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 16px; padding: 16px`. Loading state: grid of `Skeleton` blocks sized like cards (use `marketFx.pending`). Error from `marketErr` in `var(--color-error)`.
- [ ] **Step 3: my.svelte** — same grid; per-item actions (edit/delete/publish — mirror whatever the current markup has) via `Button kind="ghost" size="sm"` or `Menu` with `MenuItem danger` for delete.
- [ ] **Step 4: Verify**

Run: `pnpm check`; `pnpm dev` → `/market`, `/my` render, cards clickable, skeletons show on slow network (throttle in devtools).

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Migrate market pages to custom components"
```

---

### Task 8: Migrate landing page

**Files:**

- Modify: `src/routes/+page.svelte`

**Interfaces:**

- Consumes: `Button`, `Badge`. This is the marketing page — display font allowed liberally.

- [ ] **Step 1: Rewrite `src/routes/+page.svelte`** — keep the current content/sections (hero, features, CTA — 32 Tailwind class usages), converting per the Global Constraints cheatsheet. Hero heading in `var(--font-display)`, accent CTA `Button kind="primary"` linking to `/market`. All spacing/layout via one scoped `<style>` block.
- [ ] **Step 2: Verify** — `pnpm check`; visually compare `/` in dev: same sections, new skin, dark scheme honored.
- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Migrate landing page to custom components"
```

---

### Task 9: Migrate watch (device) page

**Files:**

- Modify: `src/lib/modules/device/pages/watch.svelte`

**Interfaces:**

- Consumes: `Button`, `Card`, `Badge`, `Skeleton`, `Dialog` (if the page has a confirm/progress dialog — mirror current markup). BLE logic stays in the device model / `ble.ts` — untouched.

- [ ] **Step 1: Rewrite watch.svelte markup** — connection state card (`Card`), connect/pair actions (`Button kind="primary"`), status text muted, progress/errors per cheatsheet. 21 Tailwind usages to convert.
- [ ] **Step 2: Verify** — `pnpm check`; `pnpm dev` over `BASIC_SSL=1` if needed, confirm page renders and the connect button still triggers `requestDevice` (needs a real watch only for full pairing — UI smoke is enough here).
- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "Migrate watch page to custom components"
```

---

### Task 10: Migrate editor — panels

**Files:**

- Modify: `src/lib/modules/editor/components/PropsPanel.svelte` (54 class usages — heaviest)
- Modify: `src/lib/modules/editor/components/TreePanel.svelte`
- Modify: `src/lib/modules/editor/components/SimPanel.svelte`
- Modify: `src/lib/modules/editor/components/PublishDialog.svelte`

**Interfaces:**

- Consumes: `Input`, `Select`, `Checkbox`, `Switch`, `Tabs`, `Button`, `Field`, `Dialog` (PublishDialog), `Textarea` (publish description). Editor model contract (`patched`, `treeChanged`, `$editor`, undo/redo) untouched.

- [ ] **Step 1: PropsPanel.svelte** — replace `ui/select` → `Select` (options prop from the same data), `ui/input` → `Input`, `ui/checkbox`/`ui/switch` → new ones, `ui/tabs` → `Tabs`, labels → `Field` or plain `<span class="label">`. Panel chrome: fixed width column, `overflow-y: auto`, section headings `0.75rem` uppercase muted. Remove the 1 `cn()` usage.
- [ ] **Step 2: TreePanel.svelte** — node rows: flex rows with hover `oklch(… / 6%)`, selected row `oklch(from var(--color-accent) l c h / 12%)`; indent via `padding-inline-start: calc(depth * 12px)`.
- [ ] **Step 3: SimPanel.svelte** — controls to `Switch`/`Select`/`Input` equivalents, layout per cheatsheet.
- [ ] **Step 4: PublishDialog.svelte** — `ui/dialog` → new `Dialog` (`open` + `onClose` wired to whatever flag the component already uses), body: `Field`+`Input`/`Textarea`, footer `Button kind="primary"` publish + `Button kind="ghost"` cancel; busy from the publish effect's `.pending`.
- [ ] **Step 5: Verify** — `pnpm check && pnpm test` (editor tests must stay green — they exercise the model/render, not these panels, so failures mean an accidental model change). In dev: load a face in `/editor`, edit props, reorder tree, publish dialog opens/closes.
- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "Migrate editor panels to custom components"
```

---

### Task 11: Migrate editor page shell

**Files:**

- Modify: `src/lib/modules/editor/pages/editor.svelte` (43 class usages; `Sheet` at lines 397-415)

**Interfaces:**

- Consumes: `Dialog` with `side` (drawer replaces `Sheet.Root`/`Sheet.Content`), `Button`, `Tabs`. Canvas/rAF drawing untouched.

- [ ] **Step 1: Replace Sheet** — `<Sheet.Root bind:open={x}>…<Sheet.Content>` becomes `<Dialog side open={x} onClose={() => (x = false)}>` with the same inner content (check how `open` is currently bound and keep that state variable).
- [ ] **Step 2: Convert the page chrome** — toolbar (undo/redo/save buttons → `Button kind="ghost" size="sm"`), panel split layout via CSS grid (`grid-template-columns: auto 1fr auto`), statusbar text muted. Canvas area keeps its exact sizing behavior — only classes change, not dimensions logic.
- [ ] **Step 3: Verify** — `pnpm check && pnpm test`; in dev: open `/editor`, canvas renders, undo/redo works, drawer opens.
- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "Migrate editor page shell to custom components"
```

---

### Task 12: Cleanup — remove shadcn, bits-ui, Tailwind

**Files:**

- Delete: `src/lib/shared/components/ui/` (entire directory)
- Delete: `src/app.css`, `src/theme.css`
- Modify: `src/routes/+layout.svelte` (drop `../theme.css` + `../app.css` imports)
- Modify: `src/lib/shared/helpers/index.ts` (remove `cn`, `WithElementRef`, `WithoutChild*` — if nothing remains, delete the file/folder and fix importers)
- Modify: `vite.config.ts` (remove `@tailwindcss/vite` import + `tailwindcss()` plugin; ensure Lightning CSS config from Task 1 is active if it was deferred)
- Modify: `package.json`

- [ ] **Step 1: Confirm nothing references the old world**

```bash
grep -rn "components/ui\|bits-ui\|tailwind\|cn(" src/ --include="*.svelte" --include="*.ts" | grep -v tokens.css
```

Expected: no hits (fix any stragglers before deleting).

- [ ] **Step 2: Delete files** — `rm -r src/lib/shared/components/ui src/app.css src/theme.css`, drop the two CSS imports from `src/routes/+layout.svelte`, trim `helpers/index.ts`.

- [ ] **Step 3: Remove deps**

```bash
pnpm remove bits-ui tailwindcss @tailwindcss/vite tailwind-merge tailwind-variants clsx tw-animate-css @internationalized/date
```

Remove `tailwindcss()` from `vite.config.ts`.

- [ ] **Step 4: Full verify**

Run: `pnpm check && pnpm build && pnpm test`
Expected: all green. Walk every route in dev (`/`, `/market`, `/my`, `/editor`, `/watch`, `/login`, `/register`) in light + dark scheme.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "Remove shadcn, bits-ui and Tailwind"
```
