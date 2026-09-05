<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    // `quiet` — a tinted badge instead of the accent one, for a label that sits on every card
    // (the device) rather than calling out an exception (Draft/Published)
    quiet?: boolean;
    children?: Snippet;
  }
  const { quiet = false, children }: Props = $props();
</script>

<span class="badge" class:quiet>{@render children?.()}</span>

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

    &.quiet {
      color: oklch(from var(--color-text) l c h / 70%);
      background: oklch(from var(--color-text) l c h / 8%);
    }
  }
</style>
