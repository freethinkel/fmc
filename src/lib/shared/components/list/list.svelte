<script lang="ts">
  import { type Snippet } from "svelte";
  type Props = {
    children?: Snippet;
  };

  const { children }: Props = $props();
</script>

<ul class="wrapper">
  {@render children?.()}
</ul>

<style>
  .wrapper {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;

    & :global(li) {
      border-radius: calc(var(--border-radius) / 2);

      &:first-child {
        border-top-left-radius: var(--border-radius);
        border-top-right-radius: var(--border-radius);
      }

      &:last-child {
        border-bottom-left-radius: var(--border-radius);
        border-bottom-right-radius: var(--border-radius);
      }
    }
  }
</style>
