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
  onkeydown={(e) => {
    if (open && e.key === "Escape") open = false;
  }}
/>

<div class="root" bind:this={root}>
  {@render trigger({ open, toggle: () => (open = !open) })}
  {#if open}
    <div
      class="menu align__{align}"
      role="menu"
      tabindex="-1"
      onclick={() => (open = false)}
      onkeydown={(e) => {
        if (e.key === "Escape") open = false;
      }}
    >
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
    top: calc(100% + 0.375rem);
    z-index: 50;
    min-width: 11.25rem;
    padding: 0.25rem;
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
