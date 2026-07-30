<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Slider } from "$lib/shared/components/slider";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import { framesOf, isPlaced, type Frame, type Layer } from "../../core/document/doc";
  import { CENTER } from "../../core/render/screen";
  import { editorModel } from "../../model";
  import type { AlignDir } from "../../model/edit.model";
  import { num, set } from "./patch";

  const { layer }: { layer: Layer } = $props();
  const {
    $doc: doc,
    $lockAspect: lockAspect,
    lockAspectToggled,
    resizeImageRequested,
    adjustImageRequested,
    alignRequested,
  } = editorModel;

  // frame byte 8's main-axis alignment — only these two values occur across the corpus, so
  // END/SPACE_* aren't offered. [value, icon, title]
  const FLEX_ALIGN: [number, IconName, string][] = [
    [0, "align-left", "Pack children at the frame start"],
    [2, "align-center", "Center children in the frame"],
  ];

  // Figma-style position buttons: [dir, icon, title] — two groups of three
  const alignH: [AlignDir, IconName, string][] = [
    ["left", "align-left", "Align left"],
    ["hcenter", "align-center", "Align horizontal centers"],
    ["right", "align-right", "Align right"],
  ];
  const alignV: [AlignDir, IconName, string][] = [
    ["top", "align-top", "Align top"],
    ["vcenter", "align-middle", "Align vertical centers"],
    ["bottom", "align-bottom", "Align bottom"],
  ];

  // The document is immutable, so `layer` is a fresh object on every edit and plain deriveds off
  // it invalidate on their own — no snapshot juggling needed to see a drag or an undo.
  const placed = $derived(isPlaced(layer) ? layer : null);
  const frame = $derived(layer.kind === "group" ? layer.frame : null);
  const hand = $derived(layer.kind === "hand" ? layer : null);

  // size of the widget's first frame — the asset IS the widget's size, there's no draw-time
  // scale in the format, so resizing rescales the pixels (see assets.model)
  const first = $derived.by(() => {
    const ids = framesOf(layer);

    return ids.length ? ($doc?.images.get(ids[0]) ?? null) : null;
  });
  const resSize = $derived(first ? { w: first.w, h: first.h } : null);

  function resize(w: number, h: number) {
    if (resSize) resizeImageRequested({ layer: layer.id, w, h });
  }

  // non-destructive canvas filters on the widget's frames — see adjustImageFx
  const HUE_TRACK = "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"; // the hue wheel
  const ADJUST = [
    { key: "brightness", label: "bright", max: 200, unit: "%" },
    { key: "contrast", label: "contrast", max: 200, unit: "%" },
    { key: "saturate", label: "saturate", max: 300, unit: "%" },
    { key: "hue", label: "hue", max: 360, unit: "°", track: HUE_TRACK },
  ] as const;
  const NEUTRAL = { brightness: 100, contrast: 100, saturate: 100, hue: 0 };
  const adjust = $derived(first?.adjust ?? NEUTRAL);

  function setAdjust(key: keyof typeof NEUTRAL, value: number) {
    adjustImageRequested({ layer: layer.id, adjust: { ...adjust, [key]: value } });
  }

  const setFrame = (patch: Partial<Frame>) =>
    frame && set(layer.id, { frame: { ...frame, ...patch } } as Partial<Layer>);
</script>

{#if placed || frame}
  <div class="row">
    {#each [alignH, alignV] as group}
      <div class="btn-group">
        {#each group as [dir, iconName, title] (dir)}
          <button type="button" {title} class="icon-btn" onclick={() => alignRequested(dir)}>
            <Icon name={iconName} size={16} />
          </button>
        {/each}
      </div>
    {/each}
  </div>
{/if}
{#if placed && !frame}
  <div class="row">
    <span class="field-label">x</span>
    <Input
      type="number"
      value={String(placed.x)}
      onInput={(v) => set(layer.id, { x: num(v) } as Partial<Layer>)}
    />
    <span class="field-label">y</span>
    <Input
      type="number"
      value={String(placed.y)}
      onInput={(v) => set(layer.id, { y: num(v) } as Partial<Layer>)}
    />
  </div>
{/if}
{#if resSize}
  <div class="row">
    <span class="field-label">w</span>
    <Input
      type="number"
      min={1}
      max={2047}
      value={String(resSize.w)}
      onChange={(v) =>
        resize(num(v), $lockAspect ? Math.round((num(v) * resSize.h) / resSize.w) : resSize.h)}
    />
    <span class="field-label">h</span>
    <Input
      type="number"
      min={1}
      max={2047}
      value={String(resSize.h)}
      onChange={(v) =>
        resize($lockAspect ? Math.round((num(v) * resSize.w) / resSize.h) : resSize.w, num(v))}
    />
    <button
      type="button"
      title={$lockAspect ? "Aspect ratio locked" : "Aspect ratio free"}
      class="icon-btn"
      class:on={$lockAspect}
      onclick={() => lockAspectToggled()}
    >
      <Icon name={$lockAspect ? "link" : "unlink"} size={16} />
    </button>
  </div>
  <p class="hint-xs">rescaled from the original — re-encoded only on save/flash</p>
  {#each ADJUST as a (a.key)}
    <div class="row">
      <span class="field-label w-md">{a.label}</span>
      <Slider
        max={a.max}
        step={5}
        unit={a.unit}
        track={"track" in a ? a.track : undefined}
        value={adjust[a.key]}
        onInput={(v) => setAdjust(a.key, v)}
      />
    </div>
  {/each}
{/if}
{#if frame}
  <div class="row">
    <span class="field-label">x</span>
    <Input type="number" value={String(frame.x)} onInput={(v) => setFrame({ x: num(v) })} />
    <span class="field-label">y</span>
    <Input type="number" value={String(frame.y)} onInput={(v) => setFrame({ y: num(v) })} />
  </div>
  <div class="row">
    <span class="field-label">w</span>
    <Input type="number" value={String(frame.w)} onInput={(v) => setFrame({ w: num(v) })} />
    <span class="field-label">h</span>
    <Input type="number" value={String(frame.h)} onInput={(v) => setFrame({ h: num(v) })} />
  </div>
  <div class="row">
    <span class="field-label">align</span>
    <div class="btn-group">
      {#each FLEX_ALIGN as [main, iconName, title] (main)}
        <button
          type="button"
          {title}
          class="icon-btn"
          class:on={frame.main === main}
          onclick={() => setFrame({ main })}
        >
          <Icon name={iconName} size={16} />
        </button>
      {/each}
    </div>
  </div>
  <p class="hint-xs">where the group's auto-laid-out children sit along the row</p>
{/if}
{#if hand}
  <div class="row">
    <span class="field-label w-md">pivot x</span>
    <Input
      type="number"
      value={String(hand.pivotX)}
      onInput={(v) => set(layer.id, { pivotX: num(v) } as Partial<Layer>)}
    />
    <span class="field-label w-sm">y</span>
    <Input
      type="number"
      value={String(hand.pivotY)}
      onInput={(v) => set(layer.id, { pivotY: num(v) } as Partial<Layer>)}
    />
  </div>
  <p class="hint-xs">screen center = {CENTER},{CENTER} (x+pivotX, y+pivotY)</p>
{/if}
