<script lang="ts">
  import { page } from "$app/state";
  import { authModel } from "$lib/modules/auth/model";
  import WatchSheet from "$lib/modules/device/components/watch-sheet.svelte";
  import { Icon, type IconName } from "$lib/shared/components/icon";

  const { $user: user } = authModel;
  const nav = $derived<{ title: string; url: string; icon: IconName }[]>([
    { title: "Market", url: "/market", icon: "store" },
    { title: "Editor", url: "/editor", icon: "pencil" },
    ...($user ? [{ title: "My", url: "/my", icon: "folder-heart" as const }] : []),
  ]);
</script>

<!-- mobile bottom tab bar; on md+ navigation lives in the app header -->
<nav>
  {#each nav as item (item.url)}
    <a href={item.url} class:active={page.url.pathname.startsWith(item.url)}>
      <Icon name={item.icon} size={20} />
      {item.title}
    </a>
  {/each}
  <WatchSheet>
    {#snippet trigger({ open, toggle, connected })}
      <button class:active={open} onclick={toggle}>
        <span class="icon-wrap">
          <Icon name="watch" size={20} />
          {#if connected}<span class="dot"></span>{/if}
        </span>
        Watch
      </button>
    {/snippet}
  </WatchSheet>
</nav>

<style>
  nav {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    height: calc(3.5rem + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--color-background);
    border-top: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .icon-wrap {
    position: relative;
    display: inline-flex;
  }
  .dot {
    position: absolute;
    top: -1px;
    inset-inline-end: -3px;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--color-accent);
  }
  a,
  button {
    border: none;
    background: transparent;
    cursor: pointer;
    font: inherit;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.125rem;
    font-size: 0.625rem;
    text-decoration: none;
    color: oklch(from var(--color-text) l c h / 50%);

    &.active {
      color: var(--color-accent);
    }
  }
  @media (min-width: 768px) {
    nav {
      display: none;
    }
  }
</style>
