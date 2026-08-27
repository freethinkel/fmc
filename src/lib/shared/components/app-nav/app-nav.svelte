<script lang="ts">
  import { page } from "$app/state";
  import { authModel } from "$lib/modules/auth/model";
  import WatchSheet from "$lib/modules/device/components/watch-sheet.svelte";
  import { Avatar } from "$lib/shared/components/avatar";
  import { Icon, type IconName } from "$lib/shared/components/icon";
  import { Menu, MenuItem } from "$lib/shared/components/menu";

  const { $user: user, logout } = authModel;
  const path = $derived(page.url.pathname);
  const nav = $derived<{ title: string; url: string; icon: IconName; active: boolean }[]>([
    // one section for the whole shelf: the marketplace lives at the root, /my redirects there
    {
      title: "Watchfaces",
      url: "/",
      icon: "storefront",
      active: path === "/" || path.startsWith("/market") || path.startsWith("/my"),
    },
    { title: "Editor", url: "/editor", icon: "edit", active: path.startsWith("/editor") },
  ]);
</script>

<!-- the app's navigation: a bottom tab bar on a phone, a rail down the left side on md+ -->
<nav>
  <a class="logo" href="/">fmc</a>
  {#each nav as item (item.url)}
    <a href={item.url} class:active={item.active}>
      <span class="icon">
        <Icon name={item.icon} size={24} />
      </span>
      {item.title}
    </a>
  {/each}
  <WatchSheet>
    {#snippet trigger({ toggle, connected })}
      <!-- no .active while open: the watch panel is an overlay, not a page -->
      <button onclick={toggle}>
        <span class="icon">
          <Icon name="watch" size={24} />
          {#if connected}<span class="dot"></span>{/if}
        </span>
        Watch
      </button>
    {/snippet}
  </WatchSheet>
  <!-- the account closes the bar: the app has no top bar, so this is where it lives -->
  {#if $user}
    <span class="account">
      <Menu align="start">
        {#snippet trigger({ toggle })}
          <button onclick={toggle}>
            <span class="icon">
              <Avatar name={$user.name || $user.email} size={24} />
            </span>
            Account
          </button>
        {/snippet}
        <MenuItem href="https://github.com/freethinkel/fmc/issues">
          <Icon name="help" size={16} />
          Report an issue
        </MenuItem>
        <MenuItem danger onClick={() => logout()}>
          <Icon name="logout" size={16} />
          Log out
        </MenuItem>
      </Menu>
    </span>
  {:else}
    <a href="/login" class:active={path.startsWith("/login") || path.startsWith("/register")}>
      <span class="icon">
        <Icon name="logout" size={24} />
      </span>
      Sign in
    </a>
  {/if}
</nav>

<style>
  nav {
    position: fixed;
    inset-inline: 0;
    bottom: 0;
    z-index: 50;
    display: flex;
    height: calc(var(--nav-bar-height) + var(--safe-area-bottom));
    padding-bottom: var(--safe-area-bottom);
    background: var(--color-background);
    border-top: 1px solid oklch(from var(--color-text) l c h / 10%);
  }
  .icon {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 3.5rem;
    height: 2rem;
    border-radius: 625rem;

    /* the pill grows out of the centre of the tab that just became active. Leaving, it fades
       first and only then collapses — the 0s delays hide the geometry snapping back
       (borrowed from m3-svelte's nav item) */
    &::before {
      content: "";
      position: absolute;
      inset: 0 50%;
      width: 0;
      border-radius: inherit;
      background: oklch(from var(--color-text) l c h / 8%);
      opacity: 0;
      transition:
        opacity 0.15s ease,
        inset 0s 0.2s,
        width 0s 0.2s;
    }
    /* the glyph rides above the pill */
    :global(.icon) {
      position: relative;
      z-index: 1;
    }
  }
  .dot {
    position: absolute;
    z-index: 1;
    /* the glyph's top-right corner, measured from the middle of the pill: half the 24px
       glyph plus half the dot */
    top: calc(50% - 0.9375rem);
    inset-inline-end: calc(50% - 0.9375rem);
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
    gap: 0.5rem;
    font-size: 0.75rem;
    line-height: 1rem;
    font-weight: 500;
    text-decoration: none;
    color: oklch(from var(--color-text) l c h / 50%);

    @media (hover: hover) {
      &:hover .icon::before {
        opacity: 1;
        inset: 0;
        width: 100%;
        transition:
          opacity 0.15s ease,
          inset var(--spring-transition),
          width var(--spring-transition);
      }
    }

    &.active {
      color: var(--color-text);
      font-weight: 600;

      .icon {
        color: var(--color-on-accent);
      }
      .icon::before {
        background: var(--color-accent);
        opacity: 1;
        inset: 0;
        width: 100%;
        transition:
          opacity 0.15s ease,
          inset var(--spring-transition),
          width var(--spring-transition);
      }
    }
  }
  /* the Menu wraps its trigger in a box of its own — hand it the tab's share of the bar */
  .account,
  .account :global(.root) {
    display: flex;
    flex: 1;
    min-width: 0;
  }
  .account > :global(*),
  .account :global(.root > :first-child) {
    flex: 1;
    min-width: 0;
  }
  .logo {
    display: none;
    flex: none;
    font-family: var(--font-display);
    color: var(--color-accent);
    text-decoration: none;
    font-size: 0.8125rem;
  }
  @media (min-width: 768px) {
    nav {
      position: relative;
      flex-direction: column;
      justify-content: start;
      gap: 0.5rem;
      width: var(--nav-rail-width);
      height: 100%;
      padding: calc(1.5rem + var(--safe-area-top)) 0 calc(1.5rem + var(--safe-area-bottom));
      border-top: none;
      border-inline-end: 1px solid oklch(from var(--color-text) l c h / 10%);
    }
    a,
    button {
      flex: none;
      padding-block: 0.25rem 0;
    }
    .logo {
      display: flex;
      align-items: center;
      justify-content: center;
      padding-block: 0.5rem 0.75rem;
    }
    /* the account sits at the far end of the rail, away from the pages */
    .account {
      flex: none;
      justify-content: center;
      margin-block-start: auto;
    }
    .account :global(.root) {
      flex: none;
    }
  }
</style>
