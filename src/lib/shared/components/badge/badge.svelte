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
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0 0.625rem;
    height: 1.3rem;
    font-size: 0.7rem;
    font-weight: 500;
    border-radius: calc(var(--border-radius) / 2);
    color: var(--color-text);
    background: var(--color-accent);
  }
</style>
