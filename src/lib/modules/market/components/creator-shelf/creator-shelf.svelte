<script lang="ts">
  // The "Top creators" view: a stack of creator cards. The header opens the creator's profile,
  // the rail scrolls their published faces sideways — the most downloaded first. Totals in the
  // header are the ones behind the threshold, across everything the creator published, so a
  // search that narrows the rail doesn't shrink the numbers.
  import type { RecordModel } from "pocketbase";
  import { Avatar } from "$lib/shared/components/avatar";
  import { Card } from "$lib/shared/components/card";
  import { Icon } from "$lib/shared/components/icon";
  import { Skeleton } from "$lib/shared/components/skeleton";
  import { fileUrl } from "$lib/shared/api";
  import type { TopCreator } from "../../lib/top-creators";

  interface Props {
    creators: TopCreator<RecordModel>[];
    loading?: boolean;
  }

  const { creators, loading = false }: Props = $props();

  // the face query expanded owner onto every face alike, so the first carries the profile
  const owner = (c: TopCreator<RecordModel>) =>
    c.faces[0]?.expand?.owner as RecordModel | undefined;
  const name = (c: TopCreator<RecordModel>) => owner(c)?.name || "Creator";
  const avatar = (c: TopCreator<RecordModel>) => {
    const u = owner(c);

    return u?.avatar ? fileUrl(u, "avatar") : undefined;
  };
</script>

<div class="shelf">
  {#if loading}
    {#each [0, 1] as i (i)}
      <Card>
        <div class="head">
          <Skeleton width="2.5rem" height="2.5rem" />
          <div class="who">
            <Skeleton width="8rem" height="1.25rem" />
            <Skeleton width="11rem" />
          </div>
        </div>
        <div class="rail">
          {#each [0, 1, 2, 3] as j (j)}
            <Skeleton width="7.5rem" height="8.75rem" />
          {/each}
        </div>
      </Card>
    {/each}
  {:else if !creators.length}
    <p class="empty">No top creators yet — publish faces the community will love.</p>
  {:else}
    {#each creators as c (c.id)}
      <Card>
        <div class="creator">
          <a class="head" href="/user/{c.id}">
            <Avatar name={name(c)} src={avatar(c)} />
            <span class="who">
              <span class="creator-name" title={name(c)}>{name(c)}</span>
              <span class="totals">
                {c.faces.length}
                {c.faces.length === 1 ? "face" : "faces"} · {c.downloads}
                downloads · {c.likes} likes
              </span>
            </span>
          </a>

          <div class="rail">
            {#each c.faces as wf (wf.id)}
              <a class="dial" href="/market/{wf.id}">
                <img src={fileUrl(wf, "preview")} alt={wf.name} loading="lazy" title={wf.name} />
                <span class="dial-name">{wf.name}</span>
                <span class="dial-dl" title="Downloads">
                  <Icon name="download" size={16} />
                  {wf.downloads || 0}
                </span>
              </a>
            {/each}
          </div>
        </div>
      </Card>
    {/each}
  {/if}
</div>

<style>
  .shelf {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 1rem;
    max-width: 46rem;
    margin-inline: auto;
  }
  .empty {
    margin: 0;
    color: oklch(from var(--color-text) l c h / 60%);
  }
  .creator {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    color: inherit;
    text-decoration: none;
    --avatar-size: 2.5rem;

    &:hover .creator-name {
      color: var(--color-accent);
    }
    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
      border-radius: var(--border-radius);
    }
  }
  .who {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }
  .creator-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 1.125rem;
    font-weight: 600;
  }
  .totals {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }

  /* the rail scrolls on its own: the page scroll stays vertical, faces swipe sideways.
     ponytail: no edge fade masks or arrows — if the affordance ever reads poorly, that's the
     upgrade path */
  .rail {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    overscroll-behavior-x: contain;
    scroll-snap-type: x proximity;
    scrollbar-width: thin;
    padding-block-end: 0.25rem;
  }
  .dial {
    flex: none;
    width: 7.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
    scroll-snap-align: start;
    color: inherit;
    text-decoration: none;
    border-radius: var(--border-radius);

    img {
      display: block;
      width: 100%;
      aspect-ratio: 1;
      background: oklch(0 0 0);
      border-radius: 50%;
    }
    &:focus-visible {
      outline: 2px solid var(--color-accent);
      outline-offset: 2px;
    }
  }
  .dial-name {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 0.75rem;
  }
  .dial-dl {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
</style>
