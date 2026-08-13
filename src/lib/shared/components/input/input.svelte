<script lang="ts">
  interface Props {
    value?: string;
    type?: string;
    placeholder?: string;
    disabled?: boolean;
    required?: boolean;
    name?: string;
    autocomplete?: string;
    minlength?: number;
    maxlength?: number;
    min?: number | string;
    max?: number | string;
    step?: number | string;
    /** muted tag inside the box, before the value: [x 12] */
    label?: string;
    /** muted suffix inside the box, after the value: [100 %] */
    unit?: string;
    onInput?: (value: string) => void;
    // native `change` — fires on blur/Enter/stepper, for edits too expensive to run per keystroke
    onChange?: (value: string) => void;
  }
  let {
    value = $bindable(""),
    type,
    placeholder,
    disabled,
    required,
    name,
    autocomplete,
    minlength,
    maxlength,
    min,
    max,
    step,
    label,
    unit,
    onInput,
    onChange,
  }: Props = $props();
</script>

<!-- the box carries the field chrome; label/unit live inside it, Figma-inspector style -->
<label class="box">
  {#if label}<span class="tag">{label}</span>{/if}
  <input
    type={type ?? "text"}
    {placeholder}
    {disabled}
    {required}
    {name}
    {minlength}
    {maxlength}
    {min}
    {max}
    {step}
    autocomplete={autocomplete as any}
    bind:value
    oninput={() => onInput?.(value)}
    onchange={() => onChange?.(value)}
  />
  {#if unit}<span class="tag">{unit}</span>{/if}
</label>

<style>
  /* same box as Button's default size, so a field and the button beside it line up */
  .box {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    width: 100%;
    height: 1.875rem;
    padding: 0 0.625rem;
    background: oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    transition: border-color 0.15s ease;
    cursor: text;

    &:focus-within {
      border-color: var(--color-accent);
    }
    &:has(input:disabled) {
      opacity: 0.5;
    }
  }
  .tag {
    flex-shrink: 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 45%);
    user-select: none;
  }
  input {
    flex: 1;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    font-size: 0.75rem;
    color: var(--color-text);

    &::placeholder {
      color: oklch(from var(--color-text) l c h / 40%);
    }
    &:focus {
      outline: none;
    }
    /* spinners crowd a compact field; arrow keys still step */
    &::-webkit-outer-spin-button,
    &::-webkit-inner-spin-button {
      appearance: none;
    }
  }
</style>
