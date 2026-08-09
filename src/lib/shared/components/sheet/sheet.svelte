<script lang="ts">
  // A bottom sheet that swipes away without a single pointer handler: the overlay is a scroll
  // container with two snap points — an empty screen, then the sheet — so dragging it down is
  // ordinary scrolling with native inertia, and arriving back at the top means "dismissed".
  // (The trick is lifted from friendzone's drawer.) <dialog> hosts it, so the top layer,
  // Esc and the focus trap come for free.
  import type { Snippet } from "svelte";
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    open?: boolean;
    title?: string;
    onClose?: () => void;
    children?: Snippet;
  }
  const { open = false, title, onClose, children }: Props = $props();

  let el = $state<HTMLDialogElement>();
  let scroller = $state<HTMLDivElement>();
  let progress = $state(0);
  // "scrolled to the top" only means dismissal once the opening scroll has landed at the
  // bottom — before that the sheet would close itself on its first frame
  let armed = false;

  $effect(() => {
    if (!el || !scroller) return;
    if (open && !el.open) {
      el.showModal();
      // park it at the bottom snap point right away and let CSS play the entrance: scrolling
      // there by hand can't be animated, because snapping rounds every step to a snap point
      scroller.scrollTop = scroller.scrollHeight;
    } else if (!open && el.open) dismiss();
  });

  /** Scroll the sheet back down off screen; onScroll turns arriving at the top into a close. */
  function dismiss() {
    if (armed && scroller) scroller.scrollTo({ top: 0, behavior: "smooth" });
    else el?.close();
  }

  function onScroll() {
    if (!scroller) return;
    // the travel is one screen — spacer to sheet — not the whole scroll range, which also
    // holds the tail that covers the sheet's underside when it's dragged past the bottom
    const max = scroller.clientHeight;

    progress = max > 0 ? Math.min(Math.max(scroller.scrollTop / max, 0), 1) : 0;
    if (!armed) armed = progress > 0.99;
    else if (scroller.scrollTop <= 0) el?.close();
  }
</script>

<dialog
  bind:this={el}
  onclose={() => {
    armed = false;
    progress = 0;
    onClose?.();
  }}
  oncancel={(e) => {
    e.preventDefault(); /* let Esc slide it out too */
    dismiss();
  }}
>
  <div class="overlay" style:opacity={progress}></div>
  <!-- the backdrop is a click target only; Esc and the close button are what keyboard users get -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="scroll" bind:this={scroller} onscroll={onScroll} onclick={dismiss}>
    <div class="spacer"></div>
    <div class="row">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="sheet" onclick={(e) => e.stopPropagation()}>
        <div class="grabber"></div>
        <header>
          {#if title}<h2>{title}</h2>{/if}
          <button class="close" aria-label="Close" onclick={dismiss}>
            <Icon name="x" size={18} />
          </button>
        </header>
        <div class="body">{@render children?.()}</div>
      </div>
    </div>
  </div>
</dialog>

<style>
  dialog {
    margin: 0;
    border: none;
    padding: 0;
    width: 100vw;
    max-width: 100vw;
    height: 100svh;
    max-height: 100svh;
    overflow: hidden;
    background: transparent;
    color: var(--color-text);

    /* the overlay div fades with the scroll instead — the backdrop can't be driven by it */
    &::backdrop {
      background: transparent;
    }
  }
  .overlay {
    position: fixed;
    inset: 0;
    background: oklch(0 0 0 / 40%);
    pointer-events: none;
    /* opacity is set from the scroll progress, which jumps straight to 1 on open — short
       enough that a drag still looks like it's driving the fade */
    transition: opacity 0.2s ease-out;
  }
  .scroll {
    position: relative; /* above .overlay, which is positioned and would paint over it */
    height: 100%;
    overflow-y: scroll;
    scroll-snap-type: y mandatory;
    overscroll-behavior-y: contain;
    overflow-x: hidden;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }
  .spacer {
    height: 100%;
    scroll-snap-align: start;
  }
  /* second snap point: a full screen with the sheet parked at its bottom */
  .row {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    height: 100%;
    scroll-snap-align: start;
  }
  .sheet {
    position: relative;
    display: flex;
    flex-direction: column;
    width: min(30rem, 100%);
    max-height: 100%;
    margin-inline: auto;
    border-radius: calc(3 * var(--border-radius)) calc(3 * var(--border-radius)) 0 0;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--color-background);
    translate: 0 0;
    transition: translate var(--spring-transition);

    /* the entrance: the scroll can't animate it (snapping rounds every step to a snap point),
       so the sheet slides in on its own while sitting at the bottom snap point */
    @starting-style {
      translate: 0 100%;
    }

    /* overscroll past the bottom drags the sheet up; this is the tail that keeps its underside
       from being a cut-off edge with the page showing through */
    &::after {
      content: "";
      position: absolute;
      inset-inline: 0;
      top: 100%;
      height: 50vh;
      background: inherit;
    }
  }
  .grabber {
    width: 2.25rem;
    height: 0.25rem;
    margin: 0.5rem auto 0;
    border-radius: 625rem;
    background: oklch(from var(--color-text) l c h / 20%);
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 1rem 0;

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
  .body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 1rem;
  }
</style>
