<script lang="ts">
  import { goto } from "$app/navigation";
  import { authModel } from "$lib/modules/auth/model";
  import { marketModel } from "../model";
  import { WatchfaceList } from "../components/watchface-list";

  const { $user: user } = authModel;
  const {
    $myItems: myItems,
    $myLoading: myLoading,
    $marketErr: marketErr,
    myLoadRequested,
  } = marketModel;

  // depend on the id, not the record: pb's startup authRefresh swaps in a fresh record object
  // with the same id, and re-firing the load made the SDK auto-cancel the first request
  const uid = $derived($user?.id);

  $effect(() => {
    if (uid) myLoadRequested(uid);
    else goto("/login");
  });
</script>

<svelte:head><title>My watchfaces — FMC Watchfaces</title></svelte:head>

<div class="page">
  {#if $marketErr}<p class="error">{$marketErr}</p>{/if}

  <main>
    <WatchfaceList
      items={$myItems}
      loading={$myLoading}
      manage
      showAuthor={false}
      empty="Nothing here yet — create a watchface in the editor and hit Save."
    />
  </main>
</div>

<style>
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .error {
    margin: 0;
    padding: 0.75rem 1rem 0;
    font-size: 0.75rem;
    color: var(--color-error);
  }
  main {
    flex: 1;
    overflow-y: auto;
  }
</style>
