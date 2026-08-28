<script lang="ts">
  import type { Snippet } from "svelte";
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    open?: boolean;
    title?: string;
    side?: boolean;
    onClose?: () => void;
    children?: Snippet;
  }
  const { open = false, title, side = false, onClose, children }: Props = $props();

  let el = $state<HTMLDialogElement>();

  $effect(() => {
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  });
</script>

<!-- autofocus on the dialog itself, like sheet/: otherwise showModal() focuses the first
     focusable child, which is the close button -->
<!-- svelte-ignore a11y_autofocus -->
<dialog
  bind:this={el}
  autofocus
  class:side
  onclose={() => onClose?.()}
  onclick={(e) => {
    if (e.target === el) el.close();
  }}
>
  <header>
    {#if title}<h2>{title}</h2>{/if}
    <button class="close" aria-label="Close" onclick={() => el?.close()}>
      <Icon name="close" />
    </button>
  </header>
  <div class="body">{@render children?.()}</div>
</dialog>

<style>
  dialog {
    border: none;
    outline: none;
    padding: 0;
    color: var(--color-text);
    background: var(--color-background);
    border-radius: var(--border-radius);
    width: min(30rem, calc(100vw - 2rem));
    opacity: 0;
    transform: translateY(0.75rem) scale(0.98);
    transition:
      opacity 0.2s ease,
      transform var(--spring-transition),
      display 0.25s allow-discrete,
      overlay 0.25s allow-discrete;

    &[open] {
      opacity: 1;
      transform: none;

      @starting-style {
        opacity: 0;
        transform: translateY(0.75rem) scale(0.98);
      }
    }
    &::backdrop {
      background: oklch(0 0 0 / 40%);
    }
  }
  dialog.side {
    margin: 0 0 0 auto;
    height: 100vh;
    max-height: 100vh;
    padding-block: var(--safe-area-top) var(--safe-area-bottom);
    width: min(26.25rem, 90vw);
    border-radius: 0;
    display: flex;
    flex-direction: column;
    transform: translateX(1.5rem);
    &:not([open]) {
      display: none;
    }
    &[open] {
      transform: none;
      @starting-style {
        opacity: 0;
        transform: translateX(1.5rem);
      }
    }
    /* header stays put, body scrolls independently — needed once content can exceed the viewport */
    .body {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
    }
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0;
    h2 {
      margin: 0;
      font-size: 1.75rem;
    }
  }
  .close {
    height: 2.5rem;
    width: 2.5rem;
    display: flex;
    justify-content: center;
    align-items: center;
    border: none;
    border-radius: 10rem;
    padding: 0;
    color: oklch(from var(--color-text) l c h / 55%);
    cursor: pointer;
    background: oklch(from var(--color-text) l c h / 8%);

    &:hover {
      background: oklch(from var(--color-text) calc(l+0.1) c h / 8%);
    }
  }
  .body {
    padding: 1rem;
  }
</style>
