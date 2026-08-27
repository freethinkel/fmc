<script lang="ts">
  // Inspector for the selected node, in three sections: where it sits, what data it shows,
  // and the bitmaps it draws. The shared field chrome lives here so the sections carry only
  // what is theirs.
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import Geometry from "./props/geometry.svelte";
  import Source from "./props/source.svelte";
  import Frames from "./props/frames.svelte";
  import { editorModel } from "../model";
  const { $doc: doc, $selected: selected, invertColorsRequested } = editorModel;

  // the primary selection — the sections are all single-layer
  const layer = $derived($selected[0] ?? null);
</script>

<div class="panel">
  {#if layer}
    <!-- A locked layer is read-only, and a disabled fieldset is the platform's own way to say
         so: one attribute switches off every control inside, no per-input plumbing. -->
    <fieldset class="fields" disabled={Boolean(layer.locked)}>
      {#if layer.locked}
        <p class="hint-xs">locked — unlock it in the layer tree to edit</p>
      {/if}
      <Geometry {layer} />
      <Source {layer} />
      <Frames {layer} />
    </fieldset>
  {:else}
    <p class="hint">Nothing selected.</p>
  {/if}
  <!-- scope follows the selection, same as the effect itself — see invertColorsFx -->
  {#if $doc}
    <div class="row">
      <Button kind="secondary" onClick={() => invertColorsRequested()}>
        <Icon name="contrast" size={22} />
        invert {layer ? "layer" : "screen"}
      </Button>
    </div>
  {/if}
</div>

<style>
  /* display: contents, so the fieldset carries the disabled state and nothing else — the
     sections keep the panel's own layout */
  .fields {
    display: contents;
    border: none;
    margin: 0;
    padding: 0;
  }
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    font-size: 0.75rem;
  }
  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  /* shared field chrome — :global so the section components can use the same classes */
  .panel :global {
    .row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .field-label {
      flex-shrink: 0;
      font-weight: 500;

      &.w-sm {
        width: 2rem;
      }
      &.w-md {
        width: 3.5rem;
      }
    }
    .muted-label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.625rem;
      font-weight: 500;
      color: oklch(from var(--color-text) l c h / 55%);
    }
    .hint-xs {
      margin: 0;
      font-size: 0.625rem;
      color: oklch(from var(--color-text) l c h / 55%);
    }
    .w-num {
      display: inline-block;
      width: 4rem;
      flex-shrink: 0;
    }
    /* a segmented pill: one recessed track, equal segments, the active one raised */
    .btn-group {
      display: flex;
      flex: 1;
      gap: 0.125rem;
      padding: 0.125rem;
      background: oklch(from var(--color-text) l c h / 5%);
      border-radius: var(--border-radius);

      .icon-btn {
        flex: 1;
        width: auto;
        height: 1.625rem;
        border: none;
        border-radius: calc(var(--border-radius) - 0.125rem);

        &.on {
          background: oklch(from var(--color-text) l c h / 10%);
          color: var(--color-accent);
        }
      }
    }
    .grow {
      flex: 1;
    }
    .icon-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border: 1px solid oklch(from var(--color-text) l c h / 12%);
      border-radius: var(--border-radius);
      background: transparent;
      color: oklch(from var(--color-text) l c h / 55%);
      cursor: pointer;
      transition: background-color 0.15s ease;

      @media (hover: hover) {
        &:hover {
          background: oklch(from var(--color-text) l c h / 6%);
          color: var(--color-text);
        }
      }
      &.on {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
    }
    .check-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .check-label {
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      font: inherit;
      color: inherit;
      text-align: start;
      cursor: pointer;
    }
  }
</style>
