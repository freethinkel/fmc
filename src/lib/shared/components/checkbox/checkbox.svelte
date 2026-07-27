<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), disabled, onChange }: Props = $props();
</script>

<label class="root">
  <input type="checkbox" bind:checked {disabled} onchange={() => onChange?.(checked)} />
  <span class="box"><Icon name="check" size={14} /></span>
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
  .box {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 0.375rem;
    border: 1.5px solid oklch(from var(--color-text) l c h / 25%);
    color: transparent;
    transition: all 0.15s ease;
  }
  input:checked + .box {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: var(--color-background);
  }
  input:focus-visible + .box {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  input:disabled + .box {
    opacity: 0.5;
  }
</style>
