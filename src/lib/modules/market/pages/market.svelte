<script lang="ts">
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { tick, untrack } from "svelte";
  import { SearchInput } from "$lib/shared/components/search-input";
  import { Select } from "$lib/shared/components/select";
  import { Tabs } from "$lib/shared/components/tabs";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";
  import { WatchfaceList } from "../components/watchface-list";
  import { CommunityPanel } from "../components/community-panel";
  import { DEVICES, matchesDevice } from "../lib/devices";

  const { $user: user } = authModel;
  const {
    $items: items,
    $myItems: myItems,
    $likes: likes,
    $marketErr: marketErr,
    $marketLoading: marketLoading,
    $myLoading: myLoading,
    $marketView: marketView,
    $topCreators: topCreators,
    marketViewPatched,
    marketLoadRequested,
    myLoadRequested,
  } = marketModel;

  marketLoadRequested();

  // one page, two shelves: everyone's published faces, or the signed-in user's own (drafts
  // included). The shelf is in the URL (?mine) so it survives a reload and can be linked.
  const mine = $derived(Boolean($user) && page.url.searchParams.has("mine"));
  const uid = $derived($user?.id);

  // a third page on the same route: not a shelf of faces but a panel of links (?community)
  const community = $derived(page.url.searchParams.has("community"));
  const tab = $derived(community ? "community" : mine ? "mine" : "all");

  $effect(() => {
    if (mine && uid) myLoadRequested(uid);
  });

  const SORT_OPTIONS = [
    // only creators over the thresholds in lib/top-creators — their faces, most downloaded first
    { value: "creators", label: "From top creators", short: "Top creators" },
    { value: "new", label: "Newest" },
    { value: "popular", label: "Popular" },
    { value: "downloads", label: "Most downloaded" },
  ];

  // "" — every watch. The shelf is mostly Watch 3 Pro faces right now, so a Watch Pro 2 owner
  // needs a way to see their own watch's faces without us moving or hiding anyone's work.
  const DEVICE_OPTIONS = [
    { value: "", label: "All devices" },
    ...DEVICES.map((d) => ({ value: d.value, label: d.label, short: d.short })),
  ];

  const likeCount = (id: string) => $likes.filter((l) => l.watchface === id).length;

  const shown = $derived(
    (mine ? $myItems : $items.filter((wf) => Boolean(wf.owner)))
      .filter((wf) => matchesDevice(wf.device, $marketView.device))
      .filter((wf) => wf.name.toLowerCase().includes($marketView.query.trim().toLowerCase()))
      .filter((wf) => $marketView.sort !== "creators" || $topCreators.has(wf.owner))
      .toSorted((a, b) =>
        $marketView.sort === "popular"
          ? likeCount(b.id) - likeCount(a.id)
          : $marketView.sort === "downloads" || $marketView.sort === "creators"
            ? (b.downloads || 0) - (a.downloads || 0)
            : b.created.localeCompare(a.created),
      ),
  );

  const PAGE = 60;

  let scroller = $state<HTMLElement | null>(null);
  let restoring = true;

  $effect(() => {
    if ((mine ? $myLoading : $marketLoading) || !visible.length || !scroller || !restoring) return;
    let cancelled = false;

    tick().then(() => {
      if (cancelled || !scroller) return;
      scroller.scrollTop = $marketView.scrollTop;
      restoring = false;
    });
    return () => {
      cancelled = true;
    };
  });

  $effect(() => {
    const shelf = mine;

    untrack(() => {
      if ($marketView.mine === shelf) return;
      marketViewPatched({ mine: shelf });
    });
  });

  $effect(() => {
    if (scroller && $marketView.scrollTop === 0) scroller.scrollTop = 0;
  });

  const visible = $derived(shown.slice(0, $marketView.visibleCount));
</script>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <div class="toolbar">
    <!-- shown to everyone: "Community" is for visitors too, only "Mine" needs an account.
         The label stays short: the bar is split evenly on a phone (below) and a longer name
         ("Join Community") clips to an ellipsis even on a Pro Max. -->
    <Tabs
      items={[
        { value: "all", label: "All" },
        ...($user ? [{ value: "mine", label: "Mine" }] : []),
        { value: "community", label: "Community" },
      ]}
      value={tab}
      onChange={(v) =>
        goto(v === "mine" ? "/?mine" : v === "community" ? "/?community" : "/", {
          replaceState: true,
        })}
    />
    <!-- search, device and sort filter faces — the links panel has none to filter -->
    {#if !community}
      <SearchInput bind:value={() => $marketView.query, (query) => marketViewPatched({ query })} />
      <div class="device">
        <Select
          value={$marketView.device}
          onChange={(device) => marketViewPatched({ device })}
          options={DEVICE_OPTIONS}
        />
      </div>
      <div class="sort">
        <Select
          value={$marketView.sort}
          onChange={(sort) => marketViewPatched({ sort })}
          options={SORT_OPTIONS}
        />
      </div>
    {/if}
  </div>

  <main
    bind:this={scroller}
    onscroll={() => {
      if (!restoring && scroller) marketViewPatched({ scrollTop: scroller.scrollTop });
    }}
  >
    {#if community}
      <CommunityPanel />
    {:else}
      <WatchfaceList
        items={visible}
        loading={mine ? $myLoading : $marketLoading}
        manage={mine}
        showAuthor={!mine}
        empty={mine
          ? "Nothing here yet — create a watchface in the editor and hit Save."
          : $marketView.sort === "creators"
            ? "No top creators yet."
            : "No community watchfaces yet — publish yours from the editor."}
        onMore={$marketView.visibleCount < shown.length
          ? () =>
              marketViewPatched({
                visibleCount: Math.min($marketView.visibleCount + PAGE, shown.length),
              })
          : undefined}
      />
    {/if}
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
  .device {
    width: 9.5rem;
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
        /* three 1rem labels split evenly on a 320px screen: the default 0.875rem side
           padding leaves "Community" an ellipsis */
        padding-inline: 0.375rem;
      }
    }
    /* two selects don't fit beside the search on a phone — the search takes its own row */
    .toolbar > :global(.search) {
      flex: 1 1 100%;
      width: auto;
      margin-inline-start: 0;
    }
    .device,
    .sort {
      flex: 1;
      width: auto;
    }
  }
  main {
    flex: 1;
    overflow-y: auto;
  }

  /* The tab bar is translucent glass on a phone (app-nav). The layout reserves a strip for it
     under the page, so nothing would ever scroll beneath it: stretch the page into that strip
     and pad the scroller by the same amount, so the last card still clears the bar. */
  @media (max-width: 767px) {
    .page {
      height: calc(100% + var(--nav-bar-height) + var(--safe-area-bottom));
      margin-block-end: calc(-1 * (var(--nav-bar-height) + var(--safe-area-bottom)));
    }
    main {
      padding-block-end: calc(var(--nav-bar-height) + var(--safe-area-bottom));
    }
  }
</style>
