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
  select {
    width: 100%;
    height: 40px;
    padding: 0 32px 0 12px;
    font: inherit;
    color: var(--color-text);
    background:
      no-repeat right 10px center / 14px
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
