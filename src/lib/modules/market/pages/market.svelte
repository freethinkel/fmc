<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { SearchInput } from "$lib/shared/components/search-input";
  import { Select } from "$lib/shared/components/select";
  import { Tabs } from "$lib/shared/components/tabs";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";
  import { WatchfaceList } from "../components/watchface-list";

  const { $user: user } = authModel;
  const {
    $items: items,
    $myItems: myItems,
    $likes: likes,
    $marketErr: marketErr,
    $marketLoading: marketLoading,
    $myLoading: myLoading,
    marketLoadRequested,
    myLoadRequested,
  } = marketModel;

  marketLoadRequested();

  // one page, two shelves: everyone's published faces, or the signed-in user's own (drafts
  // included). The shelf is in the URL (?mine) so it survives a reload and can be linked.
  const mine = $derived(Boolean($user) && page.url.searchParams.has("mine"));
  const uid = $derived($user?.id);

  $effect(() => {
    if (mine && uid) myLoadRequested(uid);
  });

  let query = $state("");
  let sort = $state("new"); // new | popular | downloads
  const SORT_OPTIONS = [
    { value: "new", label: "Newest" },
    { value: "popular", label: "Popular" },
    { value: "downloads", label: "Most downloaded" },
  ];

  const likeCount = (id: string) => $likes.filter((l) => l.watchface === id).length;

  const shown = $derived(
    (mine ? $myItems : $items.filter((wf) => Boolean(wf.owner)))
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
    mine;
    visibleCount = PAGE;
  });

  const visible = $derived(shown.slice(0, visibleCount));
</script>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <div class="toolbar">
    {#if $user}
      <Tabs
        items={[
          { value: "all", label: "All" },
          { value: "mine", label: "Mine" },
        ]}
        value={mine ? "mine" : "all"}
        onChange={(v) => goto(v === "mine" ? "/?mine" : "/", { replaceState: true })}
      />
    {/if}
    <SearchInput bind:value={query} />
    <div class="sort">
      <Select bind:value={sort} options={SORT_OPTIONS} />
    </div>
  </div>

  <main>
    <WatchfaceList
      items={visible}
      loading={mine ? $myLoading : $marketLoading}
      manage={mine}
      showAuthor={!mine}
      empty={mine
        ? "Nothing here yet — create a watchface in the editor and hit Save."
        : "No community watchfaces yet — publish yours from the editor."}
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
  .toolbar > :global(.search) {
    width: 13.75rem;
    margin-inline-start: auto;
  }
  .sort {
    width: 8.125rem;
  }

  @media (max-width: 767px) {
    .toolbar {
      gap: 0.5rem;
      padding: 0.5rem;
    }
    .toolbar > :global(.tabs) {
      width: 100%;

      :global(button) {
        flex: 1;
      }
    }
    .toolbar > :global(.search) {
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
