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
    onInput,
    onChange,
  }: Props = $props();
</script>

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

<style>
  /* same box as Button's default size, so a field and the button beside it line up */
  input {
    width: 100%;
    height: 1.875rem;
    padding: 0 0.625rem;
    font: inherit;
    font-size: 0.75rem;
    color: var(--color-text);
    background: oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    transition: border-color 0.15s ease;

    &::placeholder {
      color: oklch(from var(--color-text) l c h / 40%);
    }
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
    &:disabled {
      opacity: 0.5;
    }
  }
</style>
