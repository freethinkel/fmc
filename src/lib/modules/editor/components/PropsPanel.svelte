<script>
  import { Input } from '$lib/shared/components/ui/input';
  import { Label } from '$lib/shared/components/ui/label';
  import { Checkbox } from '$lib/shared/components/ui/checkbox';
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

  const num = e => +e.target.value || 0;
  const set = (node, patch) => { checkpoint(); patched({ node, patch }); };

  function setFrameXY(x, y) {
    const f = $editor.sel.subs.find(s => s.tag === TAG.frame);
    const v = unhex(f.hex);
    v[0] = x; v[1] = x >> 8; v[2] = y; v[3] = y >> 8;
    set(f, { hex: hex(v) });
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
        <Label class="w-8">x</Label><Input class="h-8" type="number" value={frame.x} oninput={e => setFrameXY(num(e), frame.y)} />
        <Label class="w-8">y</Label><Input class="h-8" type="number" value={frame.y} oninput={e => setFrameXY(frame.x, num(e))} />
      </div>
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
    {#if st?.images}
      <div class="flex flex-wrap gap-2">
        {#each st.images as ri}
          <label title="res{ri} · {$editor.face.resources[ri].w}×{$editor.face.resources[ri].h} · cf{$editor.face.resources[ri].cf} — click to replace"
            class="cursor-pointer">
            <img src={thumbURL($editor.face.resources[ri])} alt="res{ri}"
              class="max-h-14 max-w-14 rounded border border-border bg-[repeating-conic-gradient(#333_0_25%,#222_0_50%)] bg-[length:12px_12px]" />
            <input type="file" accept="image/*" hidden
              onchange={e => e.target.files[0] && replaceImageFx({ resIdx: ri, file: e.target.files[0] }).catch(() => {})} />
          </label>
        {/each}
      </div>
    {/if}
  </div>
{:else}
  <p class="text-sm text-muted-foreground">Nothing selected.</p>
{/if}
