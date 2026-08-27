<script lang="ts">
  // One watchface on its own page: everything the market card shows, plus the one thing that
  // used to require a detour through the editor — installing it on the watch.
  import { Avatar } from "$lib/shared/components/avatar";
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { downloadUrl, fileUrl } from "$lib/shared/api";
  import { authModel } from "$lib/modules/auth/model";
  import { bleModel } from "$lib/modules/device/model";
  import { marketModel } from "../model";
  import { LiveDial } from "../components/live-dial";
  import { BackBtn } from "$lib/shared/components/back-btn";
  import { List, ListItem } from "$lib/shared/components/list";

  interface Props {
    id: string;
  }
  const { id }: Props = $props();

  const { $user: user } = authModel;
  const {
    $watchface: watchface,
    $watchfaceLoading: loading,
    $live: live,
    $dialScreen: dialScreen,
    $hasAod: hasAod,
    $installing: installing,
    $installed: installed,
    $likes: likes,
    $marketErr: marketErr,
    watchfaceRequested,
    installRequested,
    likeToggleRequested,
    editRequested,
    dialScreenSet,
  } = marketModel;
  const {
    $bleInfo: bleInfo,
    $bleStatus: bleStatus,
    $connecting: connecting,
    connectRequested,
  } = bleModel;

  $effect(() => {
    watchfaceRequested(id);
  });

  const wf = $derived($watchface);
  const owner = $derived(wf?.expand?.owner);
  const likeCount = $derived($likes.filter((l) => l.watchface === id).length);
  const liked = $derived(
    $likes.some((l) => l.watchface === id && l.user === $user?.id),
  );
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

<svelte:head
  ><title>{wf?.name || "Watchface"} — FMC Watchfaces</title></svelte:head
>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <main>
    <BackBtn href="/" />

    {#if wf}
      <article class="face">
        <div class="dial">
          <div class="preview">
            {#if $live}
              <LiveDial face={$live} screen={$dialScreen} />
            {:else}
              <img src={fileUrl(wf, "preview")} alt={wf.name} />
            {/if}
          </div>

          {#if $hasAod}
            <Button
              kind="secondary"
              onClick={() =>
                dialScreenSet($dialScreen === "aod" ? "main" : "aod")}
            >
              <Icon
                name={$dialScreen === "aod" ? "monitor" : "dark_mode"}
                size={22}
              />
              {$dialScreen === "aod" ? "Show normal" : "Show always-on"}
            </Button>
          {/if}
        </div>

        <div class="info">
          <div class="title-row">
            <h1 class="name">{wf.name}</h1>
            {#if wf.type}<Badge>{wf.type}</Badge>{/if}
          </div>

          {#if wf.description}
            <p class="desc">{wf.description}</p>
          {:else}
            <p class="desc muted">No description.</p>
          {/if}

          <div class="actions">
            {#if !$bleInfo}
              <Button onClick={() => connectRequested()} disabled={$connecting}>
                {$connecting ? "Connecting…" : "Connect watch"}
                <Icon name="bluetooth" size={22} />
              </Button>
            {:else if $installed}
              <Button disabled>
                <Icon name="check" size={22} /> Installed
              </Button>
              <Button
                kind="secondary"
                onClick={() => installRequested(wf)}
                disabled={$installing}
              >
                Install again
              </Button>
            {:else}
              <Button
                onClick={() => installRequested(wf)}
                disabled={$installing}
              >
                {$installing ? "Installing…" : "Install watchface"}
                <Icon name="watch" size={22} />
              </Button>
            {/if}

            <Button kind="secondary" onClick={share}>
              {copied ? "Link copied" : "Share"}
              <Icon name="link" size={22} />
            </Button>
          </div>

          <List>
            {#if owner}
              <ListItem clickable>
                <a
                  class="list-item"
                  href="/user/{wf.owner}"
                  title="Watchfaces by this creator"
                >
                  <div class="list-key">Author</div>
                  <div class="list-value">
                    <span class="creator-name">
                      {owner.name || "Unknown"}
                    </span>
                    <Avatar name={owner.name || "?"} />
                  </div>
                </a>
              </ListItem>
            {/if}
            <ListItem>
              <div class="list-item">
                <div class="list-key">Likes</div>
                <div class="list-value">{likeCount}</div>
              </div>
            </ListItem>
            <ListItem>
              <div class="list-item">
                <div class="list-key">Downloads</div>
                <div class="list-value">{wf.downloads || 0}</div>
              </div>
            </ListItem>
            <ListItem>
              <div class="list-item">
                <div class="list-key">Flashed</div>
                <div class="list-value">{wf.flashes || 0}</div>
              </div>
            </ListItem>
            <ListItem>
              <div class="list-item">
                <div class="list-key">Published</div>
                <div class="list-value">{day(wf.created)}</div>
              </div>
            </ListItem>

            <ListItem>
              <div class="list-item">
                <div class="list-key">Updated</div>
                <div class="list-value">{day(wf.updated)}</div>
              </div>
            </ListItem>
          </List>

          <div class="actions">
            <Button onClick={() => editRequested(wf)}>
              Open in editor
              <Icon name="edit" size={22} />
            </Button>
            <Button kind="secondary" href={downloadUrl(wf)}>
              Download .bin
              <Icon name="download" size={22} />
            </Button>

            <Button
              class="actions--small-btn"
              kind="secondary"
              disabled={!$user}
              onClick={() =>
                $user && likeToggleRequested({ wf, userId: $user.id })}
            >
              {likeCount}
              <Icon
                name="favorite"
                size={22}
                color={liked ? "var(--color-error)" : undefined}
                fill={liked}
              />
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
    padding: 1rem 1rem 2rem;
  }
  .face {
    max-width: 500px;
    width: 50%;
    margin: 0 auto;
    min-width: 390px;
  }
  .dial {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
  }
  .preview {
    width: 20rem;
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
  }

  .list-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    text-decoration: none;
    color: var(--color-text);
    height: 100%;
    min-height: 100%;
    width: 100%;
  }

  .list-key {
    font-weight: bold;
  }

  .list-value {
    font-size: 0.9rem;
    color: oklch(var(--color-text) l c h / 60%);
  }

  .creator-name {
    font-size: 0.875rem;
    font-weight: 500;
  }
  .desc {
    margin: 0;
    white-space: pre-wrap;
    font-size: 0.875rem;
  }
  .muted {
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .status {
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;

    & :global(.actions--small-btn) {
      flex: 0 0 min-content;
    }

    & > :global(*) {
      flex: 1;
      min-width: 0;

      &:has(:global(.icon)) {
        justify-content: space-between;
      }
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
