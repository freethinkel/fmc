<script lang="ts">
  import "$lib/styles/tokens.css";
  import "$lib/styles/global.css";
  import { afterNavigate } from "$app/navigation";
  import { sendEvent } from "$lib/modules/analytics/lib/aptabase";
  // one global mount: flashing is triggered from the editor, the popover lives in the app chrome
  import SlotDialog from "$lib/modules/device/components/slot-dialog.svelte";

  let { children } = $props();

  // Aptabase has no pageviews of its own. The route id, not the url: "/market/[id]" is one page
  // in the dashboard, and face_view already says which face
  afterNavigate(({ to }) => sendEvent("page_view", { page: to?.route.id ?? "unknown" }));
</script>

{@render children()}
<SlotDialog />
