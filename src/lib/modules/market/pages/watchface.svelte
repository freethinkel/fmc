<script lang="ts">
  // One watchface on its own page: everything the market card shows, plus the one thing that
  // used to require a detour through the editor — installing it on the watch.
  import { page } from "$app/state";
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Icon } from "$lib/shared/components/icon";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { fileUrl, downloadUrl } from "$lib/shared/api";
  import { authModel } from "$lib/modules/auth/model";
  import { bleModel } from "$lib/modules/device/model";
  import { marketModel } from "../model";
  import { LiveDial } from "../components/live-dial";

  const { $user: user } = authModel;
  const {
    $wf: wf,
    $wfLoading: wfLoading,
    $live: live,
    $installing: installing,
    $installed: installed,
    $likes: likes,
    $marketErr: marketErr,
    wfLoadRequested,
    marketLoadRequested,
    installRequested,
    editRequested,
    likeToggleRequested,
  } = marketModel;
  const {
    $bleInfo: bleInfo,
    $bleStatus: bleStatus,
    $connecting: connecting,
    connectRequested,
  } = bleModel;

  const id = $derived(page.params.id);

  $effect(() => {
    if (id) wfLoadRequested(id);
  });
  // likes live in the catalog load — a deep link never went through /market
  marketLoadRequested();

  const likeCount = $derived($likes.filter((l) => l.watchface === id).length);
  const liked = $derived($likes.some((l) => l.watchface === id && l.user === $user?.id));
</script>

<svelte:head><title>{$wf?.name || "Watchface"} — FMC Watchfaces</title></svelte:head>

<div class="page">
  <a class="back" href="/market">← Market</a>

  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  {#if $wf}
    <div class="wrap">
      <div class="preview">
        <!-- the still preview holds the spot until the file is parsed, and stays if it can't be -->
        {#if $live}
          <LiveDial face={$live} />
        {:else}
          <img src={fileUrl($wf, "preview")} alt={$wf.name} />
        {/if}
      </div>

      <div class="info">
        <div class="title-row">
          <h1>{$wf.name}</h1>
          {#if $wf.type}<Badge>{$wf.type}</Badge>{/if}
        </div>
        <span class="author">by {$wf.expand?.owner?.name || "—"}</span>

        {#if $wf.description}<p class="desc">{$wf.description}</p>{/if}

        <div class="cta">
          {#if !$bleInfo}
            <Button onClick={() => connectRequested()} disabled={$connecting}>
              <Icon name="bluetooth" size={16} />
              {$connecting ? "Connecting…" : "Connect watch"}
            </Button>
          {:else if $installed}
            <Button disabled>
              <Icon name="check" size={16} /> Installed
            </Button>
            <Button kind="secondary" onClick={() => installRequested($wf)} disabled={$installing}>
              Install again
            </Button>
          {:else}
            <Button onClick={() => installRequested($wf)} disabled={$installing}>
              <Icon name="watch" size={16} />
              {$installing ? "Installing…" : "Install watchface"}
            </Button>
          {/if}
        </div>
        {#if $bleStatus}<span class="status">{$bleStatus}</span>{/if}

        <div class="actions">
          <span class="action-slot" title={$user ? "Like" : "Sign in to like"}>
            <Button
              kind="ghost"
              disabled={!$user}
              onClick={() => $user && $wf && likeToggleRequested({ wf: $wf, userId: $user.id })}
            >
              <Icon
                name="heart"
                size={16}
                color={liked ? "var(--color-error)" : undefined}
                fill={liked ? "var(--color-error)" : "none"}
              />
              <span class="count">{likeCount}</span>
            </Button>
          </span>
          <a class="link-action" href={downloadUrl($wf)} title="Download .bin">
            <Icon name="download" size={16} />
            <span class="count">{$wf.downloads || 0}</span>
          </a>
          <span class="action-slot" title="Open in editor">
            <Button kind="ghost" onClick={() => $wf && editRequested($wf)}>
              <Icon name="pencil" size={16} />
              Edit
            </Button>
          </span>
        </div>
      </div>
    </div>
  {:else if $wfLoading}
    <div class="wrap">
      <Skeleton height="16rem" />
      <div class="info">
        <Skeleton height="1.5rem" width="60%" />
        <Skeleton height="0.875rem" width="30%" />
      </div>
    </div>
  {/if}
</div>

<style>
  .page {
    height: 100%;
    overflow-y: auto;
    padding: 1rem;
  }
  .back {
    display: inline-block;
    margin-bottom: 1rem;
    font-size: 0.75rem;
    text-decoration: none;
    color: oklch(from var(--color-text) l c h / 55%);

    &:hover {
      color: var(--color-text);
    }
  }
  .error {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    color: var(--color-error);
  }
  .wrap {
    display: grid;
    grid-template-columns: minmax(0, 18rem) minmax(0, 1fr);
    align-items: start;
    gap: 2rem;
    max-width: 48rem;
    margin: 0 auto;
  }
  .preview {
    width: 100%;
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
    gap: 0.5rem;
  }
  .title-row {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;

    h1 {
      margin: 0;
      font-size: 1.5rem;
    }
  }
  .author {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .desc {
    margin: 0.5rem 0;
    font-size: 0.875rem;
  }
  .cta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.5rem;
  }
  .status {
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    border-top: 1px solid oklch(from var(--color-text) l c h / 12%);
    padding-top: 0.75rem;
  }
  .action-slot {
    display: inline-flex;
  }
  .count {
    font-size: 0.625rem;
  }
  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    height: 1.875rem;
    padding: 0 0.625rem;
    border-radius: var(--border-radius);
    color: var(--color-text);
    text-decoration: none;
    font-size: 0.75rem;

    &:hover {
      background-color: oklch(from var(--color-text) l c h / 20%);
    }
  }
  @media (max-width: 767px) {
    .wrap {
      grid-template-columns: minmax(0, 1fr);
      gap: 1.25rem;
    }
    .preview {
      max-width: 14rem;
      margin: 0 auto;
    }
    /* one full-width row per button — a 30px pill floating in a phone-wide column reads as
       a secondary link, not as the thing the page is for */
    .cta :global(button) {
      flex: 1 1 100%;
      height: 2.25rem;
    }
  }
</style>
