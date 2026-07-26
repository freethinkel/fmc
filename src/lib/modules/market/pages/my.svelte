<script lang="ts">
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Card } from "$lib/shared/components/card";
  import { Icon } from "$lib/shared/components/icon";
  import { fileUrl } from "$lib/shared/api";
  import type { RecordModel } from "pocketbase";
  import { goto } from "$app/navigation";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";

  const { $user: user } = authModel;
  const {
    $myItems: myItems,
    $likes: likes,
    $marketErr: marketErr,
    myLoadRequested,
    removeRequested,
    publishToggleRequested,
    editRequested,
  } = marketModel;

  // depend on the id, not the record: pb's startup authRefresh swaps in a fresh record object
  // with the same id, and re-firing the load made the SDK auto-cancel the first request
  const uid = $derived($user?.id);

  $effect(() => {
    if (uid) myLoadRequested(uid);
    else goto("/login");
  });

  const likeCount = (id: string) => $likes.filter((l) => l.watchface === id).length;

  function remove(wf: RecordModel) {
    if (!confirm(`Delete "${wf.name}"?`)) return;
    removeRequested(wf);
  }
</script>

<svelte:head><title>My watchfaces — FMC Watchfaces</title></svelte:head>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <main class="grid">
    {#each $myItems as wf (wf.id)}
      <Card>
        <div class="content">
          <button class="preview" onclick={() => editRequested(wf)} title="Open in editor">
            <img src={fileUrl(wf, "preview")} alt={wf.name} loading="lazy" />
          </button>
          <div class="title-row">
            <span class="name">{wf.name}</span>
            <Badge>{wf.published ? "Published" : "Draft"}</Badge>
          </div>
          <div class="actions">
            {#if wf.published}
              <span class="stats">
                <Icon name="heart" size={14} />
                {likeCount(wf.id)}
                <Icon name="download" size={14} />
                {wf.downloads || 0}
              </span>
            {/if}
            <div class="buttons">
              <span class="action-slot" title="Edit">
                <Button kind="ghost" onClick={() => editRequested(wf)}>
                  <Icon name="pencil" size={16} />
                </Button>
              </span>
              <span class="action-slot" title={wf.published ? "Unpublish" : "Publish"}>
                <Button kind="ghost" onClick={() => publishToggleRequested(wf)}>
                  {#if wf.published}<Icon name="globe-lock" size={16} />{:else}<Icon
                      name="globe"
                      size={16}
                    />{/if}
                </Button>
              </span>
              <span class="action-slot" title="Delete">
                <Button kind="ghost" onClick={() => remove(wf)}>
                  <Icon name="trash" size={16} color="var(--color-error)" />
                </Button>
              </span>
            </div>
          </div>
        </div>
      </Card>
    {:else}
      <p class="empty">Nothing here yet — create a watchface in the editor and hit Save.</p>
    {/each}
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
    padding: 12px 16px 0;
    font-size: 0.875rem;
    color: var(--color-error);
  }
  main {
    flex: 1;
    overflow-y: auto;
  }
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    align-items: start;
    gap: 16px;
    padding: 16px;
  }
  .content {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
  }
  .preview {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    padding: 0;
    border: none;
    overflow: hidden;
    cursor: pointer;
    border-radius: var(--border-radius);
    background: oklch(0 0 0);

    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
  .title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.875rem;
    font-weight: 500;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: auto;
  }
  .stats {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .buttons {
    display: inline-flex;
    align-items: center;
    margin-inline-start: auto;
  }
  .action-slot {
    display: inline-flex;
  }
  .empty {
    grid-column: 1 / -1;
    padding: 64px 0;
    text-align: center;
    font-size: 0.875rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
