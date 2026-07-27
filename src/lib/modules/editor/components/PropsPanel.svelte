<script lang="ts">
  // Inspector for the selected node, in three sections: where it sits, what data it shows,
  // and the bitmaps it draws. The shared field chrome lives here so the sections carry only
  // what is theirs.
  import Geometry from "./props/geometry.svelte";
  import Source from "./props/source.svelte";
  import Frames from "./props/frames.svelte";
  import { editorModel } from "../model";
  const { $editor: editor } = editorModel;
</script>

{#if $editor.sel}
  <div class="panel">
    <Geometry node={$editor.sel} />
    <Source node={$editor.sel} />
    <Frames node={$editor.sel} />
  </div>
{:else}
  <p class="hint">Nothing selected.</p>
{/if}

<style>
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
    .btn-group {
      display: flex;
      gap: 0.25rem;
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

      &:hover {
        background: oklch(from var(--color-text) l c h / 6%);
        color: var(--color-text);
      }
      &.on {
        border-color: var(--color-accent);
        color: var(--color-accent);
      }
    }
    .text-btn {
      border: 1px solid oklch(from var(--color-text) l c h / 12%);
      border-radius: var(--border-radius);
      background: transparent;
      padding: 0.25rem 0.5rem;
      font: inherit;
      font-size: 0.625rem;
      color: oklch(from var(--color-text) l c h / 55%);
      cursor: pointer;
      text-align: start;

      &:hover {
        color: var(--color-text);
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
