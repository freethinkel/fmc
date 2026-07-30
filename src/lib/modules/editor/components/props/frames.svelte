<script lang="ts">
  import { Select } from "$lib/shared/components/select";
  import { Icon } from "$lib/shared/components/icon";
  import { framesOf, type ImageId, type Layer } from "../../core/document/doc";
  import { FRAME_LABELS, pickerLabel } from "../../core/document/sources";
  import { editorModel } from "../../model";
  import { set } from "./patch";

  const { layer }: { layer: Layer } = $props();
  const { $doc: doc, $cache: cache, replaceImageRequested, frameMoved } = editorModel;

  // native HTML5 drag & drop over the frame list, same shape as TreePanel's layer reorder
  let dragIdx = $state<number | null>(null);
  let dropIdx = $state<number | null>(null);

  // a fresh layer object arrives on every edit, so plain deriveds are enough here
  const images = $derived(framesOf(layer));
  const frameLabels = $derived(
    layer.kind !== "group" && layer.kind !== "raw" ? FRAME_LABELS[layer.meta.source] : null,
  );
  // the 0x5f body is already decoded on a SlotLayer — no hex to pick apart
  const slotInfo = $derived(
    layer.kind === "slot" ? { activeIdx: layer.active, ids: layer.metrics } : null,
  );
  const slotOptions = $derived(
    slotInfo?.ids.map((id, i) => ({ value: String(i), label: pickerLabel(id) })) ?? [],
  );

  const setSlotActive = (active: number) => set(layer.id, { active } as Partial<Layer>);

  function thumbURL(id: ImageId) {
    const a = $doc?.images.get(id);
    const c = document.createElement("canvas");

    if (!a) return c.toDataURL();
    c.width = a.w;
    c.height = a.h;
    const bitmap = $cache.get(id)?.bitmap;

    if (bitmap) c.getContext("2d")?.drawImage(bitmap, 0, 0);
    return c.toDataURL();
  }
  function downloadRes(id: ImageId) {
    const a = document.createElement("a");

    a.href = thumbURL(id);
    a.download = `${id}.png`;
    a.click();
  }
</script>

{#if slotInfo}
  <div>
    <span class="muted-label">widget slot — active metric</span>
    <Select
      value={String(slotInfo.activeIdx)}
      options={slotOptions}
      onChange={(v) => setSlotActive(+v)}
    />
  </div>
{/if}
{#if images?.length && slotInfo}
  <!-- 0x85 images aren't a value-indexed set: [0] is the on-watch "tap to configure"
       placeholder, [1..count] are the companion-app picker icons, one per metric of
       the 0x5f list — see drawSlotPlaceholder in lib/render.ts -->
  <div>
    <span class="muted-label">placeholder (widget-edit screen only)</span>
    <div class="images">{@render thumb(images[0])}</div>
  </div>
  {#if images.length > 1}
    <div>
      <span class="muted-label">companion-app menu icons</span>
      <div class="images">
        {#each images.slice(1) as ri, i}
          <div class="thumb-col" class:active={i === slotInfo.activeIdx}>
            {@render thumb(ri)}
            <span class="thumb-cap">{pickerLabel(slotInfo.ids[i])}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
{:else if images && images.length > 1}
  <!-- A multi-frame widget is indexed BY VALUE (images[value % count]), so the order is
       data, not decoration — a set imported in the wrong order shows the wrong day/month
       on the watch. Listed with its index (and, where the format fixes them, the value
       each slot must hold) and reorderable by drag. -->
  <div>
    <span class="muted-label">frames — index = value</span>
    <div class="frames">
      {#each images as ri, i}
        <div
          class="frame-row"
          class:dragging={dragIdx === i}
          draggable="true"
          role="listitem"
          ondragstart={(e) => {
            dragIdx = i;
            e.dataTransfer?.setData("text/plain", ""); // Firefox needs a payload to start a drag
          }}
          ondragover={(e) => {
            if (dragIdx !== null && dragIdx !== i) {
              e.preventDefault();
              dropIdx = i;
            }
          }}
          ondrop={(e) => {
            e.preventDefault();
            if (dragIdx !== null && dropIdx === i)
              frameMoved({ id: layer.id, from: dragIdx, to: i });
            dragIdx = dropIdx = null;
          }}
          ondragend={() => (dragIdx = dropIdx = null)}
        >
          <Icon name="grip" size={14} class="grip" />
          <span class="frame-idx">{i}</span>
          {@render thumb(ri)}
          {#if frameLabels}<span class="thumb-cap">{frameLabels[i] ?? ""}</span>{/if}
          {#if dropIdx === i}
            <!-- own element, not a row border: the line marks the gap the frame lands in -->
            <span class="drop-line" class:below={i > (dragIdx ?? -1)}></span>
          {/if}
        </div>
      {/each}
    </div>
  </div>
{:else if images}
  <div class="images">
    {#each images as ri}{@render thumb(ri)}{/each}
  </div>
{/if}

{#snippet thumb(id: ImageId)}
  {@const a = $doc?.images.get(id)}
  <div class="thumb-wrap">
    <label title="{id} · {a?.w}×{a?.h} · cf{a?.cf} — click to replace" class="thumb">
      <img src={thumbURL(id)} alt={id} />
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
    <button title="Download PNG" onclick={() => downloadRes(id)} class="dl-btn">
      <Icon name="download" size={14} />
    </button>
  </div>
{/snippet}

<style>
  .frames {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .frame-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    border-radius: var(--border-radius);
    padding: 0.125rem 0.25rem;
    cursor: grab;

    &:hover {
      background: oklch(from var(--color-text) l c h / 6%);
    }
    &.dragging {
      opacity: 0.4;
    }
  }
  /* sits in the 2px gap between rows, so no row is resized or outlined while dragging */
  .drop-line {
    position: absolute;
    inset-inline: 0;
    top: -2px;
    height: 0.125rem;
    border-radius: 1px;
    background: var(--color-accent);

    &.below {
      top: auto;
      bottom: -2px;
    }
  }
  :global(.grip) {
    flex-shrink: 0;
    color: oklch(from var(--color-text) l c h / 40%);
  }
  .frame-idx {
    width: 1rem;
    flex-shrink: 0;
    font-family: var(--font-mono);
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .images {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .thumb-wrap {
    position: relative;
  }
  .thumb-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    max-width: 4rem;
  }
  .thumb-cap {
    font-size: 0.625rem;
    text-align: center;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .thumb-col.active .thumb-cap {
    color: var(--color-accent);
  }
  .thumb {
    display: block;
    cursor: pointer;
    border-radius: 0.375rem;
    overflow: hidden;
    background: repeating-conic-gradient(
        oklch(from var(--color-text) l c h / 15%) 0 25%,
        oklch(from var(--color-text) l c h / 8%) 0 50%
      )
      0 0 / 0.75rem 0.75rem;

    img {
      display: block;
      max-width: 3.5rem;
      max-height: 3.5rem;
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
  .thumb-wrap:hover .dl-btn,
  .dl-btn:focus-visible {
    opacity: 1;
  }
</style>
