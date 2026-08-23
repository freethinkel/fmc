<script lang="ts">
  import AppHeader from "$lib/shared/components/app-header/app-header.svelte";
  import { BottomNav } from "$lib/shared/components/bottom-nav";

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
    height: 100%;
  }
  main {
    flex: 1;
    overflow: hidden;
  }
  @media (max-width: 767px) {
    main {
      /* keep content clear of the fixed bottom tab bar */
      padding-bottom: calc(3.5rem + var(--safe-area-bottom));
    }
  }
</style>
