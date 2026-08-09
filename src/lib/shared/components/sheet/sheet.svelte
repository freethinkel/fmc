<script lang="ts">
  // A bottom sheet that swipes away without a single pointer handler: the overlay is a scroll
  // container with two snap points — an empty screen, then the sheet — so dragging it down is
  // ordinary scrolling, with native inertia and the same gesture from a touch screen, a
  // trackpad or a wheel. Arriving back at the top means "dismissed". <dialog> hosts it, so the
  // top layer, Esc and the focus trap come for free.
  //
  // Self-contained on purpose — no imports beyond Svelte, and every token it reads has a
  // fallback, so the file can be copied into another project as it is.
  //
  // How far the sheet has travelled (0 off screen, 1 fully up) is published as --travel on the
  // dialog and handed to the children snippet, so effects elsewhere can ride the same gesture:
  //   opacity: var(--travel);  scale: calc(0.96 + 0.04 * var(--travel));
  import type { Snippet } from "svelte";

  interface Props {
    open?: boolean;
    onClose?: () => void;
    children?: Snippet<[{ travel: number }]>;
  }
  const { open = false, onClose, children }: Props = $props();

  /** Keep in step with the sheet's transition below. */
  const ENTRANCE_MS = 400;

  let el = $state<HTMLDialogElement>();
  let scroller = $state<HTMLDivElement>();
  let travel = $state(0);
  // "scrolled to the top" only means dismissal once the sheet has landed at the bottom —
  // before that it would close itself on its first frame
  let armed = false;
  // The entrance slides the sheet with `translate`, and a translation counts toward the
  // scrollable overflow — so while it plays, the scroll range reads a sheet-height too long and
  // the travel measured off it is nonsense. Wait it out instead.
  let entering = false;
  let enteringTimer: ReturnType<typeof setTimeout>;

  $effect(() => {
    if (!el || !scroller) return;
    if (open && !el.open) {
      el.showModal();
      // park it at the bottom snap point right away and let CSS play the entrance: scrolling
      // there by hand can't be animated, because snapping rounds every step to a snap point
      scroller.scrollTop = scroller.scrollHeight;
      // it is up and dismissable by definition; the entrance is what we wait out before
      // trusting a measurement again
      travel = 1;
      armed = true;
      entering = true;
      clearTimeout(enteringTimer);
      enteringTimer = setTimeout(() => (entering = false), ENTRANCE_MS);
    } else if (!open && el.open) dismiss();
  });

  /** Scroll the sheet back down off screen; onScroll turns arriving at the top into a close. */
  function dismiss() {
    if (armed && scroller) scroller.scrollTo({ top: 0, behavior: "smooth" });
    else el?.close();
  }

  function onScroll() {
    if (!scroller) return;
    if (!entering) {
      // the whole scroll range is the travel: it is exactly the sheet's height, nothing beyond
      const max = scroller.scrollHeight - scroller.clientHeight;

      travel = max > 0 ? Math.min(Math.max(scroller.scrollTop / max, 0), 1) : 0;
    }
    if (armed && scroller.scrollTop <= 0) el?.close();
  }
</script>

<dialog
  bind:this={el}
  style:--travel={travel}
  onclose={() => {
    armed = false;
    entering = false;
    clearTimeout(enteringTimer);
    travel = 0;
    onClose?.();
  }}
  oncancel={(e) => {
    e.preventDefault(); /* let Esc slide it out too */
    dismiss();
  }}
>
  <div class="overlay"></div>
  <!-- the backdrop is a click target only; Esc and whatever close button the content carries
       are what keyboard users get -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="scroll" bind:this={scroller} onscroll={onScroll} onclick={dismiss}>
    <div class="spacer"></div>
    <div class="dock">
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="sheet" onclick={(e) => e.stopPropagation()}>
        <div class="grabber"></div>
        <div class="body">{@render children?.({ travel })}</div>
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
    position: relative; /* above .overlay, which is positioned and would paint over it */
    height: 100%;
    overflow-y: scroll;
    overscroll-behavior-y: contain;
    overflow-x: hidden;
    scrollbar-width: none;
    scroll-snap-type: y mandatory;

    &::-webkit-scrollbar {
      display: none;
    }
  }
  /* the closed position: one screen of nothing, with the sheet below the fold */
  .spacer {
    height: 100%;
    scroll-snap-align: start;
  }
  /* the open position. It is exactly as tall as the sheet, so the scroll runs out the moment
     the sheet is up — dragging further is a bounce, not more scrolling. Aligning to its end
     parks the sheet against the bottom of the screen. */
  .dock {
    scroll-snap-align: end;
  }
  .sheet {
    /* sticky, not static: a bounce past the end of the scroll would otherwise lift the sheet
       and leave the page showing under its cut-off edge. Stuck to the bottom of the scrollport
       it stays put through the bounce, and still rides down with .dock on the way out, since
       sticky never leaves its own box. */
    position: sticky;
    bottom: 0;
    display: flex;
    flex-direction: column;
    width: min(30rem, 100%);
    max-height: 100svh;
    margin-inline: auto;
    border-radius: calc(3 * var(--border-radius, 0.5rem)) calc(3 * var(--border-radius, 0.5rem))
      0 0;
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--color-background, Canvas);
    translate: 0 0;
    /* the sheet's own curve, not the app's: this is the iOS sheet ease Silk and friends use —
       fast off the mark, settling without overshoot, so nothing bounces past the edge it just
       came from */
    transition: translate 0.4s cubic-bezier(0.32, 0.72, 0, 1);

    /* the entrance: the scroll can't animate it (snapping rounds every step to a snap point),
       so the sheet slides in on its own while sitting at the bottom snap point */
    @starting-style {
      translate: 0 100%;
    }

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
