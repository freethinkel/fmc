<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Select } from "$lib/shared/components/select";
  import { Icon } from "$lib/shared/components/icon";
  import { marketModel } from "../model";
  import { WatchfaceList } from "../components/watchface-list";

  const {
    $items: items,
    $likes: likes,
    $marketErr: marketErr,
    $marketLoading: marketLoading,
    marketLoadRequested,
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

  const shown = $derived(
    $items
      .filter((wf) => Boolean(wf.owner))
      .filter((wf) => wf.name.toLowerCase().includes(query.trim().toLowerCase()))
      .toSorted((a, b) =>
        sort === "popular"
          ? likeCount(b.id) - likeCount(a.id)
          : sort === "downloads"
            ? (b.downloads || 0) - (a.downloads || 0)
            : b.created.localeCompare(a.created),
      ),
  );

  const PAGE = 60;
  let visibleCount = $state(PAGE);

  /* oxlint-disable no-unused-expressions -- bare refs register these as $effect deps */
  $effect(() => {
    query;
    sort;
    visibleCount = PAGE;
  });

  const visible = $derived(shown.slice(0, visibleCount));
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

  <main>
    <WatchfaceList
      items={visible}
      loading={$marketLoading}
      empty="No community watchfaces yet — publish yours from the editor."
      onMore={visibleCount < shown.length
        ? () => (visibleCount = Math.min(visibleCount + PAGE, shown.length))
        : undefined}
    />
  </main>
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

  @media (max-width: 767px) {
    .toolbar {
      flex-wrap: nowrap;
      gap: 0.5rem;
      padding: 0.5rem;
    }
    .search {
      flex: 1;
      width: auto;
      margin-inline-start: 0;
    }
    .sort {
      width: 7.5rem;
      flex: none;
    }
  }
  main {
    flex: 1;
    overflow-y: auto;
  }
</style>
