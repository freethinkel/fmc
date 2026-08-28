<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    type?: "submit" | "reset" | "button";
    kind?: "primary" | "secondary" | "ghost" | "danger";
    size?: "default" | "small" | "large";
    class?: string;
    disabled?: boolean;
    href?: string;
    onClick?: (e: MouseEvent) => void;
    children?: Snippet;
  }
  const {
    type = "button",
    kind = "primary",
    size = "default",
    class: className,
    disabled,
    href,
    onClick,
    children,
  }: Props = $props();
</script>

<svelte:element
  this={href ? "a" : "button"}
  class="btn kind__{kind} size__{size} {className}"
  href={disabled ? undefined : href}
  type={href ? undefined : type}
  disabled={href ? undefined : disabled}
  aria-disabled={href && disabled ? "true" : undefined}
  role={href ? "link" : "button"}
  onclick={onClick}
>
  {@render children?.()}
</svelte:element>

<style>
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
    cursor: pointer;
    font: inherit;
    text-decoration: none;
    font-weight: 500;
    border-radius: 10em;
    color: var(--color, var(--color-text));
    background-color: oklch(from var(--color, var(--color-text)) l c h / 12%);
    transition:
      transform var(--spring-transition),
      background-color 0.15s ease;

    @media (hover: hover) {
      &:hover:not(:disabled, [aria-disabled="true"]) {
        background-color: oklch(
          from var(--color, var(--color-text)) l c h / 20%
        );
      }
    }
    &:active:not(:disabled, [aria-disabled="true"]) {
      transform: translateY(0.2rem);
    }
    &:disabled,
    &[aria-disabled="true"] {
      opacity: 0.5;
      cursor: default;
    }
  }
  .size__default {
    height: 2.5rem;
    padding: 0 1rem;
    font-size: 0.875rem;

    & :global(.icon) {
      --icon-size: 1.2rem;
    }
  }
  .size__small {
    height: 1.75rem;
    padding: 0 0.5rem;
  }
  .size__large {
    height: 3rem;
    padding: 0 1.2rem;
  }

  .kind__primary {
    background-color: var(--color-accent);
    color: var(--color-on-accent);

    @media (hover: hover) {
      &:hover:not(:disabled, [aria-disabled="true"]) {
        background-color: oklch(from var(--color-accent) calc(l * 1.08) c h);
      }
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
