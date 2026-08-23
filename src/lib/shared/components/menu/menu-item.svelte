<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    danger?: boolean;
    /** renders the item as a link — for actions the browser should own (download, open) */
    href?: string;
    /** Keycaps for the shortcut that runs the same action, already in the platform's alphabet.
     *  The caller owns the keymap — this only draws what it is handed. */
    keys?: readonly string[];
    onClick?: () => void;
    children?: Snippet;
  }
  const { danger, href, keys, onClick, children }: Props = $props();
</script>

{#snippet label()}
  {@render children?.()}
  {#if keys?.length}
    <span class="keys"
      >{#each keys as k (k)}<kbd>{k}</kbd>{/each}</span
    >
  {/if}
{/snippet}

{#if href}
  <a class="item" class:danger role="menuitem" {href} onclick={onClick}>{@render label()}</a>
{:else}
  <button class="item" class:danger role="menuitem" onclick={onClick}>{@render label()}</button>
{/if}

<style>
  .item {
    display: flex;
    text-decoration: none;
    align-items: center;
    gap: 0.5rem;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.75rem;
    color: var(--color-text);
    cursor: pointer;
    padding: 0.5rem 0.625rem;
    border-radius: calc(var(--border-radius) - 0.25rem);
    text-align: start;

    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-text) l c h / 6%);
      }
    }
  }
  .danger {
    color: var(--color-error);
  }
  /* pushed to the far edge, and it never squeezes the label */
  .keys {
    display: flex;
    flex: none;
    gap: 0.125rem;
    margin-inline-start: auto;
    padding-inline-start: 1rem;
  }
  kbd {
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
