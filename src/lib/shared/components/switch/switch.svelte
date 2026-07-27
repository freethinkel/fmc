<script lang="ts">
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), disabled, onChange }: Props = $props();
</script>

<label class="root">
  <input type="checkbox" bind:checked {disabled} onchange={() => onChange?.(checked)} />
  <span class="switch"><span class="thumb"></span></span>
</label>

<style>
  .root {
    display: inline-flex;
    cursor: pointer;
  }
  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }
  .switch {
    width: 2.5rem;
    height: 1.5rem;
    padding: 0.125rem;
    border-radius: 0.75rem;
    background: oklch(from var(--color-text) l c h / 15%);
    transition: background-color 0.2s ease;
  }
  .thumb {
    display: block;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 50%;
    background: oklch(1 0 0);
    transition: transform var(--spring-transition);
  }
  input:checked + .switch {
    background: var(--color-accent);
    .thumb {
      transform: translateX(1rem);
    }
  }
  input:disabled + .switch {
    opacity: 0.5;
  }
  input:focus-visible + .switch {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
</style>
