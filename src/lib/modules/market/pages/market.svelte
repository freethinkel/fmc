<script lang="ts">
  import { Input } from "$lib/shared/components/ui/input";
  import * as Tabs from "$lib/shared/components/ui/tabs";
  import * as Select from "$lib/shared/components/ui/select";
  import { Search } from "@lucide/svelte";
  import type { RecordModel } from "pocketbase";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";
  import { WatchfaceCard } from "../components/watchface-card";

  const { $user: user } = authModel;
  const {
    $items: items,
    $likes: likes,
    $marketErr: marketErr,
    marketLoadRequested,
    likeToggleRequested,
    removeRequested,
    editRequested,
  } = marketModel;

  import { goto } from "$app/navigation";
  import { page } from "$app/state";

  marketLoadRequested();

  const TABS = ["nothing", "community"];

  const tabParam = page.url.searchParams.get("tab") ?? "";
  let tab = $state<string | undefined>(TABS.includes(tabParam) ? tabParam : "nothing");

  $effect(() => {
    const url = new URL(window.location.href);

    url.searchParams.set("tab", tab ?? "");
    goto(url, { replaceState: true, noScroll: true, keepFocus: true });
  });

  let query = $state("");
  let sort = $state("new"); // new | popular

  const likeCount = (id: string) => $likes.filter((l) => l.watchface === id).length;
  const myLike = (id: string) => $likes.find((l) => l.watchface === id && l.user === $user?.id);

  function remove(wf: RecordModel) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    removeRequested(wf);
  }

  const shown = $derived(
    $items
      // "From Nothing" — the whole catalog without an owner (both factory type=nothing
      // and cmf), grouped by category (see grouped below)
      .filter((wf) => (tab === "community" ? Boolean(wf.owner) : !wf.owner))
      .filter((wf) => wf.name.toLowerCase().includes(query.trim().toLowerCase()))
      .toSorted((a, b) =>
        sort === "popular"
          ? (b.downloads || 0) + likeCount(b.id) - (a.downloads || 0) - likeCount(a.id)
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
      if (e.isIntersecting) visibleCount = Math.min(visibleCount + PAGE, shown.length);
    });

    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

{#if $marketErr}<p class="px-4 pt-3 text-sm text-destructive lg:px-6">
    {$marketErr}
  </p>{/if}

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
      <Select.Trigger class="h-8 w-28 text-xs"
        >{sort === "new" ? "Newest" : "Popular"}</Select.Trigger
      >
      <Select.Content>
        <Select.Item value="new" label="Newest" />
        <Select.Item value="popular" label="Popular" />
      </Select.Content>
    </Select.Root>
  </div>

  {#if tab === "nothing"}
    <!-- sections by category, horizontal scroll within each — like on the watch itself -->
    <main class="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
      {#each grouped as [category, list] (category)}
        <section class="mb-6">
          <h2 class="mb-2 text-sm font-semibold">{category || "Other"}</h2>
          <div class="flex gap-3 overflow-x-auto pb-2 sm:gap-4">
            {#each list as wf (wf.id)}
              <div class="w-40 shrink-0 sm:w-48">
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
              </div>
            {/each}
          </div>
        </section>
      {:else}
        <p class="py-16 text-center text-sm text-muted-foreground">Nothing found.</p>
      {/each}
    </main>
  {:else}
    <main
      class="grid flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3 overflow-y-auto p-3 sm:grid-cols-[repeat(auto-fill,minmax(220px,1fr))] sm:gap-4 sm:p-4 lg:p-6"
    >
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
