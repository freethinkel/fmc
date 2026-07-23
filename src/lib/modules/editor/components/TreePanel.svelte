<script>
  import { SvelteSet } from 'svelte/reactivity';
  import { Button } from '$lib/shared/components/ui/button';
  import { ImagePlus, Hash, Clock3, Trash2, Monitor, Moon, Type, Eye, Image, Folder,
    Braces, GitBranch, Crosshair, Film, Circle, LoaderCircle, SquareDashed, Box, ChevronRight } from '@lucide/svelte';
  import { TAG, unhex } from '../lib/wf';
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

  const tagIcons = {
    [TAG.main]: Monitor, [TAG.aod]: Moon, [TAG.name]: Type, [TAG.preview]: Eye,
    [TAG.image]: Image, [TAG.number]: Hash, [TAG.group]: Folder, [TAG.hand]: Clock3,
    [TAG.struct]: Braces, [TAG.bind]: GitBranch, [TAG.pivot]: Crosshair, [TAG.fmt]: Braces,
    [TAG.frame]: Film, [TAG.pvStruct]: Eye,
    0x80: Circle, 0x81: LoaderCircle, 0x82: Circle, 0x85: SquareDashed,
  };

  export function nodeLabel(n) {
    let s = tagNames[n.tag] || `0x${n.tag.toString(16)}`;
    const st = n.tag === TAG.struct ? n : n.subs?.find(c => c.tag === TAG.struct);
    if (st?.meta) {
      const { id } = metaInfo(st);
      if (id) s += ` · ${ID_LABELS[id] || 'id 0x' + id.toString(16)}`;
    }
    if (n.tag === 0x85) {
      // 0x5f: [slotIndex][count][activeIdx][count × metric id] — show the currently assigned metric
      const sf = n.subs?.find(c => c.tag === 0x5f);
      const v = sf?.hex ? unhex(sf.hex) : null;
      const activeId = v && v.length >= 3 ? v[3 + v[2]] : undefined;
      if (activeId != null) s += ` · ${ID_LABELS[activeId] || '0x' + activeId.toString(16)}`;
    }
    if (n._kind) s += ` · ${n._kind}`;
    return s;
  }

  function onAdd(kind, e) {
    const files = e.target.files;
    if (files?.length) addWidgetFx({ kind, files: [...files] }).catch(() => {});
    e.target.value = '';
  }

  const openNodes = new SvelteSet(); // accordion: closed by default, keyed by the node itself (tree is mutable, refs are stable)
  function toggleOpen(n, e) {
    e.stopPropagation();
    if (openNodes.has(n)) openNodes.delete(n); else openNodes.add(n);
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
  {@const Icon = tagIcons[n.tag] || Box}
  {@const kids = depth < 4 ? (n.subs || []).filter(c => c.subs || c.tag === TAG.struct) : []}
  <button
    class="flex w-full items-center gap-1.5 px-2 py-0.5 text-left hover:bg-accent {$editor.sel === n ? 'bg-primary/15 text-primary' : ''}"
    style="padding-left:{10 + depth * 14}px"
    onclick={() => select(n)}>
    {#if kids.length}
      <ChevronRight
        class="size-3 shrink-0 text-muted-foreground transition-transform {openNodes.has(n) ? 'rotate-90' : ''}"
        onclick={e => toggleOpen(n, e)} />
    {:else}
      <span class="size-3 shrink-0"></span>
    {/if}
    <Icon class="size-3.5 shrink-0 {$editor.sel === n ? '' : 'text-muted-foreground'}" />
    <span class="truncate">{nodeLabel(n)}</span>
  </button>
  {#if kids.length && openNodes.has(n)}
    {#each kids as c}
      {@render treeNode(c, depth + 1)}
    {/each}
  {/if}
{/snippet}
