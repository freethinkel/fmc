<script lang="ts">
  import { page } from "$app/state";
  import { Icon } from "$lib/shared/components/icon";
  import { authModel } from "$lib/modules/auth/model";
  import WatchSheet from "$lib/modules/device/components/watch-sheet.svelte";
  import { Avatar } from "$lib/shared/components/avatar";
  import { Menu, MenuItem } from "$lib/shared/components/menu";

  const { $user: user, logout } = authModel;
  const nav = $derived([
    { title: "Market", url: "/market" },
    { title: "Editor", url: "/editor" },
    ...($user ? [{ title: "My", url: "/my" }] : []),
  ]);
</script>

<header>
  <a class="logo" href="/">fmc</a>
  <nav>
    {#each nav as item (item.url)}
      <a href={item.url} class:active={page.url.pathname.startsWith(item.url)}>
        {item.title}
      </a>
    {/each}
    <WatchSheet>
      {#snippet trigger({ open, toggle, connected })}
        <button class="watch-btn" class:active={open} onclick={toggle} aria-label="Watch">
          <Icon name="watch" size={18} />
          {#if connected}<span class="dot"></span>{/if}
        </button>
      {/snippet}
    </WatchSheet>
  </nav>
  <div class="user">
    <a
      class="help-btn"
      href="https://github.com/freethinkel/fmc/issues"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Report an issue"
      title="Report an issue"
    >
      <Icon name="help" size={18} />
    </a>
    {#if $user}
      <Menu>
        {#snippet trigger({ toggle })}
          <button class="avatar-btn" onclick={toggle} aria-label="Account">
            <Avatar name={$user.name || $user.email} />
          </button>
        {/snippet}
        <MenuItem danger onClick={() => logout()}>
          <Icon name="log-out" size={16} />
          Log out
        </MenuItem>
      </Menu>
    {:else}
      <a class="signin" href="/login">Sign in</a>
    {/if}
  </div>
</header>

<style>
  header {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    height: 3.5rem;
    padding: 0 1rem;
    border-bottom: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .logo {
    font-family: var(--font-display);
    font-weight: 400;
    text-decoration: none;
    color: var(--color-accent);
  }
  nav {
    display: flex;
    gap: 0.25rem;

    a,
    button {
      border: none;
      background: transparent;
      cursor: pointer;
      font: inherit;
      text-decoration: none;
      font-size: 0.8125rem;
      padding: 0.375rem 0.75rem;
      border-radius: calc(var(--border-radius) / 1.5);
      color: oklch(from var(--color-text) l c h / 60%);

      @media (hover: hover) {
        &:hover {
          background: oklch(from var(--color-text) l c h / 6%);
        }
      }
      &.active {
        color: var(--color-text);
        background: oklch(from var(--color-text) l c h / 8%);
      }
    }
  }
  .watch-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    /* the watch popover (watch-sheet.svelte) anchors here */
    anchor-name: --watch-trigger;
  }
  .dot {
    position: absolute;
    top: 0.3125rem;
    inset-inline-end: 0.4375rem;
    width: 0.375rem;
    height: 0.375rem;
    border-radius: 50%;
    background: var(--color-accent);
  }
  .user {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-inline-start: auto;
  }
  .help-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    color: oklch(from var(--color-text) l c h / 55%);

    @media (hover: hover) {
      &:hover {
        background: oklch(from var(--color-text) l c h / 6%);
        color: var(--color-text);
      }
    }
  }
  .avatar-btn {
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
  }
  .signin {
    font-size: 0.8125rem;
    color: var(--color-accent);
    text-decoration: none;
  }
  @media (max-width: 767px) {
    nav {
      display: none; /* bottom-nav takes over */
    }
  }
</style>
