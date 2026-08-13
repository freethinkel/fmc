<script lang="ts">
  import { page } from "$app/state";
  import { WatchfacePage } from "$lib/modules/market/pages";
</script>

<WatchfacePage id={page.params.id ?? ""} />
