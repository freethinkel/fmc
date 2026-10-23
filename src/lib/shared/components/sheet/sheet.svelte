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
  let panel = $state<HTMLDivElement>();
  let travel = $state(0);
  // the keyboard's height over the layout viewport: iOS lays the keyboard over the page instead
  // of resizing it
  let kb = $state(0);
  let armed = false;

  $effect(() => {
    if (!el || !scroller || !dock) return;
    if (open && !el.open) {
      el.showModal();
      scroller.scrollTop = dock.offsetHeight;
      travel = 1;
      armed = true;
      focusArmed = true;
    } else if (!open && el.open) dismiss();
  });

  // the sheet sits on the keyboard's top edge
  $effect(() => {
    const vv = window.visualViewport;

    if (!open || !vv) return;
    // from the dialog's own bottom edge: innerHeight and 100vh need not be the box it fills
    const fit = () =>
      (kb = Math.max(
        0,
        (el?.getBoundingClientRect().bottom ?? innerHeight) - vv.height - vv.offsetTop,
      ));

    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  });

  // After Silk's nativeFocusScrollPrevention (same as makiba's Sheet): a field inside never takes
  // focus natively, since iOS then scrolls the page to reveal it, but by focus({ preventScroll });
  // the sheet itself rises over the keyboard instead.
  // ponytail: no scrolling a field into view inside the body — add it when a sheet holds more
  // than a screen of fields
  const NOT_TEXT = new Set([
    "button",
    "checkbox",
    "color",
    "file",
    "hidden",
    "image",
    "radio",
    "range",
    "reset",
    "submit",
  ]);
  const typable = (e: EventTarget | null): e is HTMLElement =>
    e instanceof HTMLTextAreaElement ||
    (e instanceof HTMLInputElement && !NOT_TEXT.has(e.type)) ||
    (e instanceof HTMLElement && e.isContentEditable);
  const keyboard = () => innerHeight - 200 > (visualViewport?.height ?? innerHeight);
  // the element's bottom edge lies within about its own height of the keyboard's top
  function nearKeyboard(e: HTMLElement) {
    const r = e.getBoundingClientRect();
    const gap = (visualViewport?.height ?? innerHeight) - r.bottom;

    return gap > -r.height / 2 && gap < r.height + 32;
  }

  // Until the first focus inside, focus sits on the dialog (autofocus, see below), and iOS
  // scrolling to keep it in view fights the swipe — the jitter before the first field gets focus.
  // So the first touch anywhere in the panel moves focus onto the panel, before the browser focuses
  // anything itself; a field's native focus then arrives as the panel's focusout, where it is
  // redone without the scroll. Re-armed whenever focus leaves for nothing (the keyboard's Done).
  let focusArmed = true;

  function onTouchStart(e: TouchEvent) {
    if (!focusArmed || !panel?.contains(e.target as Node)) return;
    focusArmed = false;
    panel.focus({ preventScroll: true });
  }

  // a tap on the field that still has focus with the keyboard down: iOS would scroll to reveal it
  // again, so hand focus to the panel first and let focusout redo it
  function onTouchEnd(e: TouchEvent) {
    if (e.target === document.activeElement && typable(e.target) && !keyboard())
      panel?.focus({ preventScroll: true });
  }

  function onFocusOut(e: FocusEvent) {
    const from = e.target as HTMLElement;
    const to = e.relatedTarget;

    if (!to) focusArmed = true;
    if (!typable(to) || !panel?.contains(to) || "twin" in from.dataset) return;
    if (typable(from) && nearKeyboard(from)) {
      // from field to field right over the keyboard: a stand-in off screen holds the keyboard up
      // meanwhile; inside the dialog, since a modal one makes the rest of the page inert
      const twin = from.cloneNode(false) as HTMLElement;

      twin.removeAttribute("id");
      twin.removeAttribute("name");
      twin.dataset.twin = "";
      twin.style.cssText =
        "position: fixed; left: 0; top: 0; transform: translateY(-3000px) scale(0)";
      el?.append(twin);
      twin.focus({ preventScroll: true });
      setTimeout(() => {
        to.focus({ preventScroll: true });
        twin.remove();
      }, 32);
    } else to.focus({ preventScroll: true });
  }

  // the refocus loses the tapped caret position, so a field first focused gets its caret at the
  // end, as Silk does
  const focused = new WeakSet<EventTarget>();

  function onFocusIn(e: FocusEvent) {
    const f = e.target;

    if (!(f instanceof HTMLInputElement || f instanceof HTMLTextAreaElement)) return;
    if (!typable(f) || focused.has(f)) return;
    focused.add(f);
    try {
      f.setSelectionRange(f.value.length, f.value.length);
    } catch {
      // email and number fields have no selection
    }
  }

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
  style:--kb="{kb}px"
  onclose={() => {
    armed = false;
    travel = 0;
    onClose?.();
  }}
  oncancel={(e) => {
    e.preventDefault(); /* let Esc slide it out too */
    dismiss();
  }}
  ontouchstart={onTouchStart}
  ontouchend={onTouchEnd}
  onfocusout={onFocusOut}
  onfocusin={onFocusIn}
>
  <div class="overlay"></div>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="scroll" bind:this={scroller} onscroll={onScroll} onclick={dismiss}>
    <div class="spacer"></div>
    <div class="dock" bind:this={dock}>
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div class="sheet" tabindex="-1" bind:this={panel} onclick={(e) => e.stopPropagation()}>
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
    /* every height below is a share of the dialog's (as in makiba's Sheet): Safari's 100vh is the
       viewport with its bars hidden, taller than the one the dialog fills while they show, which
       pushed the dock's bottom — the panel's buttons — under the toolbar */
    height: 100%;
    max-height: none;
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
    height: 150%;
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
    height: calc(100% / 1.5);
    scroll-snap-align: start;
  }
  .dock {
    height: calc(100% / 1.5);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding-bottom: var(--kb);
  }
  .tail {
    height: calc(50% / 1.5);
    scroll-snap-align: end;
  }
  .sheet {
    height: min-content;
    position: relative; /* the bleed layer is positioned against it */
    display: flex;
    flex-direction: column;
    width: min(30rem, 100%);
    /* the dock's content box: its height less the keyboard's padding */
    max-height: calc(100% - var(--safe-area-top) - 1.5rem);
    margin-inline: auto;
    padding-bottom: max(0px, var(--safe-area-bottom) - var(--kb));
    outline: none;
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
    border-radius: calc(3 * var(--border-radius, 0.5rem)) calc(3 * var(--border-radius, 0.5rem)) 0 0;
    background: var(--color-background, Canvas);
    /* its own copy another half screen down: the sheet keeps its rubber-band (it's what makes the
       swipe feel right), and a long pull up outran the bleed and showed its edge. A shadow, since
       a longer box would add to the scroll range and let the sheet scroll past open. */
    box-shadow: 0 50svh 0 var(--color-background, Canvas);
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
    padding: 1rem 1rem calc(1rem + var(--safe-area-bottom));
  }
</style>
