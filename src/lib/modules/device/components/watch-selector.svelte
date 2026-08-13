<script lang="ts">
  // One watchface installed on the watch: its thumbnail if we've ever flashed it from here,
  // otherwise a blank dial with the label doing the work. Picking is optional — the popover
  // only lists them, the slot dialog picks one to overwrite.
  interface Props {
    name: string;
    preview?: string;
    title?: string;
    selected?: boolean;
    onClick?: () => void;
  }
  const { name, preview, title, selected = false, onClick }: Props = $props();
</script>

<svelte:element
  this={onClick ? "button" : "div"}
  class="watch"
  class:pickable={!!onClick}
  class:selected
  role={onClick ? "button" : undefined}
  tabindex={onClick ? 0 : undefined}
  type={onClick ? "button" : undefined}
  aria-pressed={onClick ? selected : undefined}
  {title}
  onclick={onClick}
>
  <span class="face">
    {#if preview}
      <img src={preview} alt="" loading="lazy" />
    {:else}
      <!-- ponytail: no thumbnail for anything installed by the official app — the watch reports
           ids only, so an initial is the most we can honestly show -->
      <span class="initial">{name.slice(0, 1)}</span>
    {/if}
  </span>
  <span class="label">{name}</span>
</svelte:element>

<style>
  .watch {
    --size: 3.75rem;
    flex: 0 0 auto;
    width: var(--size);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.375rem;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: inherit;
    text-align: center;
  }
  .face {
    width: var(--size);
    height: var(--size);
    display: grid;
    place-items: center;
    overflow: hidden;
    border-radius: 50%;
    background: oklch(from var(--color-text) l c h / 6%);
    outline: 2px solid transparent;
    outline-offset: 2px;
    transition: var(--spring-transition);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  .initial {
    font-size: 1.125rem;
    font-weight: 600;
    color: oklch(from var(--color-text) l c h / 45%);
  }
  .label {
    width: 100%;
    font-size: 0.625rem;
    line-height: 1.3;
    color: oklch(from var(--color-text) l c h / 55%);
    /* names run long ("Activity Mood"); keep every dial the same width and clip instead */
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .pickable {
    cursor: pointer;

    &:focus-visible .face {
      outline-color: oklch(from var(--color-accent) l c h / 45%);
    }
    &:focus-visible .label {
      color: var(--color-text);
    }
    @media (hover: hover) {
      &:hover .face {
        outline-color: oklch(from var(--color-accent) l c h / 45%);
      }
      &:hover .label {
        color: var(--color-text);
      }
    }
  }
  .selected {
    .face {
      outline-color: var(--color-accent);
    }
    .label {
      color: var(--color-accent);
    }
  }
</style>
