<script lang="ts">
  import { Input } from "$lib/shared/components/input";
  import { Tabs } from "$lib/shared/components/tabs";
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

  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  marketLoadRequested();

  const TAB_ITEMS = [
    { value: "nothing", label: "From Nothing" },
    { value: "community", label: "Community" },
  ];
  const TABS = TAB_ITEMS.map((t) => t.value);

  const tabParam = page.url.searchParams.get("tab") ?? "";
  let tab = $state<string | undefined>(
    TABS.includes(tabParam) ? tabParam : "nothing",
  );

  $effect(() => {
    const url = new URL(window.location.href);

    url.searchParams.set("tab", tab ?? "");
    goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  });

  let query = $state("");
  let sort = $state("new"); // new | popular
  const SORT_OPTIONS = [
    { value: "new", label: "Newest" },
    { value: "popular", label: "Popular" },
  ];

  const likeCount = (id: string) =>
    $likes.filter((l) => l.watchface === id).length;
  const myLike = (id: string) =>
    $likes.find((l) => l.watchface === id && l.user === $user?.id);

  function remove(wf: RecordModel) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    removeRequested(wf);
  }

  const shown = $derived(
    $items
      // "From Nothing" — the whole catalog without an owner (both factory type=nothing
      // and cmf), grouped by category (see grouped below)
      .filter((wf) => (tab === "community" ? Boolean(wf.owner) : !wf.owner))
      .filter((wf) =>
        wf.name.toLowerCase().includes(query.trim().toLowerCase()),
      )
      .toSorted((a, b) =>
        sort === "popular"
          ? (b.downloads || 0) +
            likeCount(b.id) -
            (a.downloads || 0) -
            likeCount(a.id)
          : b.created.localeCompare(a.created),
      ),
  );

  // "From Nothing" — sections by category with horizontal scroll (like on the watch itself),
  // not a flat grid
  const grouped = $derived.by(() => {
    const byCat = new Map();

    for (const wf of shown) {
      const key = wf.description || "";

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
  /* oxlint-disable no-unused-expressions -- bare refs register these as $effect deps */
  $effect(() => {
    tab;
    query;
    sort;
    visibleCount = PAGE;
  });
  /* oxlint-enable no-unused-expressions */
  const visible = $derived(shown.slice(0, visibleCount));

  function loadMore(node: HTMLElement) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting)
        visibleCount = Math.min(visibleCount + PAGE, shown.length);
    });

    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <div class="toolbar">
    <Tabs
      items={TAB_ITEMS}
      value={tab ?? "nothing"}
      onChange={(v) => (tab = v)}
    />
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
  {:else if tab === "nothing"}
    <!-- sections by category, horizontal scroll within each — like on the watch itself -->
    <main class="sections">
      {#each grouped as [category, list] (category)}
        <section>
          <h2 class="category-title">{category || "Other"}</h2>
          <div class="h-scroll">
            {#each list as wf (wf.id)}
              <div class="h-item">
                <WatchfaceCard
                  {wf}
                  likeCount={likeCount(wf.id)}
                  liked={!!myLike(wf.id)}
                  canLike={!!$user}
                  canRemove={$user?.id === wf.owner}
                  onOpen={() => editRequested(wf)}
                  onLike={() =>
                    $user && likeToggleRequested({ wf, userId: $user.id })}
                  onRemove={() => remove(wf)}
                />
              </div>
            {/each}
          </div>
        </section>
      {:else}
        <p class="empty">Nothing found.</p>
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
        <p class="empty full">
          No community watchfaces yet — publish yours from the editor.
        </p>
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
      min-height: 275px;
      height: 100%;
    }
  }
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .sections {
    padding: 16px;
  }
  section {
    margin-bottom: 24px;
  }
  .category-title {
    font-size: 1.1rem;
    margin: 0 0 8px;
    font-weight: 600;
  }
  .h-scroll {
    display: flex;
    gap: 12px;
    overflow-x: auto;
    /* don't chain edge-overscroll into the browser back/forward swipe */
    overscroll-behavior-x: contain;
    padding-bottom: 8px;
  }
  .h-item {
    flex-shrink: 0;
    width: 190px;
    min-height: 275px;
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
