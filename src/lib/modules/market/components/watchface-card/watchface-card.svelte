<script lang="ts">
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Card } from "$lib/shared/components/card";
  import { Icon } from "$lib/shared/components/icon";
  import { fileUrl, downloadUrl } from "$lib/shared/api";
  import type { RecordModel } from "pocketbase";

  interface Props {
    wf: RecordModel;
    likeCount?: number;
    liked?: boolean;
    canLike?: boolean;
    canRemove?: boolean;
    // off on a creator's own profile page, where every card would repeat the same name
    showAuthor?: boolean;
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
    showAuthor = true,
    onOpen,
    onLike,
    onRemove,
  }: Props = $props();

  // the whole card is a click target (onOpen) — every action inside it has to keep its click
  const stop = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn?.();
  };
</script>

<Card onClick={onOpen}>
  <div class="content">
    <div class="preview" title="Open">
      <img src={fileUrl(wf, "preview")} alt={wf.name} loading="lazy" />
    </div>
    <div class="title-row">
      <h3 class="name">{wf.name}</h3>
      {#if wf.type}<Badge>{wf.type}</Badge>{/if}
    </div>
    {#if wf.owner && showAuthor}
      <!-- nested in the card's <button>, like the download link below — the click has to be
           kept from opening the editor -->
      <a class="author" href="/user/{wf.owner}" onclick={(e) => e.stopPropagation()}>
        by {wf.expand?.owner?.name || "—"}
      </a>
    {/if}
    {#if wf.description}
      <p class="desc">{wf.description}</p>
    {/if}
    <div class="actions">
      <span class="action-slot" title={canLike ? "Like" : "Sign in to like"}>
        <Button kind="ghost" disabled={!canLike} onClick={stop(onLike)}>
          <Icon
            name="heart"
            size={16}
            color={liked ? "var(--color-error)" : undefined}
            fill={liked ? "var(--color-error)" : "none"}
          />
          <span class="count">{likeCount}</span>
        </Button>
      </span>
      <a
        class="link-action"
        href={downloadUrl(wf)}
        title="Download .bin"
        onclick={(e) => e.stopPropagation()}
      >
        <Icon name="download" size={16} />
        <span class="count">{wf.downloads || 0}</span>
      </a>
      {#if canRemove}
        <span class="action-slot remove-slot" title="Delete">
          <Button kind="ghost" onClick={stop(onRemove)}>
            <Icon name="trash" size={16} color="var(--color-error)" />
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
    gap: 0.25rem;
    height: 100%;
  }
  .preview {
    display: block;
    width: 100%;
    aspect-ratio: 1 / 1;
    /* flex item in a height-constrained column: without this the circle squashes into a pill */
    flex-shrink: 0;
    padding: 0;
    border: none;
    overflow: hidden;
    cursor: pointer;
    border-radius: 625rem;
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
    gap: 0.5rem;
  }
  .name {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.125rem;
  }
  .author {
    align-self: flex-start;
    font-size: 0.625rem;
    text-decoration: none;
    color: oklch(from var(--color-text) l c h / 55%);

    &:hover {
      color: var(--color-accent);
    }
  }
  .desc {
    margin: 0;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.625rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: auto;
  }
  .action-slot {
    display: inline-flex;
  }
  .remove-slot {
    margin-inline-start: auto;
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
    transition: background-color 0.15s ease;

    &:hover {
      background-color: oklch(from var(--color-text) l c h / 20%);
    }
  }
</style>
