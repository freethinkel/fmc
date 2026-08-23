<script lang="ts">
  import "$lib/styles/tokens.css";
  import "$lib/styles/global.css";
  import favicon from "$lib/assets/favicon.svg";
  import { startFaviconClock } from "$lib/shared/lib/favicon";
  // one global mount: flashing is triggered from the editor, the popover lives in the app chrome
  import SlotDialog from "$lib/modules/device/components/slot-dialog.svelte";

  let { children } = $props();

  // the tab icon is the app icon with the wall clock in it
  $effect(startFaviconClock);
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<SlotDialog />
