<script lang="ts">
  import { MarketPage } from "$lib/modules/market/pages";
  import { siteTitle } from "$lib/shared/seo";
</script>

<svelte:head><title>{siteTitle()}</title></svelte:head>

<MarketPage />
