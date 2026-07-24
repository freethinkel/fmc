<script>
  import { Input } from '$lib/shared/components/ui/input';
  import { Label } from '$lib/shared/components/ui/label';
  import { Checkbox } from '$lib/shared/components/ui/checkbox';
  import * as Select from '$lib/shared/components/ui/select';
  import { Download, AlignStartVertical, AlignCenterVertical, AlignEndVertical,
    AlignStartHorizontal, AlignCenterHorizontal, AlignEndHorizontal } from '@lucide/svelte';
  import { cn } from '$lib/shared/helpers';
  import { TAG, unhex, hex } from '../lib/wf';
  import { metaInfo, ID_LABELS, parseFrame } from '../lib/render';
  import { editorModel } from '../model';
  const { editor, checkpoint, patched, replaceImageFx, alignSelected } = editorModel;

  // Figma-style position buttons: [dir, icon, title] — two groups of three
  const alignH = [
    ['left', AlignStartVertical, 'Align left'],
    ['hcenter', AlignCenterVertical, 'Align horizontal centers'],
    ['right', AlignEndVertical, 'Align right'],
  ];
  const alignV = [
    ['top', AlignStartHorizontal, 'Align top'],
    ['vcenter', AlignCenterHorizontal, 'Align vertical centers'],
    ['bottom', AlignEndHorizontal, 'Align bottom'],
  ];

  const selStruct = n => (n?.tag === TAG.struct ? n : n?.subs?.find(s => s.tag === TAG.struct));
  const st = $derived(selStruct($editor.sel));
  const pivot = $derived($editor.sel?.subs?.find(s => s.tag === TAG.pivot));
  const fmtNode = $derived($editor.sel?.subs?.find(s => s.tag === TAG.fmt));
  const bindNode = $derived($editor.sel?.subs?.find(s => s.tag === TAG.bind));
  const frame = $derived($editor.sel?.tag === TAG.group ? parseFrame($editor.sel) : null);
  // The face tree is mutated in place (editor.model's patched), so node-returning deriveds
  // above keep yielding the SAME object and property reads off them (st.x, st.meta…) never
  // invalidate. Everything the template DISPLAYS goes through this snapshot instead — it
  // depends on $editor (a fresh store object per update), so drags, undo and checkbox
  // patches show up immediately. The node deriveds above stay as patch targets for set().
  const sv = $derived.by(() => {
    void $editor;
    return {
      x: st?.x, y: st?.y, metaHex: st?.meta, images: st?.images,
      pivotX: pivot?.pivotX, pivotY: pivot?.pivotY, bindHex: bindNode?.hex,
    };
  });
  const meta = $derived.by(() => { void $editor; return st?.meta ? metaInfo(st) : null; });
  const fmtByte = $derived.by(() => { void $editor; return fmtNode ? unhex(fmtNode.hex)[0] || 0 : 0; });
  // 0x5f: [slotIndex][count][activeIdx][count × metric id][padding] — see 0x85 "Widget slot"
  const slotNode = $derived($editor.sel?.tag === 0x85 ? $editor.sel.subs?.find(s => s.tag === 0x5f) : null);
  const slotInfo = $derived.by(() => {
    void $editor;
    const v = slotNode?.hex ? unhex(slotNode.hex) : null;
    if (!v || v.length < 3) return null;
    return { activeIdx: v[2], ids: [...v.subarray(3, 3 + v[1])] };
  });

  const num = e => +e.target.value || 0;
  const set = (node, patch) => { checkpoint(); patched({ node, patch }); };

  // frame.align acts on the CROSS axis of the group's auto row — same direction inference
  // as drawGroup (AUTO children's x/y spread), so the icons match what actually moves
  const groupVertical = $derived.by(() => {
    if (!frame) return false;
    const autos = ($editor.sel.subs || [])
      .map(k => k.subs?.find(s => s.tag === TAG.struct))
      .filter(s => s && metaInfo(s).w === 0x8000);
    const spread = a => (a.length ? Math.max(...a) - Math.min(...a) : 0);
    return autos.length > 1 && spread(autos.map(s => s.y || 0)) > spread(autos.map(s => s.x || 0));
  });
  const frameAlignBtns = $derived(groupVertical
    ? [[1, AlignStartVertical, 'Children left'], [0, AlignCenterVertical, 'Children centered'], [2, AlignEndVertical, 'Children right']]
    : [[1, AlignStartHorizontal, 'Children top'], [0, AlignCenterHorizontal, 'Children middle'], [2, AlignEndHorizontal, 'Children bottom']]);

  function setFrame(patch) {
    const f = $editor.sel.subs.find(s => s.tag === TAG.frame);
    let v = unhex(f.hex);
    if (v.length < 10) { const b = new Uint8Array(10); b.set(v); v = b; } // frame.hex may omit the align byte
    const cur = { ...frame, ...patch };
    v[0] = cur.x; v[1] = cur.x >> 8; v[2] = cur.y; v[3] = cur.y >> 8;
    v[4] = cur.w; v[5] = cur.w >> 8; v[6] = cur.h; v[7] = cur.h >> 8;
    v[8] = cur.gap; v[9] = cur.align;
    set(f, { hex: hex(v) });
  }
  function setSlotActive(idx) {
    const v = unhex(slotNode.hex);
    v[2] = idx;
    set(slotNode, { hex: hex(v) });
  }
  function setFmt(digits, pad) {
    set(fmtNode, { hex: hex(new Uint8Array([(digits & 0x1f) | (pad ? 0x80 : 0)])) });
  }
  // meta[7] === 4 marks this widget's resource(s) accent-tintable on the real device — see
  // docs/cmf-protocol.md "Accent color". Every non-transparent pixel gets swapped, regardless
  // of its baked color, so this works on any art (white, colored, whatever).
  function setAccent(on) {
    const v = unhex(st.meta);
    v[7] = on ? 4 : 0;
    set(st, { meta: hex(v) });
  }
  // Second-source smoothness, device-verified the hard way (Wavy Seconds experiments):
  // HANDS on 0x0f/0x12 sweep smoothly; hands on 0x71/0x72 tick once per second (Sundial);
  // rings/everything else tick at 1 Hz on every id, and 0x71/0x72 on a ring freezes it
  // into a static bitmap. So: hands get a smooth(0x12)/ticking(0x72) toggle; rings only
  // get a rescue button back to their native 0x0f if left on a broken smooth-era id.
  const SECOND_IDS = [0x0f, 0x12, 0x71, 0x72];
  const isSecondHand = $derived($editor.sel?.tag === TAG.hand && SECOND_IDS.includes(meta?.id));
  const isBrokenRing = $derived(
    [0x80, 0x81].includes($editor.sel?.tag) && [0x71, 0x72].includes(meta?.id),
  );
  function setSecondId(id) {
    const v = unhex(st.meta);
    v[9] = id;
    set(st, { meta: hex(v) });
  }
  function thumbURL(r) {
    const c = document.createElement('canvas');
    c.width = r.w; c.height = r.h;
    if (r.bitmap) c.getContext('2d').drawImage(r.bitmap, 0, 0);
    return c.toDataURL();
  }
  function downloadRes(ri) {
    const a = document.createElement('a');
    a.href = thumbURL($editor.face.resources[ri]);
    a.download = `res${ri}.png`;
    a.click();
  }
</script>

{#if $editor.sel}
  <div class="space-y-3 text-sm">
    {#if (st && st.x != null) || frame}
      <div class="flex items-center gap-3">
        {#each [alignH, alignV] as group}
          <div class="flex gap-1">
            {#each group as [dir, Icon, title] (dir)}
              <button
                type="button"
                {title}
                class="hover:bg-accent hover:text-accent-foreground text-muted-foreground flex h-8 w-8 items-center justify-center rounded-lg border"
                onclick={() => alignSelected(dir)}
              ><Icon class="size-4" /></button>
            {/each}
          </div>
        {/each}
      </div>
    {/if}
    {#if st && sv.x != null && !frame}
      <div class="flex items-center gap-2">
        <Label class="w-8">x</Label><Input class="h-8" type="number" value={sv.x} oninput={e => set(st, { x: num(e) })} />
        <Label class="w-8">y</Label><Input class="h-8" type="number" value={sv.y} oninput={e => set(st, { y: num(e) })} />
      </div>
    {/if}
    {#if frame}
      <div class="flex items-center gap-2">
        <Label class="w-8">x</Label><Input class="h-8" type="number" value={frame.x} oninput={e => setFrame({ x: num(e) })} />
        <Label class="w-8">y</Label><Input class="h-8" type="number" value={frame.y} oninput={e => setFrame({ y: num(e) })} />
      </div>
      <div class="flex items-center gap-2">
        <Label class="w-8">w</Label><Input class="h-8" type="number" value={frame.w} oninput={e => setFrame({ w: num(e) })} />
        <Label class="w-8">h</Label><Input class="h-8" type="number" value={frame.h} oninput={e => setFrame({ h: num(e) })} />
      </div>
      <div class="flex items-center gap-2">
        <Label class="w-8">gap</Label><Input class="h-8" type="number" value={frame.gap} oninput={e => setFrame({ gap: num(e) })} />
      </div>
      <div class="flex items-center gap-2">
        <Label class="w-14">align</Label>
        <div class="flex gap-1">
          {#each frameAlignBtns as [v, Icon, title] (v)}
            <button
              type="button"
              {title}
              class={cn(
                'flex h-8 w-8 items-center justify-center rounded-lg border',
                frame.align === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
              onclick={() => setFrame({ align: v })}
            ><Icon class="size-4" /></button>
          {/each}
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        align — cross-axis alignment of auto children (editor-only, real watches always center)
      </p>
    {/if}
    {#if pivot}
      <div class="flex items-center gap-2">
        <Label class="w-14">pivot x</Label><Input class="h-8" type="number" value={sv.pivotX} oninput={e => set(pivot, { pivotX: num(e) })} />
        <Label class="w-8">y</Label><Input class="h-8" type="number" value={sv.pivotY} oninput={e => set(pivot, { pivotY: num(e) })} />
      </div>
      <p class="text-xs text-muted-foreground">screen center = 233,233 (x+pivotX, y+pivotY)</p>
    {/if}
    {#if meta?.id}
      <p class="text-muted-foreground">
        source: <span class="text-foreground">0x{meta.id.toString(16)} — {ID_LABELS[meta.id] || '?'}</span>
        {#if meta.max}, max {meta.max}{/if}
      </p>
    {/if}
    {#if st?.meta}
      <div class="flex items-center gap-2">
        <Checkbox checked={meta?.accent} onCheckedChange={v => setAccent(v)} id="accent" />
        <Label for="accent">tints with device accent color</Label>
      </div>
    {/if}
    {#if isSecondHand}
      <div class="flex items-center gap-2">
        <Checkbox checked={meta.id === 0x0f || meta.id === 0x12}
          onCheckedChange={v => setSecondId(v ? 0x12 : 0x72)} id="smooth" />
        <Label for="smooth">smooth sweep (unchecked — ticks once per second)</Label>
      </div>
    {/if}
    {#if isBrokenRing}
      <button type="button" class="text-muted-foreground hover:text-foreground rounded-lg border px-2 py-1 text-xs"
        onclick={() => setSecondId(0x0f)}>
        broken second source (0x{meta.id.toString(16)}) — restore ticking 0x0f
      </button>
    {/if}
    {#if st?.meta}
      <div>
        <Label class="text-xs text-muted-foreground">meta (hex)</Label>
        <Input class="mt-1 h-8 font-mono text-xs" value={sv.metaHex}
          oninput={e => { if (/^[0-9a-f]{28}$/i.test(e.target.value)) set(st, { meta: e.target.value }); }} />
      </div>
    {/if}
    {#if fmtNode}
      <div class="flex items-center gap-2">
        <Label>digits</Label>
        <Input class="h-8 w-16" type="number" min="0" max="31" value={fmtByte & 0x1f}
          oninput={e => setFmt(num(e), fmtByte & 0x80)} />
        <Checkbox checked={!!(fmtByte & 0x80)} onCheckedChange={v => setFmt(fmtByte & 0x1f, v)} id="pad" />
        <Label for="pad">leading zeros</Label>
      </div>
    {/if}
    {#if bindNode}
      <div>
        <Label class="text-xs text-muted-foreground">condition (hex)</Label>
        <Input class="mt-1 h-8 font-mono text-xs" value={sv.bindHex}
          oninput={e => { if (/^([0-9a-f]{2})*$/i.test(e.target.value)) set(bindNode, { hex: e.target.value }); }} />
      </div>
    {/if}
    {#if slotInfo}
      <div>
        <Label class="text-xs text-muted-foreground">widget slot — active metric</Label>
        <Select.Root type="single" value={String(slotInfo.activeIdx)}
          onValueChange={v => setSlotActive(+v)}>
          <Select.Trigger class="mt-1 h-8 w-full text-xs">
            {ID_LABELS[slotInfo.ids[slotInfo.activeIdx]] || `0x${slotInfo.ids[slotInfo.activeIdx]?.toString(16)}`}
          </Select.Trigger>
          <Select.Content>
            {#each slotInfo.ids as id, i (i)}
              <Select.Item value={String(i)} label={`0x${id.toString(16)} — ${ID_LABELS[id] || '?'}`} />
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    {/if}
    {#if sv.images}
      <div class="flex flex-wrap gap-2">
        {#each sv.images as ri}
          <div class="group relative">
            <label title="res{ri} · {$editor.face.resources[ri].w}×{$editor.face.resources[ri].h} · cf{$editor.face.resources[ri].cf} — click to replace"
              class="cursor-pointer">
              <img src={thumbURL($editor.face.resources[ri])} alt="res{ri}"
                class="max-h-14 max-w-14 rounded border border-border bg-[repeating-conic-gradient(#333_0_25%,#222_0_50%)] bg-[length:12px_12px]" />
              <input type="file" accept="image/*" hidden
                onchange={e => e.target.files[0] && replaceImageFx({ resIdx: ri, file: e.target.files[0] }).catch(() => {})} />
            </label>
            <button title="Download PNG" onclick={() => downloadRes(ri)}
              class="bg-background/80 text-foreground absolute end-0.5 top-0.5 rounded p-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100">
              <Download class="size-3.5" />
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <p class="text-sm text-muted-foreground">Nothing selected.</p>
{/if}
