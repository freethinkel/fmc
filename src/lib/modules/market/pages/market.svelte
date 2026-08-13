<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { Icon } from "$lib/shared/components/icon";
  import type { RecordModel } from "pocketbase";
  import { page } from "$app/state";
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
    showcaseRequested,
  } = marketModel;

  marketLoadRequested();

  // ?creator=<user id> — where a showcase page's creator link lands, until creators get
  // profile pages of their own (issue #11)
  const creator = $derived(page.url.searchParams.get("creator"));
  const creatorName = $derived(
    $items.find((wf) => wf.owner === creator)?.expand?.owner?.name || "this creator",
  );

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
      .filter((wf) => !creator || wf.owner === creator)
      .filter((wf) => wf.name.toLowerCase().includes(query.trim().toLowerCase()))
      .toSorted((a, b) =>
        // popular = most liked; downloads used to be mixed in here, which just made this
        // a duplicate of "Most downloaded" (downloads dwarf likes). Ties keep the
        // newest-first order the api returns — toSorted is stable.
        sort === "popular"
          ? likeCount(b.id) - likeCount(a.id)
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
    creator;
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

  {#if creator}
    <p class="filter">
      Watchfaces by {creatorName}
      <a href="/market">Show all</a>
    </p>
  {/if}

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
          <Skeleton height="8.75rem" />
          <Skeleton height="0.875rem" width="70%" />
          <Skeleton height="0.75rem" width="40%" />
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
          onOpen={() => showcaseRequested(wf)}
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
    padding: 0.75rem 1rem 0;
    font-size: 0.75rem;
    color: var(--color-error);
  }
  .filter {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 0;
    padding: 0.75rem 1rem 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);

    a {
      color: var(--color-accent);
    }
  }
  .toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .search {
    position: relative;
    width: 13.75rem;
    margin-inline-start: auto;

    :global(svg) {
      position: absolute;
      top: 50%;
      left: 0.625rem;
      transform: translateY(-50%);
      color: oklch(from var(--color-text) l c h / 55%);
      pointer-events: none;
    }
    :global(input) {
      padding-inline-start: 2.125rem;
    }
  }
  .sort {
    width: 8.125rem;
  }
  main {
    overflow-y: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(11.875rem, 1fr));
    align-items: start;
    gap: 1rem;
    padding: 1rem;

    & > :global(*) {
      min-height: auto;
      height: 100%;
    }
  }
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .empty {
    padding: 4rem 0;
    text-align: center;
    font-size: 0.75rem;
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
