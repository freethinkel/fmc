<script lang="ts">
  import type { Snippet } from "svelte";

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
  <!-- always in the tree: the close animation needs the node to outlive `open` -->
  <div
    class="menu align__{align}"
    class:anchored
    class:open
    role="menu"
    tabindex="-1"
    bind:this={menu}
    popover={anchored ? "manual" : undefined}
    style={anchored ? `position-anchor: ${anchor}` : undefined}
    onclick={() => (open = false)}
    onkeydown={(e) => {
      if (e.key === "Escape") open = false;
    }}
  >
    {@render children?.()}
  </div>
</div>

<style>
  .root {
    position: relative;
    display: inline-flex;
    /* a trigger that is a form control (Select) spans its field; the menu takes at least that */
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
    /* a long list (the editor's data sources run to dozens) scrolls inside the menu rather
       than growing past the viewport */
    max-height: min(20rem, calc(100vh - 2rem));
    overflow-y: auto;
    padding: 0.25rem;
    flex-direction: column;
    border-radius: var(--border-radius);
    background: var(--color-background);
    border: 1px solid oklch(from var(--color-text) l c h / 10%);
    box-shadow: 0 8px 24px oklch(0 0 0 / 12%);

    /* grows out of the trigger's edge and fades; the same curve shrinks it back — allow-discrete
       keeps the node displayed until the close transition lands, so it must stop catching
       clicks the moment it starts leaving (the trigger sits right under it) */
    display: none;
    pointer-events: none;
    opacity: 0;
    transform: translateY(-0.25rem) scale(0.96);
    transform-origin: top;
    transition:
      opacity 0.15s ease,
      transform var(--spring-transition),
      display 0.25s allow-discrete,
      overlay 0.25s allow-discrete;

    &.open {
      display: flex;
      pointer-events: auto;
      opacity: 1;
      transform: none;
      @starting-style {
        opacity: 0;
        transform: translateY(-0.25rem) scale(0.96);
      }
    }
  }
  .align__end {
    inset-inline-end: 0;
  }
  .align__start {
    inset-inline-start: 0;
  }
  /* the anchored menu animates on :popover-open, not .open: hidePopover() drops the element
     out of the top layer and the UA's own display rule wins over .open — `overlay` with
     allow-discrete is what holds it on screen while the close transition runs */
  .anchored:popover-open {
    display: flex;
    pointer-events: auto;
    opacity: 1;
    transform: none;
    position: fixed;
    inset: auto;
    margin: 0.375rem 0;
    min-width: max(11.25rem, anchor-size(width));
    position-try-fallbacks:
      flip-block,
      flip-inline,
      flip-block flip-inline;

    @starting-style {
      opacity: 0;
      transform: translateY(-0.25rem) scale(0.96);
    }
  }
  .anchored.align__end:popover-open {
    position-area: block-end span-inline-start;
  }
  .anchored.align__start:popover-open {
    position-area: block-end span-inline-end;
  }
</style>
