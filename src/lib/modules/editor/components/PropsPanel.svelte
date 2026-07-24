<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Checkbox } from "$lib/shared/components/checkbox";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import { TAG, unhex, hex, type FaceNode, type Resource } from "../lib/wf";
  import { metaInfo, ID_LABELS, parseFrame, type Frame } from "../lib/render";
  import { editorModel } from "../model";
  import type { AlignDir } from "../model/editor.model";
  const {
    $editor: editor,
    checkpoint,
    patched,
    replaceImageRequested,
    alignSelected,
  } = editorModel;

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

  const selStruct = (n: FaceNode | null) =>
    n?.tag === TAG.struct ? n : n?.subs?.find((s) => s.tag === TAG.struct);
  const st = $derived(selStruct($editor.sel));
  const pivot = $derived($editor.sel?.subs?.find((s) => s.tag === TAG.pivot));
  const fmtNode = $derived($editor.sel?.subs?.find((s) => s.tag === TAG.fmt));
  const bindNode = $derived($editor.sel?.subs?.find((s) => s.tag === TAG.bind));
  const frame = $derived(
    $editor.sel?.tag === TAG.group ? parseFrame($editor.sel) : null,
  );
  // The face tree is mutated in place (editor.model's patched), so node-returning deriveds
  // above keep yielding the SAME object and property reads off them (st.x, st.meta…) never
  // invalidate. Everything the template DISPLAYS goes through this snapshot instead — it
  // depends on $editor (a fresh store object per update), so drags, undo and checkbox
  // patches show up immediately. The node deriveds above stay as patch targets for set().
  const sv = $derived.by(() => {
    void $editor;
    return {
      x: st?.x,
      y: st?.y,
      metaHex: st?.meta,
      images: st?.images,
      pivotX: pivot?.pivotX,
      pivotY: pivot?.pivotY,
      bindHex: bindNode?.hex,
    };
  });
  const meta = $derived.by(() => {
    void $editor;
    return st?.meta ? metaInfo(st) : null;
  });
  const fmtByte = $derived.by(() => {
    void $editor;
    return fmtNode ? unhex(fmtNode.hex || "")[0] || 0 : 0;
  });
  // 0x5f: [slotIndex][count][activeIdx][count × metric id][padding] — see 0x85 "Widget slot"
  const slotNode = $derived(
    $editor.sel?.tag === 0x85
      ? $editor.sel.subs?.find((s) => s.tag === 0x5f)
      : null,
  );
  const slotInfo = $derived.by(() => {
    void $editor;
    const v = slotNode?.hex ? unhex(slotNode.hex) : null;

    if (!v || v.length < 3) return null;
    return { activeIdx: v[2], ids: [...v.subarray(3, 3 + v[1])] };
  });
  const slotOptions = $derived(
    slotInfo?.ids.map((id, i) => ({
      value: String(i),
      label: `0x${id.toString(16)} — ${ID_LABELS[id] || "?"}`,
    })) ?? [],
  );

  const num = (s: string) => Number(s) || 0;
  const set = (node: FaceNode, patch: Partial<FaceNode>) => {
    checkpoint();
    patched({ node, patch });
  };

  function setFrame(patch: Partial<Frame>) {
    if (!frame) return;
    const f = $editor.sel?.subs?.find((s) => s.tag === TAG.frame);

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
    v[8] = cur.gap;
    set(f, { hex: hex(v) });
  }
  function setSlotActive(idx: number) {
    if (!slotNode) return;
    const v = unhex(slotNode.hex || "");

    v[2] = idx;
    set(slotNode, { hex: hex(v) });
  }
  function setFmt(digits: number, pad: number | boolean) {
    if (!fmtNode) return;
    set(fmtNode, {
      hex: hex(new Uint8Array([(digits & 0x1f) | (pad ? 0x80 : 0)])),
    });
  }
  // meta[7] === 4 marks this widget's resource(s) accent-tintable on the real device — see
  // docs/cmf-protocol.md "Accent color". Every non-transparent pixel gets swapped, regardless
  // of its baked color, so this works on any art (white, colored, whatever).
  function setAccent(on: boolean) {
    if (!st) return;
    const v = unhex(st.meta || "");

    v[7] = on ? 4 : 0;
    set(st, { meta: hex(v) });
  }
  // Second-source smoothness, device-verified the hard way (Wavy Seconds experiments):
  // HANDS on 0x0f/0x12 sweep smoothly; hands on 0x71/0x72 tick once per second (Sundial);
  // rings/everything else tick at 1 Hz on every id, and 0x71/0x72 on a ring freezes it
  // into a static bitmap. So: hands get a smooth(0x12)/ticking(0x72) toggle; rings only
  // get a rescue button back to their native 0x0f if left on a broken smooth-era id.
  const SECOND_IDS = [0x0f, 0x12, 0x71, 0x72];
  const isSecondHand = $derived(
    $editor.sel?.tag === TAG.hand &&
      meta != null &&
      SECOND_IDS.includes(meta.id),
  );
  const isBrokenRing = $derived(
    $editor.sel != null &&
      [0x80, 0x81].includes($editor.sel.tag) &&
      meta != null &&
      [0x71, 0x72].includes(meta.id),
  );

  function setSecondId(id: number) {
    if (!st) return;
    const v = unhex(st.meta || "");

    v[9] = id;
    set(st, { meta: hex(v) });
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

{#if $editor.sel}
  <div class="panel">
    {#if (st && st.x != null) || frame}
      <div class="row">
        {#each [alignH, alignV] as group}
          <div class="btn-group">
            {#each group as [dir, iconName, title] (dir)}
              <button
                type="button"
                {title}
                class="icon-btn"
                onclick={() => alignSelected(dir)}
              >
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
        <Input
          type="number"
          value={String(sv.x)}
          onInput={(v) => set(st, { x: num(v) })}
        />
        <span class="field-label">y</span>
        <Input
          type="number"
          value={String(sv.y)}
          onInput={(v) => set(st, { y: num(v) })}
        />
      </div>
    {/if}
    {#if frame}
      <div class="row">
        <span class="field-label">x</span>
        <Input
          type="number"
          value={String(frame.x)}
          onInput={(v) => setFrame({ x: num(v) })}
        />
        <span class="field-label">y</span>
        <Input
          type="number"
          value={String(frame.y)}
          onInput={(v) => setFrame({ y: num(v) })}
        />
      </div>
      <div class="row">
        <span class="field-label">w</span>
        <Input
          type="number"
          value={String(frame.w)}
          onInput={(v) => setFrame({ w: num(v) })}
        />
        <span class="field-label">h</span>
        <Input
          type="number"
          value={String(frame.h)}
          onInput={(v) => setFrame({ h: num(v) })}
        />
      </div>
      <div class="row">
        <span class="field-label">gap</span>
        <Input
          type="number"
          value={String(frame.gap)}
          onInput={(v) => setFrame({ gap: num(v) })}
        />
      </div>
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
    {#if meta?.id}
      <p class="hint">
        source: <span class="text-emph"
          >0x{meta.id.toString(16)} — {ID_LABELS[meta.id] || "?"}</span
        >
        {#if meta.max}, max {meta.max}{/if}
      </p>
    {/if}
    {#if st?.meta}
      <div class="check-row">
        <Checkbox checked={!!meta?.accent} onChange={(v) => setAccent(v)} />
        <button
          type="button"
          class="check-label"
          onclick={() => setAccent(!meta?.accent)}
          >tints with device accent color</button
        >
      </div>
    {/if}
    {#if isSecondHand}
      <div class="check-row">
        <Checkbox
          checked={meta?.id === 0x0f || meta?.id === 0x12}
          onChange={(v) => setSecondId(v ? 0x12 : 0x72)}
        />
        <button
          type="button"
          class="check-label"
          onclick={() =>
            setSecondId(meta?.id === 0x0f || meta?.id === 0x12 ? 0x72 : 0x12)}
        >
          smooth sweep (unchecked — ticks once per second)
        </button>
      </div>
    {/if}
    {#if isBrokenRing}
      <button type="button" class="text-btn" onclick={() => setSecondId(0x0f)}>
        broken second source (0x{meta?.id.toString(16)}) — restore ticking 0x0f
      </button>
    {/if}
    {#if st?.meta}
      <div>
        <span class="muted-label">meta (hex)</span>
        <Input
          value={sv.metaHex}
          onInput={(v) => {
            if (/^[0-9a-f]{28}$/i.test(v)) set(st, { meta: v });
          }}
        />
      </div>
    {/if}
    {#if fmtNode}
      <div class="row">
        <span class="field-label">digits</span>
        <span class="w-num">
          <Input
            type="number"
            min={0}
            max={31}
            value={String(fmtByte & 0x1f)}
            onInput={(v) => setFmt(num(v), fmtByte & 0x80)}
          />
        </span>
        <Checkbox
          checked={!!(fmtByte & 0x80)}
          onChange={(v) => setFmt(fmtByte & 0x1f, v)}
        />
        <button
          type="button"
          class="check-label"
          onclick={() => setFmt(fmtByte & 0x1f, !(fmtByte & 0x80))}
          >leading zeros</button
        >
      </div>
    {/if}
    {#if bindNode}
      <div>
        <span class="muted-label">condition (hex)</span>
        <Input
          value={sv.bindHex}
          onInput={(v) => {
            if (/^([0-9a-f]{2})*$/i.test(v)) set(bindNode, { hex: v });
          }}
        />
      </div>
    {/if}
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
    {#if sv.images}
      <div class="images">
        {#each sv.images as ri}
          {@const r = $editor.face!.resources[ri]}
          <div class="thumb-wrap">
            <label
              title="res{ri} · {r.w}×{r.h} · cf{r.cf} — click to replace"
              class="thumb"
            >
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
            <button
              title="Download PNG"
              onclick={() => downloadRes(ri)}
              class="dl-btn"
            >
              <Icon name="download" size={14} />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <p class="hint">Nothing selected.</p>
{/if}

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 12px;
    font-size: 0.875rem;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .field-label {
    flex-shrink: 0;
    font-weight: 500;
  }
  .field-label.w-sm {
    width: 32px;
  }
  .field-label.w-md {
    width: 56px;
  }
  .muted-label {
    display: block;
    margin-bottom: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .hint {
    margin: 0;
    font-size: 0.875rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .hint-xs {
    margin: 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .text-emph {
    color: var(--color-text);
  }
  .w-num {
    display: inline-block;
    width: 64px;
    flex-shrink: 0;
  }
  .btn-group {
    display: flex;
    gap: 4px;
  }
  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
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
  }
  .text-btn {
    border: 1px solid oklch(from var(--color-text) l c h / 12%);
    border-radius: var(--border-radius);
    background: transparent;
    padding: 4px 8px;
    font: inherit;
    font-size: 0.75rem;
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
    gap: 8px;
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
  .images {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .thumb-wrap {
    position: relative;
  }
  .thumb {
    display: block;
    cursor: pointer;
    border-radius: 6px;
    overflow: hidden;
    background: repeating-conic-gradient(
        oklch(from var(--color-text) l c h / 15%) 0 25%,
        oklch(from var(--color-text) l c h / 8%) 0 50%
      )
      0 0 / 12px 12px;

    img {
      display: block;
      max-width: 56px;
      max-height: 56px;
    }
  }
  .dl-btn {
    position: absolute;
    top: 2px;
    inset-inline-end: 2px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 2px;
    border: none;
    border-radius: 4px;
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
