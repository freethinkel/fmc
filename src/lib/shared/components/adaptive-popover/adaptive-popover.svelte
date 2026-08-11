<script lang="ts">
  // The same panel in two shells: an anchored popover on desktop, the swipeable sheet on the
  // phone. This component owns the choice, so neither shell learns about the other — the
  // sheet stays headless, the popover stays a popover.
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { Icon } from "$lib/shared/components/icon";
  import { Popover } from "$lib/shared/components/popover";
  import { Sheet } from "$lib/shared/components/sheet";

  interface Props {
    open?: boolean;
    title?: string;
    /** the trigger's anchor-name, forwarded to the popover shell */
    anchor?: string;
    /** popover shell width; the sheet is viewport-sized and ignores it */
    width?: string;
    onClose?: () => void;
    children?: Snippet;
  }
  const { open = false, title, anchor, width, onClose, children }: Props = $props();

  // the bottom-nav breakpoint: below it the app is phone-shaped and gets the sheet
  const desktop = new MediaQuery("(min-width: 768px)");

  // Crossing the breakpoint swaps the shell; teleporting an open panel into the other shell
  // mid-resize opens it with half-measured geometry, so just close it instead.
  let wasDesktop = desktop.current;
  $effect(() => {
    if (desktop.current === wasDesktop) return;
    wasDesktop = desktop.current;
    onClose?.();
  });
</script>

{#if desktop.current}
  <Popover {open} {anchor} {width} {onClose}>
    <!-- no close button: light dismiss and Esc are the popover's way out -->
    {#if title}<h2>{title}</h2>{/if}
    {@render children?.()}
  </Popover>
{:else}
  <Sheet {open} {onClose}>
    <!-- the sheet is headless, so its title and close button live here -->
    <header>
      {#if title}<h2>{title}</h2>{/if}
      <button class="close" aria-label="Close" onclick={() => onClose?.()}>
        <Icon name="x" size={18} />
      </button>
    </header>
    {@render children?.()}
  </Sheet>
{/if}

<style>
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.25rem;
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;

    h2 {
      margin: 0;
      font-size: 1.75rem;
    }
  }
  .close {
    margin-inline-start: auto;
    border: none;
    border-radius: 0.375rem;
    padding: 0.25rem;
    background: transparent;
    color: oklch(from var(--color-text) l c h / 55%);
    cursor: pointer;

    &:hover {
      background: oklch(from var(--color-text) l c h / 8%);
    }
  }
</style>
