<script lang="ts">
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Card } from "$lib/shared/components/card";
  import { Icon } from "$lib/shared/components/icon";
  import { Menu, MenuItem } from "$lib/shared/components/menu";
  import { fileUrl, downloadUrl } from "$lib/shared/api";
  import type { RecordModel } from "pocketbase";

  interface Props {
    wf: RecordModel;
    likeCount?: number;
    liked?: boolean;
    canLike?: boolean;
    canRemove?: boolean;
    showAuthor?: boolean;
    manage?: boolean;
    onOpen?: () => void;
    onLike?: () => void;
    onRemove?: () => void;
    onEdit?: () => void;
    onPublishToggle?: () => void;
  }

  let {
    wf,
    likeCount = 0,
    liked = false,
    canLike = false,
    canRemove = false,
    showAuthor = true,
    manage = false,
    onOpen,
    onLike,
    onRemove,
    onEdit,
    onPublishToggle,
  }: Props = $props();

  const stop = (fn?: () => void) => (e: MouseEvent) => {
    e.stopPropagation();
    fn?.();
  };
</script>

<Card onClick={onOpen}>
  <div class="content">
    <h3 class="name">{wf.name}</h3>
    <div class="preview" title="Open">
      <img src={fileUrl(wf, "preview")} alt={wf.name} loading="lazy" />
    </div>
    <div class="title-row">
      {#if manage}
        <Badge>{wf.published ? "Published" : "Draft"}</Badge>
      {:else if wf.type}
        <Badge>{wf.type}</Badge>
      {/if}
    </div>
    {#if wf.owner && showAuthor}
      <a
        class="author"
        href="/user/{wf.owner}"
        onclick={(e) => e.stopPropagation()}
      >
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
      <span class="downloads" title="Downloads">
        <Icon name="download" size={14} />
        <span class="count">{wf.downloads || 0}</span>
      </span>
      {#if manage || canRemove}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span class="menu-slot" onclick={(e) => e.stopPropagation()}>
          <Menu>
            {#snippet trigger({ toggle })}
              <span class="action-slot" title="More">
                <Button kind="ghost" onClick={toggle}>
                  <Icon name="ellipsis" size={16} />
                </Button>
              </span>
            {/snippet}
            <MenuItem href={downloadUrl(wf)}>
              <Icon name="download" size={16} />
              Download .bin
            </MenuItem>
            {#if manage}
              <MenuItem onClick={onEdit}>
                <Icon name="pencil" size={16} />
                Edit
              </MenuItem>
              <MenuItem onClick={onPublishToggle}>
                <Icon name={wf.published ? "globe-lock" : "globe"} size={16} />
                {wf.published ? "Unpublish" : "Publish"}
              </MenuItem>
            {/if}
            {#if canRemove}
              <MenuItem danger onClick={onRemove}>
                <Icon name="trash" size={16} />
                Delete
              </MenuItem>
            {/if}
          </Menu>
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
    font-size: 1.2rem;
    line-height: 1;
    font-weight: 600;
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
  .downloads {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .menu-slot {
    display: inline-flex;
    margin-inline-start: auto;
  }
  .count {
    font-size: 0.625rem;
  }
</style>
