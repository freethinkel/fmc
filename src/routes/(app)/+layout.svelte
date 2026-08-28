<script lang="ts">
  import { AppNav } from "$lib/shared/components/app-nav";

  let { children } = $props();
</script>

<div class="shell">
  <AppNav />
  <main>
    {@render children()}
  </main>
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  main {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    /* the status bar draws over the page in standalone — no header left to absorb it */
    padding-top: var(--safe-area-top);
  }
  /* the rail sits beside the page; the phone's bar is fixed over it */
  @media (min-width: 768px) {
    .shell {
      flex-direction: row;
    }
  }
  @media (max-width: 767px) {
    main {
      /* keep content clear of the fixed bottom tab bar */
      padding-bottom: calc(var(--nav-bar-height) + var(--safe-area-bottom));
    }
  }
</style>
