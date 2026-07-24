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
