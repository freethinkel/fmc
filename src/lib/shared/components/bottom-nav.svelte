<script lang="ts">
  import Store from "@lucide/svelte/icons/store";
  import Pencil from "@lucide/svelte/icons/pencil";
  import WatchIcon from "@lucide/svelte/icons/watch";
  import FolderHeart from "@lucide/svelte/icons/folder-heart";
  import { page } from "$app/state";
  import { authModel } from "$lib/modules/auth/model";

  const { $user: user } = authModel;
  const nav = $derived([
    { title: "Market", url: "/market", icon: Store },
    { title: "Editor", url: "/editor", icon: Pencil },
    ...($user ? [{ title: "My", url: "/my", icon: FolderHeart }] : []),
    { title: "Watch", url: "/watch", icon: WatchIcon },
  ]);
</script>

<!-- mobile bottom tab bar; on md+ navigation lives in the app header -->
<nav>
  {#each nav as item (item.url)}
    <a href={item.url} class:active={page.url.pathname.startsWith(item.url)}>
      <item.icon size={20} />
      {item.title}
    </a>
  {/each}
</nav>

<style>
  nav {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    height: calc(56px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    background: var(--color-background);
    border-top: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  a {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    font-size: 0.7rem;
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
