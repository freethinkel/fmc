<script lang="ts">
  // Shown when every slot on the watch is taken — the upload waits in the model until one of
  // the installed dials is picked to overwrite.
  import { Dialog } from "$lib/shared/components/dialog";
  import { bleModel } from "../model";
  import { dialLabel, dialPreview, dialTitle } from "../lib/catalog-names";
  import WatchSelector from "./watch-selector.svelte";

  const { $slotDialogOpen: open, $dials: dials, slotPicked, slotDialogClosed } = bleModel;
</script>

<Dialog open={$open} title="The watch is full" onClose={() => slotDialogClosed()}>
  <p class="desc">
    Pick the watchface to replace — its slot number matches the order the watch shows them in.
  </p>
  <div class="dials">
    {#each $dials ?? [] as id, i (id)}
      <WatchSelector
        name={dialLabel(id, i)}
        preview={dialPreview(id)}
        title={dialTitle(id)}
        onClick={() => slotPicked(id)}
      />
    {/each}
  </div>
</Dialog>

<style>
  .desc {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    color: oklch(from var(--color-text) l c h / 55%);
  }
  .dials {
    display: flex;
    gap: 1rem;
    overflow-x: auto;
    padding: 0.625rem 0;
  }
</style>
