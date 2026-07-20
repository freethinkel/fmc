<script>
  import { Button } from '$lib/shared/components/ui/button';
  import { Input } from '$lib/shared/components/ui/input';
  import * as Tabs from '$lib/shared/components/ui/tabs';
  import * as Select from '$lib/shared/components/ui/select';
  import { Badge } from '$lib/shared/components/ui/badge/index.js';
  import { Heart, Download, Trash2, Search } from '@lucide/svelte';
  import { fileUrl, downloadUrl } from '$lib/shared/api';
  import { authModel } from '$lib/modules/auth/model';
  import { marketModel } from '../model';
  import { editorModel } from '$lib/modules/editor/model';

  const { user } = authModel;
  const { items, likes, marketErr, loadMarketFx, toggleLikeFx, removeFx, openedWfSet } = marketModel;
  const { loadBufferFx, errored } = editorModel;
  import { goto } from '$app/navigation';

  loadMarketFx().catch(() => {});

  let tab = $state('catalog'); // catalog | community
  let query = $state('');
  let sort = $state('new'); // new | popular

  const likeCount = id => $likes.filter(l => l.watchface === id).length;
  const myLike = id => $likes.find(l => l.watchface === id && l.user === $user?.id);

  const shown = $derived(
    $items
      .filter(wf => (tab === 'catalog' ? !wf.owner : !!wf.owner))
      .filter(wf => wf.name.toLowerCase().includes(query.trim().toLowerCase()))
      .toSorted((a, b) => (sort === 'popular'
        ? (b.downloads || 0) + likeCount(b.id) - (a.downloads || 0) - likeCount(a.id)
        : b.created.localeCompare(a.created)))
  );

  async function openInEditor(wf) {
    try {
      const buf = await (await fetch(fileUrl(wf, 'bin'))).arrayBuffer();
      await loadBufferFx({ buf, label: wf.name });
      openedWfSet($user && wf.owner === $user.id ? wf : null);
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

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex flex-wrap items-center gap-2 border-b p-3 sm:px-4 lg:px-6">
    <Tabs.Root bind:value={tab}>
      <Tabs.List class="h-8">
        <Tabs.Trigger value="catalog" class="text-xs">Catalog</Tabs.Trigger>
        <Tabs.Trigger value="community" class="text-xs">Community</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
    <div class="relative ms-auto w-40 sm:w-56">
      <Search class="text-muted-foreground absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2" />
      <Input bind:value={query} placeholder="Search…" class="h-8 ps-8 text-sm" />
    </div>
    <Select.Root type="single" bind:value={sort}>
      <Select.Trigger class="h-8 w-28 text-xs">{sort === 'new' ? 'Newest' : 'Popular'}</Select.Trigger>
      <Select.Content>
        <Select.Item value="new" label="Newest" />
        <Select.Item value="popular" label="Popular" />
      </Select.Content>
    </Select.Root>
  </div>

  <main class="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto p-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 sm:p-4 lg:p-6">
    {#each shown as wf (wf.id)}
      <div class="flex flex-col gap-2 rounded-xl border p-3 transition-shadow hover:shadow-md">
        <button class="aspect-square cursor-pointer overflow-hidden rounded-full bg-black"
          onclick={() => openInEditor(wf)} title="Open in editor">
          <img src={fileUrl(wf, 'preview')} alt={wf.name} class="h-full w-full object-cover" />
        </button>
        <div class="flex items-baseline justify-between gap-2">
          <span class="truncate text-sm font-medium">{wf.name}</span>
          {#if wf.type}<Badge variant="outline" class="shrink-0 text-[10px] uppercase">{wf.type}</Badge>{/if}
        </div>
        {#if wf.owner}
          <span class="text-xs text-muted-foreground">by {wf.expand?.owner?.name || '—'}</span>
        {/if}
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
        {tab === 'community' ? 'No community watchfaces yet — publish yours from the editor.' : 'Nothing found.'}
      </p>
    {/each}
  </main>
</div>
