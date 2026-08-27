<script lang="ts">
  import { type Snippet } from "svelte";
  type Props = {
    children?: Snippet;
    clickable?: boolean;
  };

  let { children, clickable }: Props = $props();
</script>

<li class="list-item" class:clickable>
  {@render children?.()}
</li>

<style>
  li {
    padding: 0.3rem 1rem;
    min-height: 2.5rem;
    background: oklch(from var(--color-text) l c h / 10%);
    display: flex;
    align-items: center;
  }

  .clickable {
    padding: 0;
    transition: var(--spring-transition);

    & > :global(a),
    & > :global(button) {
      padding: 0.3rem 1rem;
    }

    &:hover {
      background: oklch(from var(--color-text) l c h / 15%);
    }

    &:active {
      border-radius: calc(var(--border-radius) * 2) !important;
    }
  }
</style>
