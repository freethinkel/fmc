<script lang="ts">
  interface Props {
    value?: string;
    options: { value: string; label: string }[];
    disabled?: boolean;
    onChange?: (value: string) => void;
  }
  let { value = $bindable(""), options, disabled, onChange }: Props = $props();
</script>

<select bind:value {disabled} onchange={() => onChange?.(value)}>
  {#each options as opt (opt.value)}
    <option value={opt.value}>{opt.label}</option>
  {/each}
</select>

<style>
  /* same box as Button's default size — see input/ */
  select {
    width: 100%;
    height: 1.875rem;
    padding: 0 1.75rem 0 0.625rem;
    font: inherit;
    font-size: 0.75rem;
    color: var(--color-text);
    background:
      no-repeat right 0.625rem center / 0.875rem
        url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>'),
      oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    appearance: none;
    cursor: pointer;

    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
    }
  }
</style>
