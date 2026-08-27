<script lang="ts">
  import "$lib/styles/tokens.css";
  import "$lib/styles/global.css";
  // one global mount: flashing is triggered from the editor, the popover lives in the app chrome
  import SlotDialog from "$lib/modules/device/components/slot-dialog.svelte";

  let { children } = $props();
</script>

{@render children()}
<SlotDialog />
