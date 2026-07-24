<script lang="ts">
  interface Props {
    items: { value: string; label: string; disabled?: boolean }[];
    value: string;
    onChange?: (value: string) => void;
  }
  const { items, value, onChange }: Props = $props();
</script>

<div class="tabs" role="tablist">
  {#each items as item (item.value)}
    <button
      type="button"
      role="tab"
      aria-selected={item.value === value}
      class:active={item.value === value}
      disabled={item.disabled}
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
    &:disabled {
      opacity: 0.4;
      cursor: default;
    }
  }
</style>
