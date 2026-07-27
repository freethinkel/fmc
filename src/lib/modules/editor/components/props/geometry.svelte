<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Slider } from "$lib/shared/components/slider";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import { hex, unhex, TAG, type FaceNode } from "../../lib/wf";
  import { parseFrame, type Frame } from "../../lib/render";
  import { structOf } from "../../lib/tree";
  import { editorModel } from "../../model";
  import type { AlignDir } from "../../model/editor.model";
  import { num, set } from "./patch";

  const { node }: { node: FaceNode } = $props();
  const {
    $editor: editor,
    resizeImageRequested,
    adjustImageRequested,
    alignSelected,
  } = editorModel;

  let lockAspect = $state(true);

  // frame byte 8's main-axis alignment (see parseFrame) — only these two values occur
  // across the corpus, so END/SPACE_* aren't offered. [value, icon, title]
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

  const st = $derived(structOf(node));
  const pivot = $derived(node.subs?.find((s) => s.tag === TAG.pivot));
  const frame = $derived(node.tag === TAG.group ? parseFrame(node) : null);
  // The face tree is mutated in place (editor.model's patched), so node-returning deriveds
  // above keep yielding the SAME object and property reads off them (st.x, st.meta…) never
  // invalidate. Everything the template DISPLAYS goes through this snapshot instead — it
  // depends on $editor (a fresh store object per update), so drags, undo and slider patches
  // show up immediately. The node deriveds above stay as patch targets for set().
  const sv = $derived.by(() => {
    void $editor;
    return { x: st?.x, y: st?.y, images: st?.images, pivotX: pivot?.pivotX, pivotY: pivot?.pivotY };
  });

  // size of the widget's first frame — the resource IS the widget's size, there's no
  // draw-time scale in the format, so resizing rescales the pixels (editor.model)
  const firstRes = $derived.by(() => {
    void $editor;
    return sv.images?.length ? $editor.face?.resources[sv.images[0]] : null;
  });
  const resSize = $derived(firstRes ? { w: firstRes.w, h: firstRes.h } : null);

  function resize(w: number, h: number) {
    if (resSize) resizeImageRequested({ node, w, h });
  }

  // non-destructive canvas filters on the widget's frames — see adjustImageFx
  const HUE_TRACK = "linear-gradient(90deg,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)"; // the hue wheel itself
  const ADJUST = [
    { key: "brightness", label: "bright", max: 200, unit: "%" },
    { key: "contrast", label: "contrast", max: 200, unit: "%" },
    { key: "saturate", label: "saturate", max: 300, unit: "%" },
    { key: "hue", label: "hue", max: 360, unit: "°", track: HUE_TRACK },
  ] as const;
  const NEUTRAL = { brightness: 100, contrast: 100, saturate: 100, hue: 0 };
  const adjust = $derived(firstRes?.adjust ?? NEUTRAL);

  function setAdjust(key: keyof typeof NEUTRAL, value: number) {
    adjustImageRequested({ node, adjust: { ...adjust, [key]: value } });
  }

  function setFrame(patch: Partial<Frame>) {
    if (!frame) return;
    const f = node.subs?.find((s) => s.tag === TAG.frame);

    if (!f) return;
    let v = unhex(f.hex || "");

    if (v.length < 9) {
      const b = new Uint8Array(9);

      b.set(v);
      v = b;
    }
    const cur = { ...frame, ...patch };

    v[0] = cur.x;
    v[1] = cur.x >> 8;
    v[2] = cur.y;
    v[3] = cur.y >> 8;
    v[4] = cur.w;
    v[5] = cur.w >> 8;
    v[6] = cur.h;
    v[7] = cur.h >> 8;
    v[8] = (v[8] & ~3) | cur.main; // keep the byte's unread high bits (see parseFrame)
    set(f, { hex: hex(v) });
  }
</script>

{#if (st && st.x != null) || frame}
  <div class="row">
    {#each [alignH, alignV] as group}
      <div class="btn-group">
        {#each group as [dir, iconName, title] (dir)}
          <button type="button" {title} class="icon-btn" onclick={() => alignSelected(dir)}>
            <Icon name={iconName} size={16} />
          </button>
        {/each}
      </div>
    {/each}
  </div>
{/if}
{#if st && sv.x != null && !frame}
  <div class="row">
    <span class="field-label">x</span>
    <Input type="number" value={String(sv.x)} onInput={(v) => set(st, { x: num(v) })} />
    <span class="field-label">y</span>
    <Input type="number" value={String(sv.y)} onInput={(v) => set(st, { y: num(v) })} />
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
        resize(num(v), lockAspect ? Math.round((num(v) * resSize.h) / resSize.w) : resSize.h)}
    />
    <span class="field-label">h</span>
    <Input
      type="number"
      min={1}
      max={2047}
      value={String(resSize.h)}
      onChange={(v) =>
        resize(lockAspect ? Math.round((num(v) * resSize.w) / resSize.h) : resSize.w, num(v))}
    />
    <button
      type="button"
      title={lockAspect ? "Aspect ratio locked" : "Aspect ratio free"}
      class="icon-btn"
      class:on={lockAspect}
      onclick={() => (lockAspect = !lockAspect)}
    >
      <Icon name={lockAspect ? "link" : "unlink"} size={16} />
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
{#if pivot}
  <div class="row">
    <span class="field-label w-md">pivot x</span>
    <Input
      type="number"
      value={String(sv.pivotX)}
      onInput={(v) => set(pivot, { pivotX: num(v) })}
    />
    <span class="field-label w-sm">y</span>
    <Input
      type="number"
      value={String(sv.pivotY)}
      onInput={(v) => set(pivot, { pivotY: num(v) })}
    />
  </div>
  <p class="hint-xs">screen center = 233,233 (x+pivotX, y+pivotY)</p>
{/if}
