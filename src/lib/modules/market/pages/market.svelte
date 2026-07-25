<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { Icon } from "$lib/shared/components/icon";
  import type { RecordModel } from "pocketbase";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";
  import { WatchfaceCard } from "../components/watchface-card";

  const { $user: user } = authModel;
  const {
    $items: items,
    $likes: likes,
    $marketErr: marketErr,
    $marketLoading: marketLoading,
    marketLoadRequested,
    likeToggleRequested,
    removeRequested,
    editRequested,
  } = marketModel;

  marketLoadRequested();

  let query = $state("");
  let sort = $state("new"); // new | popular | downloads
  const SORT_OPTIONS = [
    { value: "new", label: "Newest" },
    { value: "popular", label: "Popular" },
    { value: "downloads", label: "Most downloaded" },
  ];

  const likeCount = (id: string) => $likes.filter((l) => l.watchface === id).length;
  const myLike = (id: string) => $likes.find((l) => l.watchface === id && l.user === $user?.id);

  function remove(wf: RecordModel) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    removeRequested(wf);
  }

  const shown = $derived(
    $items
      // community only — ownerless catalog records aren't served any more
      // (fmc_pocketbase 1753500000_hide_catalog.js); the guard stays so a stale
      // cached list can't render them either
      .filter((wf) => Boolean(wf.owner))
      .filter((wf) => wf.name.toLowerCase().includes(query.trim().toLowerCase()))
      .toSorted((a, b) =>
        sort === "popular"
          ? (b.downloads || 0) + likeCount(b.id) - (a.downloads || 0) - likeCount(a.id)
          : sort === "downloads"
            ? (b.downloads || 0) - (a.downloads || 0)
            : b.created.localeCompare(a.created),
      ),
  );

  // all data is already loaded in full (getFullList in the model) — we progressively
  // reveal the grid so the screen doesn't get flooded with cards at once.
  // Resets on search/sort change since that changes shown.
  const PAGE = 60;
  let visibleCount = $state(PAGE);
  /* oxlint-disable no-unused-expressions -- bare refs register these as $effect deps */
  $effect(() => {
    query;
    sort;
    visibleCount = PAGE;
  });
  /* oxlint-enable no-unused-expressions */
  const visible = $derived(shown.slice(0, visibleCount));

  function loadMore(node: HTMLElement) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) visibleCount = Math.min(visibleCount + PAGE, shown.length);
    });

    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <div class="toolbar">
    <div class="search">
      <Icon name="search" size={14} />
      <Input bind:value={query} placeholder="Search…" />
    </div>
    <div class="sort">
      <Select bind:value={sort} options={SORT_OPTIONS} />
    </div>
  </div>

  {#if $marketLoading}
    <main class="grid">
      {#each Array(8) as _, i (i)}
        <div class="skeleton-card">
          <Skeleton height="140px" />
          <Skeleton height="14px" width="70%" />
          <Skeleton height="12px" width="40%" />
        </div>
      {/each}
    </main>
  {:else}
    <main class="grid">
      {#each visible as wf (wf.id)}
        <WatchfaceCard
          {wf}
          likeCount={likeCount(wf.id)}
          liked={!!myLike(wf.id)}
          canLike={!!$user}
          canRemove={$user?.id === wf.owner}
          onOpen={() => editRequested(wf)}
          onLike={() => $user && likeToggleRequested({ wf, userId: $user.id })}
          onRemove={() => remove(wf)}
        />
      {:else}
        <p class="empty full">No community watchfaces yet — publish yours from the editor.</p>
      {/each}
      {#if visibleCount < shown.length}
        <div class="sentinel" use:loadMore></div>
      {/if}
    </main>
  {/if}
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .error {
    margin: 0;
    padding: 12px 16px 0;
    font-size: 0.875rem;
    color: var(--color-error);
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .search {
    position: relative;
    width: 220px;
    margin-inline-start: auto;

    :global(svg) {
      position: absolute;
      top: 50%;
      left: 10px;
      transform: translateY(-50%);
      color: oklch(from var(--color-text) l c h / 55%);
      pointer-events: none;
    }
    :global(input) {
      padding-inline-start: 34px;
    }
  }
  .sort {
    width: 130px;
  }
  main {
    overflow-y: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    align-items: start;
    gap: 16px;
    padding: 16px;

    & > :global(*) {
      min-height: auto;
      height: 100%;
    }
  }
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .empty {
    padding: 64px 0;
    text-align: center;
    font-size: 0.875rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .empty.full {
    grid-column: 1 / -1;
  }
  .sentinel {
    grid-column: 1 / -1;
    height: 1px;
  }
</style>
