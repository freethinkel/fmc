<script lang="ts">
  import { Select } from "$lib/shared/components/select";
  import { Icon } from "$lib/shared/components/icon";
  import { hex, unhex, type FaceNode, type Resource } from "../../lib/wf";
  import { FRAME_LABELS, metaInfo, pickerLabel } from "../../lib/sources";
  import { structOf } from "../../lib/tree";
  import { editorModel } from "../../model";
  import { set } from "./patch";

  const { node }: { node: FaceNode } = $props();
  const { $editor: editor, replaceImageRequested, moveImage } = editorModel;

  // native HTML5 drag & drop over the frame list, same shape as TreePanel's layer reorder
  let dragIdx = $state<number | null>(null);
  let dropIdx = $state<number | null>(null);

  const st = $derived(structOf(node));
  // see the snapshot note in geometry.svelte
  const images = $derived.by(() => {
    void $editor;
    return st?.images;
  });
  const frameLabels = $derived.by(() => {
    void $editor;
    return st?.meta ? FRAME_LABELS[metaInfo(st).id] : null;
  });

  // 0x5f: [slotIndex][count][activeIdx][count × metric id][padding] — see 0x85 "Widget slot"
  const slotNode = $derived(node.tag === 0x85 ? node.subs?.find((s) => s.tag === 0x5f) : null);
  const slotInfo = $derived.by(() => {
    void $editor;
    const v = slotNode?.hex ? unhex(slotNode.hex) : null;

    if (!v || v.length < 3) return null;
    return { activeIdx: v[2], ids: [...v.subarray(3, 3 + v[1])] };
  });
  const slotOptions = $derived(
    slotInfo?.ids.map((id, i) => ({ value: String(i), label: pickerLabel(id) })) ?? [],
  );

  function setSlotActive(idx: number) {
    if (!slotNode) return;
    const v = unhex(slotNode.hex || "");

    v[2] = idx;
    set(slotNode, { hex: hex(v) });
  }

  function thumbURL(r: Resource) {
    const c = document.createElement("canvas");

    c.width = r.w;
    c.height = r.h;
    if (r.bitmap) c.getContext("2d")?.drawImage(r.bitmap, 0, 0);
    return c.toDataURL();
  }
  function downloadRes(ri: number) {
    if (!$editor.face) return;
    const a = document.createElement("a");

    a.href = thumbURL($editor.face.resources[ri]);
    a.download = `res${ri}.png`;
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
            if (dragIdx !== null && dropIdx === i && st) moveImage(st, dragIdx, i);
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

{#snippet thumb(ri: number)}
  {@const r = $editor.face!.resources[ri]}
  <div class="thumb-wrap">
    <label title="res{ri} · {r.w}×{r.h} · cf{r.cf} — click to replace" class="thumb">
      <img src={thumbURL(r)} alt="res{ri}" />
      <input
        type="file"
        accept="image/*"
        hidden
        onchange={(e) => {
          const file = e.currentTarget.files?.[0];

          if (file) replaceImageRequested({ resIdx: ri, file });
        }}
      />
    </label>
    <button title="Download PNG" onclick={() => downloadRes(ri)} class="dl-btn">
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
