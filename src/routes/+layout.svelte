<script lang="ts">
  import "$lib/styles/tokens.css";
  import "$lib/styles/global.css";
  import favicon from "$lib/assets/favicon.svg";
  // one global mount: flashing is triggered from the editor, the popover lives in the app chrome
  import SlotDialog from "$lib/modules/device/components/slot-dialog.svelte";

  let { children } = $props();
</script>

<svelte:head>
  <link rel="icon" href={favicon} />
</svelte:head>

{@render children()}
<SlotDialog />
