<script lang="ts">
  import type { Snippet } from "svelte";
  interface Props {
    label?: string;
    error?: string;
    children?: Snippet;
  }
  const { label, error, children }: Props = $props();
</script>

<label class="field">
  {#if label}<span class="label">{label}</span>{/if}
  {@render children?.()}
  {#if error}<span class="error">{error}</span>{/if}
</label>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .label {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .error {
    font-size: 0.75rem;
    color: var(--color-error);
  }
</style>
