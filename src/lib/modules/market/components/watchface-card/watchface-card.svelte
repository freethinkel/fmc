<script lang="ts">
  import { Badge } from "$lib/shared/components/badge";
  import { Button } from "$lib/shared/components/button";
  import { Card } from "$lib/shared/components/card";
  import { Icon } from "$lib/shared/components/icon";
  import { Menu, MenuItem } from "$lib/shared/components/menu";
  import { fileUrl, downloadUrl } from "$lib/shared/api";
  import type { RecordModel } from "pocketbase";
  import { Avatar } from "$lib/shared/components/avatar";

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

  const authorName = $derived(wf.expand?.owner?.name || "—");

  const avatar = $derived(
    wf.expand?.owner ? fileUrl(wf.expand?.owner, "avatar") : undefined,
  );
</script>

<Card onClick={onOpen}>
  <div class="content">
    <div class="top-line">
      <h3 title={wf.name} class="name">{wf.name}</h3>
      <div class="stats">
        <div class="stats-btn" title="Downloads">
          <span class="count">[ {wf.downloads || 0} ]</span>
          <Icon name="download" size={20} />
        </div>

        <button class="stats-btn" disabled={!canLike} onclick={stop(onLike)}>
          <span class="count">[ {likeCount} ]</span>
          <Icon
            name="favorite"
            size={20}
            color={liked ? "var(--color-error)" : undefined}
            fill={liked}
          />
        </button>
      </div>
    </div>
    <div class="preview" title="Open">
      <img src={fileUrl(wf, "preview")} alt={wf.name} loading="lazy" />
    </div>
    {#if wf.owner && showAuthor}
      <a
        class="author"
        href="/user/{wf.owner}"
        onclick={(e) => e.stopPropagation()}
      >
        <Avatar name={authorName} src={avatar} />
        {authorName}
      </a>
    {/if}
    <!-- {#if wf.description} -->
    <!--   <p class="desc">{wf.description}</p> -->
    <!-- {/if} -->
    <div class="actions">
      {#if manage}
        <Badge>{wf.published ? "Published" : "Draft"}</Badge>
      {:else if wf.type}
        <Badge>{wf.type}</Badge>
      {/if}

      {#if manage || canRemove}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <span class="menu-slot" onclick={(e) => e.stopPropagation()}>
          <Menu>
            {#snippet trigger({ toggle })}
              <button class="action-btn" onclick={toggle}>
                <Icon name="more_horiz" size={22} />
              </button>
            {/snippet}
            <MenuItem href={downloadUrl(wf)}>
              <Icon name="download" size={16} />
              Download .bin
            </MenuItem>
            {#if manage}
              <MenuItem onClick={onEdit}>
                <Icon name="edit" size={16} />
                Edit
              </MenuItem>
              <MenuItem onClick={onPublishToggle}>
                <Icon name={wf.published ? "public_off" : "public"} size={16} />
                {wf.published ? "Unpublish" : "Publish"}
              </MenuItem>
            {/if}
            {#if canRemove}
              <MenuItem danger onClick={onRemove}>
                <Icon name="delete" size={16} />
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
    display: flex;
    justify-content: center;
    align-items: center;
    flex: 1;
    width: 100%;
    flex-shrink: 0;
    padding: 0;
    border: none;
    overflow: hidden;
    cursor: pointer;

    img {
      max-height: 100%;
      max-width: 15rem;
      display: block;
      aspect-ratio: 1;
      background: oklch(0 0 0);
      border-radius: 50%;
    }
  }

  .top-line {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.5rem;
  }
  .name {
    margin: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.2rem;
    line-height: 1.5;
    font-weight: 600;
    flex: 1;
    transition: var(--spring-transition);
  }
  .author {
    gap: 0.5rem;
    display: flex;
    align-items: center;
    align-self: flex-start;
    font-size: 0.9rem;
    text-decoration: none;
    color: oklch(from var(--color-text) l c h / 55%);
    --avatar-size: 1.6rem;

    &:hover {
      color: var(--color-accent);
    }
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: auto;
  }

  :global(.open) .action-btn {
    background: oklch(from var(--color-background) calc(l + 0.1) c h);
  }

  .action-btn {
    appearance: none;
    display: flex;
    height: 2rem;
    align-items: center;
    justify-content: center;
    width: 2rem;
    border-radius: var(--border-radius);
    border: none;
    background: var(--color-background);
    transition: var(--spring-transition);

    &:hover {
      background: oklch(from var(--color-background) calc(l + 0.1) c h);
    }
  }
  .stats {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .stats-btn {
    cursor: pointer;
    appearance: none;
    border: none;
    background: none;
    display: flex;
    align-items: center;
    gap: 0.3rem;
    color: oklch(from var(--color-text) l c h / 55%);

    & :global(.icon) {
      line-height: 1em;
    }
  }
  .menu-slot {
    display: inline-flex;
    margin-inline-start: auto;
  }
  .count {
    font-size: 0.8rem;
  }
</style>
