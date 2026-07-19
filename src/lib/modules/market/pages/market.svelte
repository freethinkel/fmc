<script>
  import { Button } from '$lib/shared/components/ui/button';
  import { Heart, Download, Trash2 } from '@lucide/svelte';
  import { fileUrl, downloadUrl } from '$lib/shared/api';
  import { authModel } from '$lib/modules/auth/model';
  import { marketModel } from '../model';
  import { editorModel } from '$lib/modules/editor/model';

  const { user } = authModel;
  const { items, likes, marketErr, loadMarketFx, toggleLikeFx, removeFx } = marketModel;
  const { loadBufferFx, errored } = editorModel;
  import { goto } from '$app/navigation';

  loadMarketFx().catch(() => {});

  const likeCount = id => $likes.filter(l => l.watchface === id).length;
  const myLike = id => $likes.find(l => l.watchface === id && l.user === $user?.id);

  async function openInEditor(wf) {
    try {
      const buf = await (await fetch(fileUrl(wf, 'bin'))).arrayBuffer();
      await loadBufferFx({ buf, label: wf.name });
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

{#if $marketErr}<p class="px-4 pt-3 text-sm text-destructive lg:px-6">{$marketErr}</p>{/if}

<main class="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto p-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 sm:p-4 lg:p-6">
    {#each $items as wf (wf.id)}
      <div class="flex flex-col gap-2 rounded-xl border p-3">
        <button class="aspect-square cursor-pointer overflow-hidden rounded-full bg-black"
          onclick={() => openInEditor(wf)} title="Open in editor">
          <img src={fileUrl(wf, 'preview')} alt={wf.name} class="h-full w-full object-cover" />
        </button>
        <div class="flex items-baseline justify-between gap-2">
          <span class="truncate text-sm font-medium">{wf.name}</span>
          <span class="shrink-0 text-xs text-muted-foreground">{wf.expand?.owner?.name || '—'}</span>
        </div>
        {#if wf.description}
          <p class="line-clamp-2 text-xs text-muted-foreground">{wf.description}</p>
        {/if}
        <div class="mt-auto flex items-center gap-1">
          <Button size="sm" variant="ghost" disabled={!$user}
            onclick={() => toggleLikeFx({ wf, userId: $user.id }).catch(() => {})}
            title={$user ? 'Like' : 'Sign in to like'}>
            <Heart class={['size-4', myLike(wf.id) && 'fill-red-500 text-red-500']} />
            <span class="text-xs">{likeCount(wf.id)}</span>
          </Button>
          <Button size="sm" variant="ghost" href={downloadUrl(wf)} title="Download .bin">
            <Download class="size-4" />
            <span class="text-xs">{wf.downloads || 0}</span>
          </Button>
          {#if $user?.id === wf.owner}
            <Button size="sm" variant="ghost" class="ml-auto" onclick={() => remove(wf)} title="Delete">
              <Trash2 class="size-4 text-destructive" />
            </Button>
          {/if}
        </div>
      </div>
    {:else}
      <p class="col-span-full py-16 text-center text-sm text-muted-foreground">
        Nothing here yet — open the editor and publish the first watchface.
      </p>
    {/each}
</main>
