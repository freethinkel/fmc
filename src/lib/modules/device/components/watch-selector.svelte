<script lang="ts">
  // One watchface installed on the watch: its thumbnail if we've ever flashed it from here,
  // otherwise a blank dial with the label doing the work. Picking is optional — the popover
  // only lists them, the slot dialog picks one to overwrite.
  import { Icon } from "$lib/shared/components/icon";

  interface Props {
    name: string;
    preview?: string;
    title?: string;
    selected?: boolean;
    onClick?: () => void;
    // drops it from the list — only on a dial that isn't itself a button (no onClick)
    onRemove?: () => void;
  }
  const { name, preview, title, selected = false, onClick, onRemove }: Props = $props();
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
  {#if onRemove}
    <button
      type="button"
      class="remove"
      aria-label="Remove {name} from this list"
      title="Deleted it on the watch? FMC can't see that. Remove it from this list."
      onclick={onRemove}
    >
      <Icon name="close" size={14} />
    </button>
  {/if}
</svelte:element>

<style>
  .watch {
    --size: 3.75rem;
    position: relative;
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
  .remove {
    position: absolute;
    /* inside the dial's box: the row scrolls sideways, so anything past its edge is clipped */
    top: 0;
    right: 0;
    display: grid;
    place-items: center;
    width: 1.25rem;
    height: 1.25rem;
    padding: 0;
    border: 1px solid oklch(from var(--color-text) l c h / 12%);
    border-radius: 50%;
    background: var(--color-background);
    color: oklch(from var(--color-text) l c h / 55%);
    cursor: pointer;

    &:hover,
    &:focus-visible {
      color: var(--color-text);
    }
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
