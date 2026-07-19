<script>
  import { Button } from '$lib/shared/components/ui/button';
  import { ImagePlus, Hash, Clock3, Trash2 } from '@lucide/svelte';
  import { TAG } from '../lib/wf';
  import { metaInfo, ID_LABELS } from '../lib/render';
  import { editorModel } from '../model';
  const { editor, select, addWidgetFx, deleteWidget } = editorModel;

  const tagNames = {
    [TAG.main]: 'Screen', [TAG.aod]: 'AOD', [TAG.name]: 'Name', [TAG.preview]: 'Preview',
    [TAG.image]: 'Image', [TAG.number]: 'Number', [TAG.group]: 'Group', [TAG.hand]: 'Hand',
    [TAG.struct]: 'struct', [TAG.bind]: 'cond', [TAG.pivot]: 'pivot', [TAG.fmt]: 'format',
    [TAG.frame]: 'frame', [TAG.pvStruct]: 'preview', 0x38: 'Widget 0x38',
    0x80: 'Arc', 0x81: 'Progress ring', 0x82: 'Arc 0x82', 0x85: 'Widget slot',
  };

  export function nodeLabel(n) {
    let s = tagNames[n.tag] || `0x${n.tag.toString(16)}`;
    const st = n.tag === TAG.struct ? n : n.subs?.find(c => c.tag === TAG.struct);
    if (st?.meta) {
      const { id } = metaInfo(st);
      if (id) s += ` · ${ID_LABELS[id] || 'id 0x' + id.toString(16)}`;
    }
    if (n._kind) s += ` · ${n._kind}`;
    return s;
  }

  function onAdd(kind, e) {
    const files = e.target.files;
    if (files?.length) addWidgetFx({ kind, files: [...files] }).catch(() => {});
    e.target.value = '';
  }
</script>

<div class="flex h-full flex-col">
  <div class="flex items-center gap-1 border-b p-2">
    <Button variant="outline" size="sm" title="Add image widget" disabled={!$editor.face}>
      <label class="flex cursor-pointer items-center gap-1"><ImagePlus class="size-4" />
        <input type="file" accept="image/*" hidden onchange={e => onAdd('image', e)} /></label>
    </Button>
    <Button variant="outline" size="sm" title="Add number widget — select 10 digit images (0…9)" disabled={!$editor.face}>
      <label class="flex cursor-pointer items-center gap-1"><Hash class="size-4" />
        <input type="file" accept="image/*" multiple hidden onchange={e => onAdd('number', e)} /></label>
    </Button>
    <Button variant="outline" size="sm" title="Add hand widget" disabled={!$editor.face}>
      <label class="flex cursor-pointer items-center gap-1"><Clock3 class="size-4" />
        <input type="file" accept="image/*" hidden onchange={e => onAdd('hand', e)} /></label>
    </Button>
    <div class="grow"></div>
    <Button variant="ghost" size="sm" title="Delete selected widget" disabled={!$editor.sel} onclick={deleteWidget}>
      <Trash2 class="size-4 text-destructive" />
    </Button>
  </div>
  <div class="grow overflow-y-auto py-1 text-sm">
    {#if $editor.face}
      {#each $editor.face.screens.filter(s => s.tag === $editor.screenTag) as scr}
        {@render treeNode(scr, 0)}
      {/each}
    {:else}
      <p class="p-3 text-muted-foreground">Drop a .bin here or grab one from the marketplace.</p>
    {/if}
  </div>
</div>

{#snippet treeNode(n, depth)}
  <button
    class="block w-full truncate px-2 py-0.5 text-left hover:bg-accent {$editor.sel === n ? 'bg-primary/15 text-primary' : ''}"
    style="padding-left:{10 + depth * 14}px"
    onclick={() => select(n)}>
    {nodeLabel(n)}
  </button>
  {#if n.subs && depth < 4}
    {#each n.subs as c}
      {#if c.subs || c.tag === TAG.struct}{@render treeNode(c, depth + 1)}{/if}
    {/each}
  {/if}
{/snippet}
