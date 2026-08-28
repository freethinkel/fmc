<script lang="ts">
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { authModel } from "$lib/modules/auth/model";
  import type { RecordModel } from "pocketbase";
  import { marketModel } from "../../model";
  import { WatchfaceCard } from "../watchface-card";

  interface Props {
    items: RecordModel[];
    loading?: boolean;
    empty?: string;
    showAuthor?: boolean;
    manage?: boolean;
    onMore?: () => void;
  }

  const {
    items,
    loading = false,
    empty = "Nothing here yet.",
    showAuthor = true,
    manage = false,
    onMore,
  }: Props = $props();

  const { $user: user } = authModel;
  const {
    $likes: likes,
    likeToggleRequested,
    removeRequested,
    publishToggleRequested,
    editRequested,
    showcaseRequested,
  } = marketModel;

  const likeCount = (id: string) => $likes.filter((l) => l.watchface === id).length;
  const liked = (id: string) => $likes.some((l) => l.watchface === id && l.user === $user?.id);

  function remove(wf: RecordModel) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    removeRequested(wf);
  }

  function sentinel(node: HTMLElement) {
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) onMore?.();
    });

    io.observe(node);
    return { destroy: () => io.disconnect() };
  }
</script>

<div class="grid">
  {#if loading}
    {#each Array(8) as _, i (i)}
      <div class="skeleton-card">
        <Skeleton height="8.75rem" />
        <Skeleton height="0.875rem" width="70%" />
        <Skeleton height="0.75rem" width="40%" />
      </div>
    {/each}
  {:else}
    {#each items as wf (wf.id)}
      <WatchfaceCard
        {wf}
        {showAuthor}
        {manage}
        likeCount={likeCount(wf.id)}
        liked={liked(wf.id)}
        canLike={!!$user}
        canRemove={manage || $user?.id === wf.owner}
        onOpen={() => showcaseRequested(wf)}
        onLike={() => $user && likeToggleRequested({ wf, userId: $user.id })}
        onRemove={() => remove(wf)}
        onEdit={() => editRequested(wf)}
        onPublishToggle={() => publishToggleRequested(wf)}
      />
    {:else}
      <p class="empty">{empty}</p>
    {/each}
    {#if onMore}<div class="sentinel" use:sentinel></div>{/if}
  {/if}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
    align-items: start;
    gap: 1rem;
    padding: 1rem;

    & > :global(*) {
      aspect-ratio: 1;
    }

    @media (max-width: 767px) {
      gap: 0.5rem;
      padding: 0.5rem;
    }
  }
  .skeleton-card {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .empty {
    grid-column: 1 / -1;
    padding: 4rem 0;
    text-align: center;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .sentinel {
    grid-column: 1 / -1;
    height: 1px;
  }
</style>
