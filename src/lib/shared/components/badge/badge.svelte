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
    gap: 0.25rem;
    padding: 0.125rem 0.625rem;
    font-size: 0.625rem;
    font-weight: 500;
    border-radius: calc(var(--border-radius) / 2);
    color: var(--color-accent);
    background: oklch(from var(--color-accent) l c h / 12%);
  }
</style>
