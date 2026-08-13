<script lang="ts">
  import { page } from "$app/state";
  import { ProfilePage } from "$lib/modules/market/pages";

  // params is typed across all routes, so `id` is optional there — on this route it always matches
  const userId = $derived(page.params.id!);
</script>

<ProfilePage {userId} />
