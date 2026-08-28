<script lang="ts">
  import { Icon } from "../icon";

  type Props = {
    href: string;
  };
  const { href }: Props = $props();
</script>

<a {href}>
  <Icon name="arrow_back" size={22} />
</a>

<style>
  a {
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 10em;
    border: 1px solid oklch(from var(--color-text) l c h / 10%);
    width: 3rem;
    text-decoration: none;
    color: var(--color-text);
    transition: transform var(--spring-transition);

    &:hover {
      background-color: oklch(from var(--color-text) l c h / 10%);
      border-color: transparent;
    }

    &:active {
      transform: scale(0.95);
    }
  }
</style>
