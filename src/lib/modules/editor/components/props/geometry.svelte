<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Slider } from "$lib/shared/components/slider";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import {
    framesOf,
    isPlaced,
    type Frame,
    type Layer,
  } from "../../core/document/doc";
  import { FULL_BLEED_R, type ArcSpec } from "../../core/render/arc";
  import { ringRadius } from "../../core/document/edits";
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
    rotateImageRequested,
    ringResized,
    adjustImageRequested,
    alignRequested,
  } = editorModel;

  const FLEX_ALIGN: [number, IconName, string][] = [
    [0, "align_horizontal_left", "Pack children at the frame start"],
    [2, "align_horizontal_center", "Center children in the frame"],
  ];

  const alignH: [AlignDir, IconName, string][] = [
    ["left", "align_horizontal_left", "Align left"],
    ["hcenter", "align_horizontal_center", "Align horizontal centers"],
    ["right", "align_horizontal_right", "Align right"],
  ];
  const alignV: [AlignDir, IconName, string][] = [
    ["top", "align_vertical_top", "Align top"],
    ["vcenter", "align_vertical_center", "Align vertical centers"],
    ["bottom", "align_vertical_bottom", "Align bottom"],
  ];

  const placed = $derived(isPlaced(layer) ? layer : null);
  const frame = $derived(layer.kind === "group" ? layer.frame : null);
  const hand = $derived(layer.kind === "hand" ? layer : null);
  const ring = $derived(layer.kind === "ring" ? layer : null);

  // A ring with art is sized by its bitmap, like any other widget (the w/h block below); one
  // without has no pixels at all — its size is the 0x5a spec, so the field asks the model for the
  // same factor a corner drag would, rather than rebuilding the ring here.
  const ringR = $derived(ring ? ringRadius(ring) : 0);
  const bareRing = $derived(ring && !ring.frames.length ? ring : null);

  const setSpec = (patch: Partial<ArcSpec>) =>
    ring &&
    set(ring.id, { spec: { ...ring.spec, ...patch } } as Partial<Layer>);

  const setRingSize = (d: number) =>
    ring &&
    ringResized({ layer: ring.id, kw: d / (2 * ringR), kh: d / (2 * ringR) });

  // size of the widget's first frame — the asset IS the widget's size, there's no draw-time
  // scale in the format, so resizing rescales the pixels (see assets.model)
  const first = $derived.by(() => {
    const ids = framesOf(layer);

    return ids.length ? ($doc?.images.get(ids[0]) ?? null) : null;
  });
  const resSize = $derived(first ? { w: first.w, h: first.h } : null);
  // absolute, the way the field reads — the model takes the change (see rotateImageRequested)
  const angle = $derived(first?.rotate ?? 0);

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
    adjustImageRequested({
      layer: layer.id,
      adjust: { ...adjust, [key]: value },
    });
  }

  const setFrame = (patch: Partial<Frame>) =>
    frame && set(layer.id, { frame: { ...frame, ...patch } } as Partial<Layer>);
</script>

{#if placed || frame}
  <div class="row">
    {#each [alignH, alignV] as group}
      <div class="btn-group">
        {#each group as [dir, iconName, title] (dir)}
          <button
            type="button"
            {title}
            class="icon-btn"
            onclick={() => alignRequested(dir)}
          >
            <Icon name={iconName} size={16} />
          </button>
        {/each}
      </div>
    {/each}
  </div>
{/if}
{#if placed && !frame}
  <div class="row">
    <Input
      label="x"
      type="number"
      value={String(placed.x)}
      onInput={(v) => set(layer.id, { x: num(v) } as Partial<Layer>)}
    />
    <Input
      label="y"
      type="number"
      value={String(placed.y)}
      onInput={(v) => set(layer.id, { y: num(v) } as Partial<Layer>)}
    />
  </div>
{/if}
{#if resSize}
  <div class="row">
    <Input
      label="w"
      type="number"
      min={1}
      max={2047}
      value={String(resSize.w)}
      onChange={(v) =>
        resize(
          num(v),
          $lockAspect
            ? Math.round((num(v) * resSize.h) / resSize.w)
            : resSize.h,
        )}
    />
    <Input
      label="h"
      type="number"
      min={1}
      max={2047}
      value={String(resSize.h)}
      onChange={(v) =>
        resize(
          $lockAspect
            ? Math.round((num(v) * resSize.w) / resSize.h)
            : resSize.w,
          num(v),
        )}
    />
    <button
      type="button"
      title={$lockAspect ? "Aspect ratio locked" : "Aspect ratio free"}
      class="icon-btn"
      class:on={$lockAspect}
      onclick={() => lockAspectToggled()}
    >
      <Icon name={$lockAspect ? "link" : "link_off"} size={16} />
    </button>
  </div>
  <p class="hint-xs">
    rescaled from the original — re-encoded only on save/flash
  </p>
  <div class="row">
    <span class="field-label w-md">angle</span>
    <Input
      type="number"
      step={15}
      value={String(angle)}
      onChange={(v) =>
        rotateImageRequested({ layer: layer.id, deg: num(v) - angle })}
    />
  </div>
  <p class="hint-xs">baked into the pixels — the format itself has no angle</p>
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
{#if ring}
  <div class="row">
    {#if bareRing}
      <Input
        label="size"
        type="number"
        min={4}
        max={2 * (FULL_BLEED_R - 1)}
        value={String(ringR * 2)}
        onChange={(v) => setRingSize(num(v))}
      />
    {/if}
    <Input
      label="stroke"
      type="number"
      min={1}
      value={String(ring.spec.width)}
      onInput={(v) => setSpec({ width: Math.max(1, num(v)) })}
    />
  </div>
  <div class="row">
    <Input
      label="start"
      type="number"
      value={String(ring.spec.start)}
      onInput={(v) => setSpec({ start: num(v) })}
    />
    <Input
      label="end"
      type="number"
      value={String(ring.spec.end)}
      onInput={(v) => setSpec({ end: num(v) })}
    />
  </div>
  <p class="hint-xs">
    degrees clockwise from 12 o'clock — 20 → 340 leaves a 40° gap at the top
  </p>
{/if}
{#if frame}
  <div class="row">
    <Input
      label="x"
      type="number"
      value={String(frame.x)}
      onInput={(v) => setFrame({ x: num(v) })}
    />
    <Input
      label="y"
      type="number"
      value={String(frame.y)}
      onInput={(v) => setFrame({ y: num(v) })}
    />
  </div>
  <div class="row">
    <Input
      label="w"
      type="number"
      value={String(frame.w)}
      onInput={(v) => setFrame({ w: num(v) })}
    />
    <Input
      label="h"
      type="number"
      value={String(frame.h)}
      onInput={(v) => setFrame({ h: num(v) })}
    />
  </div>
  <div class="row">
    <span class="field-label w-md">align</span>
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
  <p class="hint-xs">
    where the group's auto-laid-out children sit along the row
  </p>
{/if}
{#if hand}
  <div class="row">
    <Input
      label="pivot x"
      type="number"
      value={String(hand.pivotX)}
      onInput={(v) => set(layer.id, { pivotX: num(v) } as Partial<Layer>)}
    />
    <Input
      label="pivot y"
      type="number"
      value={String(hand.pivotY)}
      onInput={(v) => set(layer.id, { pivotY: num(v) } as Partial<Layer>)}
    />
  </div>
  <p class="hint-xs">screen center = {CENTER},{CENTER} (x+pivotX, y+pivotY)</p>
{/if}
