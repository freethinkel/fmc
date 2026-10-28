<script lang="ts">
  // Account → Accent color: a grid of swatches. Picking one applies it at once; the dialog stays
  // open so the colour can be judged against the page behind it.
  import { Dialog } from "$lib/shared/components/dialog";
  import { Icon } from "$lib/shared/components/icon";
  import { ACCENTS } from "../lib/accents";
  import { appearanceModel } from "../model";

  const {
    $accent: accent,
    $accentDialogOpen: open,
    accentPicked,
    accentDialogClosed,
  } = appearanceModel;
</script>

<Dialog open={$open} title="Accent color" onClose={() => accentDialogClosed()}>
  <div class="grid" role="radiogroup" aria-label="Accent color">
    {#each ACCENTS as a (a.id)}
      <button
        type="button"
        role="radio"
        aria-checked={a.id === $accent}
        class="swatch"
        class:on={a.id === $accent}
        onclick={() => accentPicked(a.id)}
      >
        <span class="dot" style:--swatch={a.swatch}>
          {#if a.id === $accent}<Icon name="check" size={20} />{/if}
        </span>
        {a.label}
      </button>
    {/each}
  </div>
</Dialog>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.5rem;
  }
  .swatch {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.5rem;
    border: none;
    border-radius: var(--border-radius);
    background: transparent;
    font: inherit;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 70%);
    cursor: pointer;

    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-text) l c h / 6%);
      }
    }
    &.on {
      color: var(--color-text);
      background: oklch(from var(--color-text) l c h / 8%);
    }
    &:focus-visible {
      outline: 2px solid var(--color-accent);
    }
  }
  .dot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: var(--swatch);
    /* the check sits on a swatch of any hue: the dark ink every accent surface already uses */
    color: var(--color-on-accent);
    box-shadow: inset 0 0 0 1px oklch(from var(--color-text) l c h / 12%);
  }
</style>
