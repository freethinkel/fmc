<script lang="ts">
  // A macOS-style anchored popover: native popover="auto" (top layer, Esc, light dismiss)
  // positioned with CSS anchor positioning against the trigger's anchor-name, with a tail
  // pointing at it. No backdrop dim — it is a popover, not a modal.
  import type { Snippet } from "svelte";

  interface Props {
    open?: boolean;
    /** the trigger's anchor-name, e.g. "--watch-trigger" */
    anchor?: string;
    /** CSS width, still clamped to the viewport; default 20rem */
    width?: string;
    onClose?: () => void;
    children?: Snippet;
  }
  const { open = false, anchor, width, onClose, children }: Props = $props();

  let el = $state<HTMLDivElement>();

  $effect(() => {
    if (!el) return;
    const shown = el.matches(":popover-open");
    if (open && !shown) el.showPopover();
    else if (!open && shown) el.hidePopover();
  });
</script>

<div
  bind:this={el}
  popover="auto"
  class="popover"
  style:position-anchor={anchor}
  style:--popover-width={width}
  ontoggle={(e) => e.newState === "closed" && onClose?.()}
>
  <span class="tail"></span>
  {@render children?.()}
</div>

<style>
  .popover {
    position: fixed;
    overflow: visible; /* the UA gives [popover] overflow: auto, which clips the tail */
    /* under the trigger, centered on it; anchor-center also shifts to stay on screen.
       ponytail: no flip-block fallback — the trigger lives in the top header, below always
       fits; add position-try-fallbacks (and a flipped tail) if a bottom-anchored use appears */
    position-area: block-end;
    justify-self: anchor-center;
    margin: 0.625rem 0;
    width: min(var(--popover-width, 20rem), calc(100vw - 2rem));
    border: 1px solid oklch(from var(--color-text, CanvasText) l c h / 12%);
    border-radius: calc(2 * var(--border-radius, 0.5rem));
    padding: 1rem;
    /* an elevated surface, a notch lighter than the page — otherwise the popover (and its
       tail especially) melts into the same --color-background it sits on in dark theme */
    background: oklch(from var(--color-background, Canvas) calc(l + 0.05) c h);
    color: var(--color-text, CanvasText);
    box-shadow: 0 1rem 3rem oklch(0 0 0 / 25%);
    opacity: 0;
    transform: scale(0.9);
    transform-origin: center top; /* grows out of the tail */
    transition:
      opacity 0.15s ease,
      transform var(--spring-transition, transform 0.3s ease),
      display 0.2s allow-discrete,
      overlay 0.2s allow-discrete;

    &:popover-open {
      opacity: 1;
      transform: none;
      @starting-style {
        opacity: 0;
        transform: scale(0.9);
      }
    }
  }
  /* the tail: a rotated square poking out of the top edge; its top-left sides carry the
     border on, its body covers the popover's own border line behind it */
  .tail {
    position: absolute;
    top: calc(-0.4375rem - 1px);
    left: 50%;
    width: 0.875rem;
    height: 0.875rem;
    transform: translateX(-50%) rotate(45deg);
    background: inherit;
    border: inherit;
    border-bottom: none;
    border-right: none;
    border-start-start-radius: 0.1875rem;
  }
</style>
