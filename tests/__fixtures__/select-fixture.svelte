<script lang="ts">
  import { Select } from "$lib/shared/components/select";

  let { onChange }: { onChange?: (v: string) => void } = $props();
  let value = $state("new");
</script>

<p data-testid="bound">{value}</p>
<Select
  bind:value
  options={[
    { value: "new", label: "Newest" },
    { value: "popular", label: "Popular" },
  ]}
  {onChange}
/>
