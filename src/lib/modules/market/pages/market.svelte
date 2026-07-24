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

  const { $user: user } = authModel;
  const {
    $items: items, $likes: likes, $marketErr: marketErr,
    marketLoadRequested, likeToggleRequested, removeRequested, editRequested,
  } = marketModel;
  import { goto } from '$app/navigation';
  import { page } from '$app/state';

  marketLoadRequested();

  const TABS = ['nothing', 'community'];
  // tab lives in the URL (?tab=) so it survives a page reload
  let tab = $state(TABS.includes(page.url.searchParams.get('tab')) ? page.url.searchParams.get('tab') : 'nothing');
  $effect(() => {
    // window.location, not page.url — otherwise the effect depends on the same URL it
    // changes via goto(), and ends up in an infinite navigation loop
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  });

  let query = $state('');
  let sort = $state('new'); // new | popular

  const likeCount = id => $likes.filter(l => l.watchface === id).length;
  const myLike = id => $likes.find(l => l.watchface === id && l.user === $user?.id);

  const shown = $derived(
    $items
      // "From Nothing" — the whole catalog without an owner (both factory type=nothing
      // and cmf), grouped by category (see grouped below)
      .filter(wf => (tab === 'community' ? !!wf.owner : !wf.owner))
      .filter(wf => wf.name.toLowerCase().includes(query.trim().toLowerCase()))
      .toSorted((a, b) => (sort === 'popular'
        ? (b.downloads || 0) + likeCount(b.id) - (a.downloads || 0) - likeCount(a.id)
        : b.created.localeCompare(a.created)))
  );

  // "From Nothing" — sections by category with horizontal scroll (like on the watch itself),
  // not a flat grid
  const grouped = $derived.by(() => {
    const byCat = new Map();
    for (const wf of shown) {
      const key = wf.description || '';
      if (!byCat.has(key)) byCat.set(key, []);
      byCat.get(key).push(wf);
    }
    return [...byCat.entries()];
  });

  // all data is already loaded in full (getFullList in the model) — we progressively
  // reveal only the flat grid (community) render, so the screen doesn't get flooded
  // with cards at once. Resets on tab/search/sort change since that changes shown.
  const PAGE = 60;
  let visibleCount = $state(PAGE);
  $effect(() => { tab; query; sort; visibleCount = PAGE; });
  const visible = $derived(shown.slice(0, visibleCount));

  function loadMore(node) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) visibleCount = Math.min(visibleCount + PAGE, shown.length);
    });
    io.observe(node);
    return { destroy: () => io.disconnect() };
  }

  function remove(wf) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    removeRequested(wf);
  }
</script>

{#if $marketErr}<p class="px-4 pt-3 text-sm text-destructive lg:px-6">{$marketErr}</p>{/if}

<div class="flex min-h-0 flex-1 flex-col">
  <div class="flex flex-wrap items-center gap-2 border-b p-3 sm:px-4 lg:px-6">
    <Tabs.Root bind:value={tab}>
      <Tabs.List class="h-8">
        <Tabs.Trigger value="nothing" class="text-xs">From Nothing</Tabs.Trigger>
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

  {#snippet card(wf, fixedWidth)}
    <div class={['flex flex-col gap-2 rounded-xl border p-3 transition-shadow hover:shadow-md', fixedWidth && 'w-40 shrink-0 sm:w-48']}>
      <button class="aspect-square cursor-pointer overflow-hidden rounded-full bg-black"
        onclick={() => editRequested(wf)} title="Open in editor">
        <img src={fileUrl(wf, 'preview')} alt={wf.name} class="h-full w-full object-cover" loading="lazy" />
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
          onclick={() => likeToggleRequested({ wf, userId: $user.id })}
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
  {/snippet}

  {#if tab === 'nothing'}
    <!-- sections by category, horizontal scroll within each — like on the watch itself -->
    <main class="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
      {#each grouped as [category, list] (category)}
        <section class="mb-6">
          <h2 class="mb-2 text-sm font-semibold">{category || 'Other'}</h2>
          <div class="flex gap-3 overflow-x-auto pb-2 sm:gap-4">
            {#each list as wf (wf.id)}
              {@render card(wf, true)}
            {/each}
          </div>
        </section>
      {:else}
        <p class="py-16 text-center text-sm text-muted-foreground">Nothing found.</p>
      {/each}
    </main>
  {:else}
    <main class="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto p-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 sm:p-4 lg:p-6">
      {#each visible as wf (wf.id)}
        {@render card(wf, false)}
      {:else}
        <p class="col-span-full py-16 text-center text-sm text-muted-foreground">
          No community watchfaces yet — publish yours from the editor.
        </p>
      {/each}
      {#if visibleCount < shown.length}
        <div class="col-span-full h-1" use:loadMore></div>
      {/if}
    </main>
  {/if}
</div>
