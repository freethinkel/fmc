<script lang="ts">
  import { onMount, type Snippet } from "svelte";

  interface Props {
    open?: boolean;
    onClose?: () => void;
    children?: Snippet<[{ travel: number }]>;
  }
  const { open = false, onClose, children }: Props = $props();

  let el = $state<HTMLDialogElement>();
  let scroller = $state<HTMLDivElement>();
  let dock = $state<HTMLDivElement>();
  let travel = $state(0);
  let armed = false;

  $effect(() => {
    if (!el || !scroller || !dock) return;
    if (open && !el.open) {
      el.showModal();
      scroller.scrollTop = dock.offsetHeight;
      travel = 1;
      armed = true;
    } else if (!open && el.open) dismiss();
  });

  function dismiss() {
    // already at the top: a smooth scroll to 0 fires no scroll event, so onScroll would
    // never close the dialog — close it outright
    if (armed && scroller && scroller.scrollTop > 0)
      scroller.scrollTo({ top: 0, behavior: "smooth" });
    else el?.close();
  }

  function onScroll() {
    if (!scroller || !dock) return;
    const max = dock.offsetHeight;

    travel = max > 0 ? Math.min(Math.max(scroller.scrollTop / max, 0), 1) : 0;
    if (armed && scroller.scrollTop <= 0) el?.close();
  }

  onMount(() => {
    el?.blur();
  });
</script>

<!-- autofocus on the dialog itself: otherwise showModal() focuses the first button inside,
     and the browser then nudges the scroller to keep the focused element in view, fighting
     the snap scroll -->
<!-- svelte-ignore a11y_autofocus -->
<dialog
  bind:this={el}
  autofocus
  style:--travel={travel}
  onclose={() => {
    armed = false;
    travel = 0;
    onClose?.();
  }}
  oncancel={(e) => {
    e.preventDefault(); /* let Esc slide it out too */
    dismiss();
  }}
>
  <div class="overlay"></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    class="scroll"
    bind:this={scroller}
    onscroll={onScroll}
    onclick={dismiss}
  >
    <div class="spacer"></div>
    <div class="dock" bind:this={dock}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="sheet" onclick={(e) => e.stopPropagation()}>
        <div class="bleed"></div>
        <div class="grabber"></div>
        <div class="body">{@render children?.({ travel })}</div>
      </div>
    </div>
    <div class="tail"></div>
  </div>
</dialog>

<style>
  dialog {
    margin: 0;
    border: none;
    outline: none; /* the dialog itself holds focus (autofocus above) — no ring */
    padding: 0;
    width: 100vw;
    max-width: 100vw;
    height: 100svh;
    max-height: 100svh;
    /* clip, not hidden: a hidden box is still a scroll container, and iOS Safari scrolls it
       itself (focus reveal on showModal, chained rubber-band) — which slid the clipped tail
       zone up into view. clip forbids scrolling outright; Silk's view wrapper does the same. */
    overflow: clip;
    background: transparent;
    color: var(--color-text, CanvasText);

    /* the overlay div fades with the travel instead — the backdrop can't be driven by it */
    &::backdrop {
      background: transparent;
    }
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: oklch(0 0 0 / 40%);
    pointer-events: none;
    opacity: var(--travel);
    /* --travel jumps straight to 1 on open; short enough that a drag still looks like it's
       driving the fade itself */
    transition: opacity 0.2s ease-out;
  }
  .scroll {
    position: relative;
    height: calc(100vh + 50vh);
    overflow-y: scroll;
    overscroll-behavior-y: contain;
    overflow-x: hidden;
    scrollbar-width: none;
    scroll-snap-type: y mandatory;

    &::-webkit-scrollbar {
      display: none;
    }
  }
  .spacer {
    height: 100vh;
    scroll-snap-align: start;
  }
  .dock {
    height: 100vh;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  }
  .tail {
    height: 50svh;
    scroll-snap-align: end;
  }
  .sheet {
    height: min-content;
    position: relative; /* the bleed layer is positioned against it */
    display: flex;
    flex-direction: column;
    width: min(30rem, 100%);
    max-height: 90svh;
    margin-inline: auto;
    padding-bottom: var(--safe-area-bottom);
    translate: 0 0;
    transition: translate 0.4s cubic-bezier(0.32, 0.72, 0, 1);
    @starting-style {
      translate: 0 100%;
    }
  }
  .bleed {
    position: absolute;
    inset: 0 0 -50svh;
    z-index: -1;
    border-radius: calc(3 * var(--border-radius, 0.5rem))
      calc(3 * var(--border-radius, 0.5rem)) 0 0;
    background: var(--color-background, Canvas);
  }
  .grabber {
    width: 2.25rem;
    height: 0.25rem;
    margin: 0.5rem auto 0;
    border-radius: 625rem;
    background: oklch(from var(--color-text, CanvasText) l c h / 20%);
  }
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
  }
</style>
