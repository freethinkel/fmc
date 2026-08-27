<script module lang="ts">
  /** A Material Symbols Rounded ligature — the whole set is loaded, so any name Google lists
      works as-is: https://fonts.google.com/icons */
  export type IconName = string;
</script>

<script lang="ts">
  interface Props {
    name: IconName;
    size?: number;
    color?: string;
    /** the FILL axis — the liked heart is the solid one */
    fill?: boolean;
    class?: string;
    // the tree panel's chevron is an icon that toggles a node
    onclick?: (event: MouseEvent) => void;
  }

  const {
    name,
    size = 24,
    color,
    fill = false,
    class: cls,
    onclick,
  }: Props = $props();
</script>

<span
  class="icon {cls ?? ''}"
  style:--size="{size / 16}rem"
  style:font-variation-settings="'FILL' {fill ? 1 : 0}, 'opsz' {size}, 'wght'
  300"
  style:color
  aria-hidden="true"
  {onclick}>{name}</span
>

<style>
  .icon {
    font-family: "Material Symbols Rounded";
    font-size: var(--icon-size, var(--size));
    line-height: 1;
    font-weight: 100;
    display: inline-block;
    font-weight: normal;
    font-style: normal;
    letter-spacing: normal;
    text-transform: none;
    white-space: nowrap;
    word-wrap: normal;
    direction: ltr;
    -webkit-font-smoothing: antialiased;
    font-feature-settings: "liga";
    user-select: none;
  }
</style>
