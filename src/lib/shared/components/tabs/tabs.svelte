<script lang="ts">
  interface Props {
    items: { value: string; label: string; disabled?: boolean }[];
    value: string;
    /** Fill the container and split the width evenly, instead of hugging the labels. */
    full?: boolean;
    onChange?: (value: string) => void;
  }
  const { items, value, full, onChange }: Props = $props();
</script>

<div class="tabs" class:full role="tablist">
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
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 6%);
    width: fit-content;

    &.full {
      width: 100%;

      button {
        flex: 1;
        min-width: 0;
      }
    }
  }
  button {
    border: none;
    font: inherit;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.375rem 0.875rem;
    border-radius: calc(var(--border-radius) - 0.25rem);
    background: transparent;
    color: oklch(from var(--color-text) l c h / 60%);
    transition: background-color 0.15s ease;
    /* a `full` tablist splits the width evenly, so a long label has to cut rather than push its
       neighbour out — the padding stays, only the text clips */
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;

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
