<script lang="ts">
  // The same panel in two shells: a drawer sliding out beside the left rail on desktop (the
  // Google Fonts filters pattern), the swipeable sheet on the phone. This component owns the
  // choice, so neither shell learns about the other — the sheet stays headless.
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { Icon } from "$lib/shared/components/icon";
  import { Sheet } from "$lib/shared/components/sheet";

  interface Props {
    open?: boolean;
    title?: string;
    /** drawer width; the sheet is viewport-sized and ignores it */
    width?: string;
    onClose?: () => void;
    children?: Snippet;
  }
  const { open = false, title, width, onClose, children }: Props = $props();

  // the app-nav breakpoint: below it the app is phone-shaped and gets the sheet
  const desktop = new MediaQuery("(min-width: 768px)");

  // Crossing the breakpoint swaps the shell; teleporting an open panel into the other shell
  // mid-resize opens it with half-measured geometry, so just close it instead.
  let wasDesktop = desktop.current;

  $effect(() => {
    if (desktop.current === wasDesktop) return;
    wasDesktop = desktop.current;
    onClose?.();
  });

  let drawer = $state<HTMLElement>();
</script>

<svelte:window
  onpointerdown={(e) => {
    if (desktop.current && open && drawer && !drawer.contains(e.target as Node)) onClose?.();
  }}
  onkeydown={(e) => {
    if (desktop.current && open && e.key === "Escape") onClose?.();
  }}
/>

{#if desktop.current}
  <!-- the clip strip starts at the rail's edge: the drawer slides inside it, so it emerges
       from under the rail no matter where in the DOM (and whose stacking context) it lives -->
  <div class="clip" style:--drawer-width={width}>
    <aside class="drawer" class:open bind:this={drawer}>
      <header>
        {#if title}<h2>{title}</h2>{/if}
        <button tabindex="-1" class="close" aria-label="Close" onclick={() => onClose?.()}>
          <Icon name="close" />
        </button>
      </header>
      {@render children?.()}
    </aside>
  </div>
{:else}
  <Sheet {open} {onClose}>
    <header>
      {#if title}<h2>{title}</h2>{/if}
      <button class="close" aria-label="Close" onclick={() => onClose?.()}>
        <Icon name="close" />
      </button>
    </header>
    {@render children?.()}
  </Sheet>
{/if}

<style>
  .clip {
    position: fixed;
    inset-block: 0;
    inset-inline-start: var(--nav-rail-width);
    z-index: 40;
    width: min(var(--drawer-width, 20rem), calc(100vw - var(--nav-rail-width)));
    overflow: clip;
    pointer-events: none; /* an empty strip must not eat clicks while the drawer is away */
  }
  .drawer {
    height: 100%;
    width: 100%;
    padding: 1rem;
    padding-block-start: calc(1rem + var(--safe-area-top));
    overflow-y: auto;
    pointer-events: auto;
    background: var(--color-background);
    border-inline-end: 1px solid oklch(from var(--color-text) l c h / 10%);
    box-shadow: 1rem 0 3rem oklch(0 0 0 / 15%);
    transform: translateX(-100%);
    visibility: hidden;
    transition:
      transform 0.15s ease-in-out,
      visibility 0s 0.15s;

    &.open {
      transform: none;
      visibility: visible;
      transition: transform 0.15s ease-in-out;
    }
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
  }
  .close {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    height: 2.5rem;
    width: 2.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
    border: none;
    border-radius: 10rem;
    padding: 0;
    background: transparent;
    color: oklch(from var(--color-text) l c h / 55%);
    cursor: pointer;
    background: oklch(from var(--color-text) l c h / 8%);

    &:hover {
      background: oklch(from var(--color-text) calc(l+0.1) c h / 8%);
    }
  }
</style>
