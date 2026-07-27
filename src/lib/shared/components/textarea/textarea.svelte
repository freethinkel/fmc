<script lang="ts">
  interface Props {
    value?: string;
    placeholder?: string;
    rows?: number;
    disabled?: boolean;
    maxlength?: number;
  }
  let { value = $bindable(""), placeholder, rows = 3, disabled, maxlength }: Props = $props();
</script>

<textarea {placeholder} {rows} {disabled} {maxlength} bind:value></textarea>

<style>
  textarea {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font: inherit;
    color: var(--color-text);
    background: oklch(from var(--color-text) l c h / 5%);
    border: 1px solid transparent;
    border-radius: var(--border-radius);
    resize: vertical;

    &::placeholder {
      color: oklch(from var(--color-text) l c h / 40%);
    }
    &:focus {
      outline: none;
      border-color: var(--color-accent);
    }
  }
</style>
