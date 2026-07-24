<script lang="ts">
  import { Dialog } from "$lib/shared/components/dialog";

  let {
    open = false,
    side = false,
    onClose,
  }: { open?: boolean; side?: boolean; onClose?: () => void } = $props();
</script>

<Dialog {open} {side} title="Test dialog" {onClose}>
  <p>content</p>
</Dialog>
