<script lang="ts">
  import { Icon } from "$lib/shared/components/icon";
  import type { ImageId } from "../../core/document/doc";
  import { editorModel } from "../../model";
  import { thumbURL } from "./patch";

  interface Props {
    id: ImageId;
    /** Longest side, in rem — the frame list wants small, a slot's metric row wants bigger. */
    size?: number;
  }

  const { id, size = 3.5 }: Props = $props();
  const { $doc: doc, $cache: cache, replaceImageRequested, clearImageRequested } = editorModel;

  const asset = $derived($doc?.images.get(id));

  function download() {
    const a = document.createElement("a");

    a.href = thumbURL($doc?.images, $cache, id);
    a.download = `${id}.png`;
    a.click();
  }
</script>

<div class="thumb-wrap">
  <label
    title="{id} · {asset?.w}×{asset?.h} · cf{asset?.cf} — click to replace"
    class="thumb"
    style="--max: {size}rem"
  >
    <img src={thumbURL($doc?.images, $cache, id)} alt={id} />
    <input
      type="file"
      accept="image/*"
      hidden
      onchange={(e) => {
        const file = e.currentTarget.files?.[0];

        if (file) replaceImageRequested({ id, file });
      }}
    />
  </label>
  <button title="Download PNG" onclick={download} class="dl-btn">
    <Icon name="download" size={14} />
  </button>
  <!-- a transparent frame in a value-indexed set = the widget blinks off on that value -->
  <button
    title="Clear — transparent frame"
    onclick={() => clearImageRequested({ id })}
    class="dl-btn clear"
  >
    <Icon name="eraser" size={14} />
  </button>
</div>

<style>
  .thumb-wrap {
    position: relative;
    flex-shrink: 0;
  }
  .thumb {
    display: block;
    cursor: pointer;
    border-radius: 0.375rem;
    overflow: hidden;
    /* chequerboard, so a transparent icon doesn't read as a missing one */
    background: repeating-conic-gradient(
        oklch(from var(--color-text) l c h / 15%) 0 25%,
        oklch(from var(--color-text) l c h / 8%) 0 50%
      )
      0 0 / 0.75rem 0.75rem;

    img {
      display: block;
      max-width: var(--max);
      max-height: var(--max);
    }
  }
  .dl-btn {
    position: absolute;
    top: 0.125rem;
    inset-inline-end: 0.125rem;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border: none;
    border-radius: 0.25rem;
    background: oklch(from var(--color-background) l c h / 80%);
    color: var(--color-text);
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .dl-btn.clear {
    top: auto;
    bottom: 0.125rem;
  }
  .dl-btn:focus-visible {
    opacity: 1;
  }
  @media (hover: hover) {
    .thumb-wrap:hover .dl-btn {
      opacity: 1;
    }
  }
</style>
