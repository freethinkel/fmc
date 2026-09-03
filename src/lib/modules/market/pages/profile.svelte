<script lang="ts">
  import { Avatar } from "$lib/shared/components/avatar";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { fileUrl } from "$lib/shared/api";
  import { marketModel } from "../model";
  import { creatorTitle } from "$lib/shared/seo";
  import { WatchfaceList } from "../components/watchface-list";

  interface Props {
    userId: string;
  }
  const { userId }: Props = $props();

  const {
    $profile: profile,
    $profileItems: profileItems,
    $profileLoading: profileLoading,
    $likes: likes,
    $marketErr: marketErr,
    profileLoadRequested,
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
  const totalLikes = $derived($profileItems.reduce((n, wf) => n + likeCount(wf.id), 0));
  const totalDownloads = $derived($profileItems.reduce((n, wf) => n + (wf.downloads || 0), 0));
</script>

<svelte:head><title>{creatorTitle(name)}</title></svelte:head>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <main>
    <header class="profile">
      {#if $profile}
        <Avatar {name} src={avatar} />
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

    <WatchfaceList
      items={$profileItems}
      loading={$profileLoading}
      showAuthor={false}
      empty="Nothing published yet."
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
  main {
    overflow-y: auto;
  }
  .profile {
    display: flex;
    align-items: flex-start;
    gap: 1.25rem;
    padding: 1.5rem 1rem;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
    --avatar-size: 5rem;
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
    gap: 0.3rem;
    margin: 0.5rem 0 0;

    div {
      display: flex;
      flex-direction: column-reverse;
      border-radius: var(--border-radius);
      background: oklch(from var(--color-text) l c h / 10%);
      padding: 0.5rem 0.8rem;
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
</style>
