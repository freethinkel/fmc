<script>
  import { Input } from '$lib/shared/components/ui/input';
  import { Label } from '$lib/shared/components/ui/label';
  import { Checkbox } from '$lib/shared/components/ui/checkbox';
  import { Download } from '@lucide/svelte';
  import { cn } from '$lib/shared/helpers';
  import { TAG, unhex, hex } from '../lib/wf';
  import { metaInfo, ID_LABELS, parseFrame } from '../lib/render';
  import { editorModel } from '../model';
  const { editor, checkpoint, patched, replaceImageFx } = editorModel;

  const selStruct = n => (n?.tag === TAG.struct ? n : n?.subs?.find(s => s.tag === TAG.struct));
  const st = $derived(selStruct($editor.sel));
  const meta = $derived(st?.meta ? metaInfo(st) : null);
  const pivot = $derived($editor.sel?.subs?.find(s => s.tag === TAG.pivot));
  const fmtNode = $derived($editor.sel?.subs?.find(s => s.tag === TAG.fmt));
  const bindNode = $derived($editor.sel?.subs?.find(s => s.tag === TAG.bind));
  const frame = $derived($editor.sel?.tag === TAG.group ? parseFrame($editor.sel) : null);
  const fmtByte = $derived(fmtNode ? unhex(fmtNode.hex)[0] || 0 : 0);
  // 0x5f: [slotIndex][count][activeIdx][count × metric id][padding] — see 0x85 "Widget slot"
  const slotNode = $derived($editor.sel?.tag === 0x85 ? $editor.sel.subs?.find(s => s.tag === 0x5f) : null);
  const slotInfo = $derived.by(() => {
    const v = slotNode?.hex ? unhex(slotNode.hex) : null;
    if (!v || v.length < 3) return null;
    return { activeIdx: v[2], ids: [...v.subarray(3, 3 + v[1])] };
  });

  const num = e => +e.target.value || 0;
  const set = (node, patch) => { checkpoint(); patched({ node, patch }); };

  function setFrame(patch) {
    const f = $editor.sel.subs.find(s => s.tag === TAG.frame);
    const v = unhex(f.hex);
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
    {#if st && st.x != null && !frame}
      <div class="flex items-center gap-2">
        <Label class="w-8">x</Label><Input class="h-8" type="number" value={st.x} oninput={e => set(st, { x: num(e) })} />
        <Label class="w-8">y</Label><Input class="h-8" type="number" value={st.y} oninput={e => set(st, { y: num(e) })} />
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
          {#each [[1, 'start'], [0, 'center'], [2, 'end']] as [v, label] (v)}
            <button
              type="button"
              class={cn(
                'h-8 rounded-lg border px-2 text-xs',
                frame.align === v ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
              onclick={() => setFrame({ align: v })}
            >{label}</button>
          {/each}
        </div>
      </div>
      <p class="text-xs text-muted-foreground">
        align — cross-axis alignment of children in this group (editor-only, real watches always center)
      </p>
    {/if}
    {#if pivot}
      <div class="flex items-center gap-2">
        <Label class="w-14">pivot x</Label><Input class="h-8" type="number" value={pivot.pivotX} oninput={e => set(pivot, { pivotX: num(e) })} />
        <Label class="w-8">y</Label><Input class="h-8" type="number" value={pivot.pivotY} oninput={e => set(pivot, { pivotY: num(e) })} />
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
      <div>
        <Label class="text-xs text-muted-foreground">meta (hex)</Label>
        <Input class="mt-1 h-8 font-mono text-xs" value={st.meta}
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
        <Input class="mt-1 h-8 font-mono text-xs" value={bindNode.hex}
          oninput={e => { if (/^([0-9a-f]{2})*$/i.test(e.target.value)) set(bindNode, { hex: e.target.value }); }} />
      </div>
    {/if}
    {#if slotInfo}
      <div>
        <Label class="text-xs text-muted-foreground">widget slot — active metric</Label>
        <div class="mt-1 flex flex-wrap gap-1">
          {#each slotInfo.ids as id, i (i)}
            <button type="button"
              class={cn(
                'h-8 rounded-lg border px-2 text-xs',
                slotInfo.activeIdx === i ? 'bg-accent text-accent-foreground' : 'text-muted-foreground',
              )}
              onclick={() => setSlotActive(i)}
            >0x{id.toString(16)} — {ID_LABELS[id] || '?'}</button>
          {/each}
        </div>
      </div>
    {/if}
    {#if st?.images}
      <div class="flex flex-wrap gap-2">
        {#each st.images as ri}
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
