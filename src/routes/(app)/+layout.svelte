<script lang="ts">
  import AppHeader from "$lib/shared/components/app-header/app-header.svelte";
  import BottomNav from "$lib/shared/components/bottom-nav.svelte";

  let { children } = $props();
</script>

<div class="shell">
  <AppHeader />
  <main>
    {@render children()}
  </main>
  <BottomNav />
</div>

<style>
  .shell {
    display: flex;
    flex-direction: column;
    height: 100svh;
  }
  main {
    flex: 1;
    overflow: hidden;
  }
  @media (max-width: 767px) {
    main {
      /* keep content clear of the fixed bottom tab bar */
      padding-bottom: calc(56px + env(safe-area-inset-bottom));
    }
  }
</style>
