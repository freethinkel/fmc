<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    onClick?: () => void;
    children?: Snippet;
  }
  const { onClick, children }: Props = $props();
</script>

{#if onClick}
  <button type="button" class="card clickable" onclick={onClick}
    >{@render children?.()}</button
  >
{:else}
  <div class="card">{@render children?.()}</div>
{/if}

<style>
  .card {
    display: block;
    width: 100%;
    text-align: start;
    font: inherit;
    color: inherit;
    border: none;
    padding: 0.8rem;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 5%);
    border: 1px solid oklch(from var(--color-text) l c h / 5%);
  }
  .clickable {
    cursor: pointer;
    transition: transform var(--spring-transition);

    &:active {
      transform: scale(0.98);
    }
    /* a press that lands on a control inside the card belongs to that control — the card must
       not squash under it. :active is a hit-test state, so stopping the event wouldn't clear it */
    &:has(:global(:where(button, a):active)) {
      transform: none;
    }
  }
</style>
