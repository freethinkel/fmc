<script lang="ts">
  import { Avatar } from "$lib/shared/components/avatar";
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { downloadUrl, fileUrl } from "$lib/shared/api";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const { $user: user } = authModel;
  const {
    $watchface: watchface,
    $watchfaceLoading: loading,
    $likes: likes,
    $marketErr: marketErr,
    watchfaceRequested,
    likeToggleRequested,
    editRequested,
  } = marketModel;

  $effect(() => {
    watchfaceRequested(id);
  });

  const wf = $derived($watchface);
  const owner = $derived(wf?.expand?.owner);
  const likeCount = $derived($likes.filter((l) => l.watchface === id).length);
  const liked = $derived($likes.some((l) => l.watchface === id && l.user === $user?.id));
  const day = (v: string) => new Date(v).toLocaleDateString();

  // ponytail: Web Share where it exists, clipboard everywhere else — no share-sheet dependency
  let copied = $state(false);

  async function share() {
    const url = location.href;

    if (navigator.share) {
      // a dismissed share sheet rejects — that's a cancel, not an error
      await navigator.share({ title: wf?.name, url }).catch(() => {});
      return;
    }
    await navigator.clipboard.writeText(url);
    copied = true;
  }
</script>

<svelte:head><title>{wf?.name || "Watchface"} — FMC Watchfaces</title></svelte:head>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <main>
    <!-- ponytail: no back-arrow glyph in the icon registry, and "←" needs no import -->
    <a class="back" href="/market">← Marketplace</a>

    {#if wf}
      <article class="face">
        <div class="preview">
          <img src={fileUrl(wf, "preview")} alt={wf.name} />
        </div>

        <div class="info">
          <div class="title-row">
            <h1 class="name">{wf.name}</h1>
            {#if wf.type}<Badge>{wf.type}</Badge>{/if}
          </div>

          {#if owner}
            <a class="creator" href="/market?creator={wf.owner}" title="Watchfaces by this creator">
              <Avatar name={owner.name || "?"} size={36} />
              <span class="creator-text">
                <span class="creator-name">{owner.name || "Unknown"}</span>
                <span class="creator-hint">See all their watchfaces</span>
              </span>
            </a>
          {/if}

          {#if wf.description}
            <p class="desc">{wf.description}</p>
          {:else}
            <p class="desc muted">No description.</p>
          {/if}

          <dl class="stats">
            <div>
              <dt>Likes</dt>
              <dd>{likeCount}</dd>
            </div>
            <div>
              <dt>Downloads</dt>
              <dd>{wf.downloads || 0}</dd>
            </div>
            <div>
              <dt>Flashed</dt>
              <dd>{wf.flashes || 0}</dd>
            </div>
            <div>
              <dt>Published</dt>
              <dd>{day(wf.created)}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{day(wf.updated)}</dd>
            </div>
          </dl>

          <div class="actions">
            <Button onClick={() => editRequested(wf)}>
              <Icon name="pencil" size={16} />
              Open in editor
            </Button>
            <a class="link-action" href={downloadUrl(wf)}>
              <Icon name="download" size={16} />
              Download .bin
            </a>
            <span class="action-slot" title={$user ? "Like" : "Sign in to like"}>
              <Button
                kind="secondary"
                disabled={!$user}
                onClick={() => $user && likeToggleRequested({ wf, userId: $user.id })}
              >
                <Icon
                  name="heart"
                  size={16}
                  color={liked ? "var(--color-error)" : undefined}
                  fill={liked ? "var(--color-error)" : "none"}
                />
                {likeCount}
              </Button>
            </span>
            <Button kind="secondary" onClick={share}>
              <Icon name="link" size={16} />
              {copied ? "Link copied" : "Share"}
            </Button>
          </div>
        </div>
      </article>
    {:else if $loading}
      <div class="face">
        <Skeleton height="17.5rem" />
        <div class="info">
          <Skeleton height="1.75rem" width="60%" />
          <Skeleton height="2.25rem" width="40%" />
          <Skeleton height="3rem" />
        </div>
      </div>
    {:else}
      <p class="empty">Watchface not found.</p>
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
    flex: 1;
    overflow-y: auto;
    /* the extra bottom padding keeps the action row clear of the mobile tab bar */
    padding: 1rem 1rem 2rem;
  }
  .back {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
    text-decoration: none;

    &:hover {
      color: var(--color-text);
    }
  }
  .face {
    display: grid;
    grid-template-columns: minmax(0, 20rem) minmax(0, 1fr);
    align-items: start;
    gap: 2rem;
    max-width: 56rem;
    margin: 1rem auto 0;
  }
  .preview {
    aspect-ratio: 1 / 1;
    overflow: hidden;
    border-radius: 625rem;
    background: oklch(0 0 0);

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  .info {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
  }
  .name {
    margin: 0;
    font-family: var(--font-display);
    font-size: 2rem;
    font-weight: 400;
  }
  .creator {
    display: inline-flex;
    align-items: center;
    gap: 0.625rem;
    align-self: flex-start;
    padding: 0.375rem 0.75rem 0.375rem 0.375rem;
    border-radius: var(--border-radius);
    color: var(--color-text);
    text-decoration: none;
    background: oklch(from var(--color-text) l c h / 6%);

    &:hover {
      background: oklch(from var(--color-text) l c h / 12%);
    }
  }
  .creator-text {
    display: flex;
    flex-direction: column;
  }
  .creator-name {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .creator-hint {
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .desc {
    margin: 0;
    white-space: pre-wrap;
    font-size: 0.875rem;
  }
  .muted {
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(6rem, 1fr));
    gap: 0.75rem;
    margin: 0;
    padding: 0.75rem 0;
    border-top: 1px solid oklch(from var(--color-text) l c h / 12%);
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 12%);

    dt {
      font-size: 0.625rem;
      color: oklch(from var(--color-text) l c h / 55%);
    }
    dd {
      margin: 0;
      font-size: 0.875rem;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
  }
  .action-slot {
    display: inline-flex;
  }
  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 1.875rem;
    padding: 0 0.625rem;
    border-radius: var(--border-radius);
    color: var(--color-text);
    background-color: oklch(from var(--color-text) l c h / 12%);
    text-decoration: none;
    font-size: 0.75rem;
    font-weight: 500;
    transition: background-color 0.15s ease;

    &:hover {
      background-color: oklch(from var(--color-text) l c h / 20%);
    }
  }
  .empty {
    padding: 4rem 0;
    text-align: center;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  @media (max-width: 767px) {
    .face {
      grid-template-columns: minmax(0, 1fr);
      gap: 1.25rem;
    }
    .preview {
      max-width: 15rem;
      margin-inline: auto;
    }
  }
</style>
