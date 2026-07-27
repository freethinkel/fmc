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
    gap: 0.5rem;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.75rem;
    color: var(--color-text);
    cursor: pointer;
    padding: 0.5rem 0.625rem;
    border-radius: calc(var(--border-radius) - 0.25rem);
    text-align: start;

    &:hover {
      background: oklch(from var(--color-text) l c h / 6%);
    }
  }
  .danger {
    color: var(--color-error);
  }
</style>
