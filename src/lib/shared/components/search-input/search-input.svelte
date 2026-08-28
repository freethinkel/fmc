<script lang="ts">
  import { Icon } from "../icon";
  import { Input } from "../input";

  interface Props {
    value?: string;
    placeholder?: string;
  }
  let { value = $bindable(""), placeholder = "Search…" }: Props = $props();
</script>

<div class="search">
  <Icon name="search" size={22} />
  <Input bind:value {placeholder} />
</div>

<style>
  .search {
    position: relative;

    :global(.icon) {
      position: absolute;
      top: 50%;
      left: 0.75rem;
      transform: translateY(-50%);
      color: oklch(from var(--color-text) l c h / 55%);
      pointer-events: none;
    }
    :global(input) {
      padding-inline-start: 2.25rem;
    }
  }
</style>
