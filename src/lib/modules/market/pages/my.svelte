<script>
  import { Button } from '$lib/shared/components/ui/button';
  import { Badge } from '$lib/shared/components/ui/badge/index.js';
  import { Heart, Download, Trash2, Pencil, Globe, GlobeLock } from '@lucide/svelte';
  import { fileUrl } from '$lib/shared/api';
  import { goto } from '$app/navigation';
  import { authModel } from '$lib/modules/auth/model';
  import { marketModel } from '../model';
  import { editorModel } from '$lib/modules/editor/model';

  const { user } = authModel;
  const { myItems, likes, marketErr, loadMyFx, removeFx, togglePublishFx, openedWfSet } = marketModel;
  const { loadBufferFx, errored } = editorModel;

  $effect(() => {
    if ($user) loadMyFx($user.id).catch(() => {});
    else goto('/login');
  });

  const likeCount = id => $likes.filter(l => l.watchface === id).length;

  async function edit(wf) {
    try {
      const buf = await (await fetch(fileUrl(wf, 'bin'))).arrayBuffer();
      await loadBufferFx({ buf, label: wf.name });
      openedWfSet(wf);
      goto('/editor');
    } catch (e) {
      errored(e.message);
    }
  }

  function remove(wf) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    removeFx(wf).catch(() => {});
  }
</script>

<svelte:head><title>My watchfaces — FMC Watchfaces</title></svelte:head>

{#if $marketErr}<p class="px-4 pt-3 text-sm text-destructive lg:px-6">{$marketErr}</p>{/if}

<main class="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto p-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 sm:p-4 lg:p-6">
  {#each $myItems as wf (wf.id)}
    <div class="flex flex-col gap-2 rounded-xl border p-3 transition-shadow hover:shadow-md">
      <button class="aspect-square cursor-pointer overflow-hidden rounded-full bg-black"
        onclick={() => edit(wf)} title="Open in editor">
        <img src={fileUrl(wf, 'preview')} alt={wf.name} class="h-full w-full object-cover" />
      </button>
      <div class="flex items-center justify-between gap-2">
        <span class="truncate text-sm font-medium">{wf.name}</span>
        <Badge variant={wf.published ? 'default' : 'secondary'}>
          {wf.published ? 'Published' : 'Draft'}
        </Badge>
      </div>
      <div class="mt-auto flex items-center gap-1">
        {#if wf.published}
          <span class="text-muted-foreground flex items-center gap-1 text-xs">
            <Heart class="size-3.5" /> {likeCount(wf.id)}
            <Download class="ms-1.5 size-3.5" /> {wf.downloads || 0}
          </span>
        {/if}
        <div class="ms-auto flex items-center">
          <Button size="sm" variant="ghost" onclick={() => edit(wf)} title="Edit">
            <Pencil class="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onclick={() => togglePublishFx(wf).catch(() => {})}
            title={wf.published ? 'Unpublish' : 'Publish'}>
            {#if wf.published}<GlobeLock class="size-4" />{:else}<Globe class="size-4" />{/if}
          </Button>
          <Button size="sm" variant="ghost" onclick={() => remove(wf)} title="Delete">
            <Trash2 class="text-destructive size-4" />
          </Button>
        </div>
      </div>
    </div>
  {:else}
    <p class="col-span-full py-16 text-center text-sm text-muted-foreground">
      Nothing here yet — create a watchface in the editor and hit Save.
    </p>
  {/each}
</main>
