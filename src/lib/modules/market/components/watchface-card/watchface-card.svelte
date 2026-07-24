<script lang="ts">
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Card } from "$lib/shared/components/card";
  import Heart from "@lucide/svelte/icons/heart";
  import Download from "@lucide/svelte/icons/download";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import { fileUrl, downloadUrl } from "$lib/shared/api";
  import type { RecordModel } from "pocketbase";

  interface Props {
    wf: RecordModel;
    likeCount?: number;
    liked?: boolean;
    canLike?: boolean;
    canRemove?: boolean;
    onOpen?: () => void;
    onLike?: () => void;
    onRemove?: () => void;
  }

  let {
    wf,
    likeCount = 0,
    liked = false,
    canLike = false,
    canRemove = false,
    onOpen,
    onLike,
    onRemove,
  }: Props = $props();
</script>

<Card>
  <div class="content">
    <button class="preview" onclick={onOpen} title="Open in editor">
      <img src={fileUrl(wf, "preview")} alt={wf.name} loading="lazy" />
    </button>
    <div class="title-row">
      <span class="name">{wf.name}</span>
      {#if wf.type}<Badge>{wf.type}</Badge>{/if}
    </div>
    {#if wf.owner}
      <span class="author">by {wf.expand?.owner?.name || "—"}</span>
    {/if}
    {#if wf.description}
      <p class="desc">{wf.description}</p>
    {/if}
    <div class="actions">
      <span class="action-slot" title={canLike ? "Like" : "Sign in to like"}>
        <Button kind="ghost" size="sm" disabled={!canLike} onClick={onLike}>
          <Heart
            size={16}
            color={liked ? "var(--color-error)" : undefined}
            fill={liked ? "var(--color-error)" : "none"}
          />
          <span class="count">{likeCount}</span>
        </Button>
      </span>
      <a class="link-action" href={downloadUrl(wf)} title="Download .bin">
        <Download size={16} />
        <span class="count">{wf.downloads || 0}</span>
      </a>
      {#if canRemove}
        <span class="action-slot remove-slot" title="Delete">
          <Button kind="ghost" size="sm" onClick={onRemove}>
            <Trash2 size={16} color="var(--color-error)" />
          </Button>
        </span>
      {/if}
    </div>
  </div>
</Card>

<style>
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
    align-items: baseline;
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
  .author {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .desc {
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: auto;
  }
  .action-slot {
    display: inline-flex;
  }
  .remove-slot {
    margin-inline-start: auto;
  }
  .count {
    font-size: 0.75rem;
  }
  .link-action {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 30px;
    padding: 0 10px;
    border-radius: var(--border-radius);
    color: var(--color-text);
    text-decoration: none;
    font-size: 0.85rem;
    transition: background-color 0.15s ease;

    &:hover {
      background-color: oklch(from var(--color-text) l c h / 20%);
    }
  }
</style>
