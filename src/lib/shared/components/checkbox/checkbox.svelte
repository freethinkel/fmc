<script lang="ts">
  import Check from "@lucide/svelte/icons/check";
  interface Props {
    checked?: boolean;
    disabled?: boolean;
    onChange?: (checked: boolean) => void;
  }
  let { checked = $bindable(false), disabled, onChange }: Props = $props();
</script>

<label class="root">
  <input type="checkbox" bind:checked {disabled} onchange={() => onChange?.(checked)} />
  <span class="box"><Check size={14} strokeWidth={3} /></span>
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
    width: 20px;
    height: 20px;
    border-radius: 6px;
    border: 1.5px solid oklch(from var(--color-text) l c h / 25%);
    color: transparent;
    transition: all 0.15s ease;
  }
  input:checked + .box {
    background: var(--color-accent);
    border-color: var(--color-accent);
    color: oklch(1 0 0);
  }
  input:focus-visible + .box {
    outline: 2px solid var(--color-accent);
    outline-offset: 2px;
  }
  input:disabled + .box {
    opacity: 0.5;
  }
</style>
