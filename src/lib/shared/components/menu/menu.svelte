<script lang="ts">
  import type { Snippet } from "svelte";
  import { backIn, bounceOut, cubicIn, cubicInOut } from "svelte/easing";
  import { fly, slide } from "svelte/transition";

  interface Props {
    trigger: Snippet<[{ open: boolean; toggle: () => void }]>;
    align?: "start" | "end";
    children?: Snippet;
  }
  const { trigger, align = "end", children }: Props = $props();

  // where anchor positioning is available the menu goes into the top layer, so a card's scroll
  // container can't clip it and position-try flips it back on screen near an edge. Older
  // browsers keep the absolutely-positioned menu inside .root.
  const anchored =
    typeof CSS !== "undefined" && CSS.supports("anchor-name: --a");
  const uid = $props.id();
  const anchor = `--menu-${uid}`;

  let open = $state(false);
  let root = $state<HTMLDivElement>();
  let menu = $state<HTMLDivElement>();

  // the popover API is imperative; mirror `open` into it and let CSS animate both ways
  $effect(() => {
    if (!anchored || !menu) return;
    if (open) menu.showPopover();
    else if (menu.matches(":popover-open")) menu.hidePopover();
  });

  const inside = (target: Node) =>
    Boolean(root?.contains(target) || menu?.contains(target));
</script>

<svelte:window
  onpointerdown={(e) => {
    if (open && !inside(e.target as Node)) open = false;
  }}
  onkeydown={(e) => {
    if (open && e.key === "Escape") open = false;
  }}
/>

<div
  class="root"
  class:open
  bind:this={root}
  style={anchored ? `anchor-name: ${anchor}` : undefined}
>
  {@render trigger({ open, toggle: () => (open = !open) })}
  {#if open}
    <div
      class="menu align__{align}"
      class:anchored
      role="menu"
      tabindex="-1"
      bind:this={menu}
      popover={anchored ? "manual" : undefined}
      style={anchored ? `position-anchor: ${anchor}` : undefined}
      onclick={() => (open = false)}
      transition:fly={{ y: -10, easing: cubicInOut, duration: 100 }}
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
    min-width: 0;
  }

  .root > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }

  .menu {
    position: absolute;
    top: calc(100% + 0.375rem);
    z-index: 50;
    min-width: 11.25rem;
    max-height: min(20rem, calc(100vh - 2rem));
    overflow-y: auto;
    padding: 0.25rem;
    flex-direction: column;
    border-radius: var(--border-radius);
    background: var(--color-background);
    border: 1px solid oklch(from var(--color-text) l c h / 10%);
    box-shadow: 0 8px 24px oklch(0 0 0 / 12%);
    display: flex;
  }

  .align__end {
    inset-inline-end: 0;
  }
  .align__start {
    inset-inline-start: 0;
  }

  .anchored {
    display: flex;
    position: fixed;
    margin: 0.375rem 0;
    min-width: max(11.25rem, anchor-size(width));
    top: 100%;
    inset: 0;
  }

  .anchored.align__end {
    position-area: block-end span-inline-start;
  }
  .anchored.align__start {
    position-area: block-end span-inline-end;
  }
</style>
