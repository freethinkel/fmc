<script lang="ts">
  import { Avatar } from "$lib/shared/components/avatar";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { fileUrl } from "$lib/shared/api";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";
  import { WatchfaceCard } from "../components/watchface-card";

  interface Props {
    userId: string;
  }
  const { userId }: Props = $props();

  const { $user: user } = authModel;
  const {
    $profile: profile,
    $profileItems: profileItems,
    $profileLoading: profileLoading,
    $likes: likes,
    $marketErr: marketErr,
    profileLoadRequested,
    likeToggleRequested,
    showcaseRequested,
  } = marketModel;

  $effect(() => {
    profileLoadRequested(userId);
  });

  const name = $derived($profile?.name || "Creator");
  const avatar = $derived($profile?.avatar ? fileUrl($profile, "avatar") : undefined);
  const joined = $derived(
    $profile
      ? new Date($profile.created).toLocaleDateString(undefined, {
          year: "numeric",
          month: "long",
        })
      : "",
  );
  const likeCount = (id: string) => $likes.filter((l) => l.watchface === id).length;
  const myLike = (id: string) => $likes.find((l) => l.watchface === id && l.user === $user?.id);
  const totalLikes = $derived($profileItems.reduce((n, wf) => n + likeCount(wf.id), 0));
  const totalDownloads = $derived($profileItems.reduce((n, wf) => n + (wf.downloads || 0), 0));
</script>

<svelte:head><title>{name} — FMC Watchfaces</title></svelte:head>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <main>
    <header class="profile">
      {#if $profile}
        <Avatar {name} src={avatar} size={80} />
        <div class="identity">
          <h1>{name}</h1>
          <!-- ponytail: users has no `bio` field yet (see fmc_pocketbase migrations) — the
               line renders as soon as one exists, nothing else to change here -->
          {#if $profile.bio}<p class="bio">{$profile.bio}</p>{/if}
          <p class="meta">Joined {joined}</p>
          <dl class="stats">
            <div>
              <dt>Watchfaces</dt>
              <dd>{$profileItems.length}</dd>
            </div>
            <div>
              <dt>Likes</dt>
              <dd>{totalLikes}</dd>
            </div>
            <div>
              <dt>Downloads</dt>
              <dd>{totalDownloads}</dd>
            </div>
          </dl>
        </div>
      {:else if $profileLoading}
        <Skeleton height="5rem" width="5rem" />
        <div class="identity">
          <Skeleton height="1.5rem" width="10rem" />
          <Skeleton height="0.875rem" width="14rem" />
        </div>
      {/if}
    </header>

    {#if $profileLoading}
      <div class="grid">
        {#each Array(4) as _, i (i)}
          <div class="skeleton-card">
            <Skeleton height="8.75rem" />
            <Skeleton height="0.875rem" width="70%" />
          </div>
        {/each}
      </div>
    {:else}
      <div class="grid">
        {#each $profileItems as wf (wf.id)}
          <WatchfaceCard
            {wf}
            likeCount={likeCount(wf.id)}
            liked={!!myLike(wf.id)}
            canLike={!!$user}
            showAuthor={false}
            onOpen={() => showcaseRequested(wf)}
            onLike={() => $user && likeToggleRequested({ wf, userId: $user.id })}
          />
        {:else}
          <p class="empty">Nothing published yet.</p>
        {/each}
      </div>
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
  main {
    overflow-y: auto;
  }
  .profile {
    display: flex;
    align-items: flex-start;
    gap: 1.25rem;
    padding: 1.5rem 1rem;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .identity {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-family: var(--font-display);
    font-size: 1.5rem;
    font-weight: 400;
  }
  .bio {
    margin: 0;
    max-width: 40rem;
    font-size: 0.8125rem;
  }
  .meta {
    margin: 0;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .stats {
    display: flex;
    gap: 1.5rem;
    margin: 0.5rem 0 0;

    div {
      display: flex;
      flex-direction: column-reverse;
    }
    dt {
      font-size: 0.625rem;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      color: oklch(from var(--color-text) l c h / 55%);
    }
    dd {
      margin: 0;
      font-size: 1.125rem;
    }
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
    grid-column: 1 / -1;
    padding: 4rem 0;
    text-align: center;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
