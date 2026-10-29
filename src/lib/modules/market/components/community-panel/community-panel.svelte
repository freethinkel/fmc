<script lang="ts">
  // The "Join Community" tab: one panel of links. What is listed is data — see lib/community.ts.
  import { Icon } from "$lib/shared/components/icon";
  import { COMMUNITY_LINKS } from "../../lib/community";
</script>

<section class="panel">
  <h2>Join the community</h2>
  <p class="lead">Meet other CMF Watch creators, share your work and get help.</p>

  <ul>
    {#each COMMUNITY_LINKS as link (link.id)}
      <li>
        {#if link.url}
          <a class="tile" href={link.url} target="_blank" rel="noopener noreferrer">
            <span class="glyph"><Icon name={link.icon} size={24} /></span>
            <span class="text">
              <span class="title">{link.title}</span>
              {#if link.description}<span class="desc">{link.description}</span>{/if}
            </span>
            <Icon name="open_in_new" size={20} class="out" />
          </a>
        {:else}
          <div class="tile soon" aria-disabled="true">
            <span class="glyph"><Icon name={link.icon} size={24} /></span>
            <span class="text">
              <span class="title">{link.title}</span>
              <span class="desc">Coming soon</span>
            </span>
          </div>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  .panel {
    max-width: 36rem;
    margin-inline: auto;
    padding: 1.5rem 1rem;
  }
  h2 {
    margin: 0;
    font-size: 1.25rem;
  }
  .lead {
    margin: 0.25rem 0 1rem;
    color: oklch(from var(--color-text) l c h / 60%);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .tile {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.8rem;
    border-radius: var(--border-radius);
    background: oklch(from var(--color-text) l c h / 5%);
    color: inherit;
    text-decoration: none;

    &.soon {
      opacity: 0.55;
    }
  }
  a.tile {
    transition: background-color 0.15s ease;

    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-text) l c h / 9%);
      }
    }
    &:focus-visible {
      outline: 2px solid var(--color-accent);
    }
  }
  .glyph {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: var(--color-accent);
    color: var(--color-on-accent);
  }
  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .title {
    font-weight: 600;
  }
  .desc {
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 60%);
  }
  .tile :global(.out) {
    flex: none;
    color: oklch(from var(--color-text) l c h / 50%);
  }
</style>
