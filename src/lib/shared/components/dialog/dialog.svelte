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

<dialog
  bind:this={el}
  class:side
  onclose={() => onClose?.()}
  onclick={(e) => {
    if (e.target === el) el.close();
  }}
>
  <header>
    {#if title}<h2>{title}</h2>{/if}
    <button class="close" aria-label="Close" onclick={() => el?.close()}>
      <Icon name="x" size={18} />
    </button>
  </header>
  <div class="body">{@render children?.()}</div>
</dialog>

<style>
  dialog {
    border: none;
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
    height: 100svh;
    max-height: 100svh;
    /* a full-height drawer spans the status bar and the home indicator */
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
    margin-inline-start: auto;
    border: none;
    background: transparent;
    cursor: pointer;
    color: oklch(from var(--color-text) l c h / 55%);
    padding: 0.25rem;
    border-radius: 0.375rem;
    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-text) l c h / 8%);
      }
    }
  }
  .body {
    padding: 1rem;
  }
</style>
