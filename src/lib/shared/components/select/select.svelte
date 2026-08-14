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
    /* Opaque, unlike the tint every other surface uses: the dropdown is painted by the browser
       off the select's OWN background, and a 5%-alpha text color composites against the UA's
       white — so in dark mode the list came out white while the options kept the light text,
       i.e. white on white until a row was highlighted. Same shade, mixed instead of layered. */
    background:
      no-repeat right 0.625rem center / 0.875rem
        url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="gray" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>'),
      color-mix(in oklab, var(--color-text) 5%, var(--color-background));
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

  /* The rows of that list. Spelled out rather than inherited, because a row that inherits only
     the text color lands on whatever the UA painted behind it. Ignored where the popup is a
     native menu (macOS), which is themed by color-scheme in tokens.css anyway. */
  option {
    color: var(--color-text);
    background-color: var(--color-background);
  }
</style>
