<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    type?: "submit" | "reset" | "button";
    kind?: "primary" | "secondary" | "ghost" | "danger";
    size?: "large" | "default";
    disabled?: boolean;
    onClick?: (e: MouseEvent) => void;
    children?: Snippet;
  }
  const {
    type = "button",
    kind = "primary",
    size = "default",
    disabled,
    onClick,
    children,
  }: Props = $props();
</script>

<button
  class="btn kind__{kind} size__{size}"
  {type}
  {disabled}
  onclick={onClick}
>
  {@render children?.()}
</button>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    border: none;
    cursor: pointer;
    font: inherit;
    font-weight: 500;
    border-radius: var(--border-radius);
    color: var(--color, var(--color-text));
    background-color: oklch(from var(--color, var(--color-text)) l c h / 12%);
    transition:
      transform var(--spring-transition),
      background-color 0.15s ease;

    &:hover:not(:disabled) {
      background-color: oklch(from var(--color, var(--color-text)) l c h / 20%);
    }
    &:active:not(:disabled) {
      transform: scale(0.97);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
  .size__large {
    height: 40px;
    padding: 0 16px;
  }
  .size__default {
    height: 30px;
    padding: 0 10px;
    font-size: 0.85rem;
  }
  .kind__primary {
    background-color: var(--color-accent);
    color: var(--color-background);
    &:hover:not(:disabled) {
      background-color: oklch(from var(--color-accent) calc(l * 1.08) c h);
    }
  }
  .kind__secondary {
    --color: var(--color-text);
  }
  .kind__ghost {
    --color: var(--color-text);
    background-color: transparent;
  }
  .kind__danger {
    --color: var(--color-error);
  }
</style>
