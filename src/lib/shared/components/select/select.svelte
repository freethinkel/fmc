<script lang="ts">
  // A select built on Menu, so the dropdown is the same surface as every other popup in the
  // app — and, where anchor positioning exists, lives in the top layer instead of being clipped
  // by a panel's scroll container. The chosen row carries a check, like a macOS pop-up button.
  import { Icon } from "$lib/shared/components/icon";
  import { Menu, MenuItem } from "$lib/shared/components/menu";

  interface Props {
    value?: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
    onChange?: (value: string) => void;
  }
  let { value = $bindable(""), options, disabled, onChange }: Props = $props();

  const current = $derived(options.find((o) => o.value === value));

  function pick(v: string) {
    value = v;
    onChange?.(v);
  }
</script>

<span class="field">
  <Menu align="start">
    {#snippet trigger({ open, toggle })}
      <button
        type="button"
        class="select"
        class:open
        {disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onclick={toggle}
      >
        <span class="label">{current?.label ?? ""}</span>
        <Icon name="chevron_right" size={18} class="chevron" />
      </button>
    {/snippet}
    {#each options as opt (opt.value)}
      <MenuItem onClick={() => pick(opt.value)}>
        <span class="check" class:on={opt.value === value}>
          <Icon name="check" size={18} />
        </span>
        {opt.label}
      </MenuItem>
    {/each}
  </Menu>
</span>

<style>
  /* the Menu root is an inline box; the select fills its field like the native one did */
  .field,
  .field :global(.root) {
    display: flex;
    width: 100%;
  }
  /* the trigger keeps the native select's box, so nothing around it moves — see input/ */
  .select {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    height: 2.25rem;
    padding: 0 0.75rem;
    font: inherit;
    font-size: 1rem;
    color: var(--color-text);
    text-align: start;
    background: oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: 10em;
    cursor: pointer;

    &:focus-visible,
    &.open {
      outline: none;
      border-color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* one chevron glyph, pointed down — the menu's items inherit the open state from Menu */
  .select :global(.chevron) {
    flex: none;
    rotate: 90deg;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .check {
    display: inline-flex;
    width: 1.125rem;
    color: var(--color-accent);
    visibility: hidden;

    &.on {
      visibility: visible;
    }
  }
</style>
