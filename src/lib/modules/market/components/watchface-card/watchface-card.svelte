<script lang="ts">
  import { Button } from "$lib/shared/components/ui/button";
  import { Badge } from "$lib/shared/components/ui/badge/index.js";
  import { Heart, Download, Trash2 } from "@lucide/svelte";
  import { fileUrl, downloadUrl } from "$lib/shared/api";

  let {
    wf,
    likeCount = 0,
    liked = false,
    canLike = false,
    canRemove = false,
    onOpen,
    onLike,
    onRemove,
  } = $props();
</script>

<div class="flex flex-col gap-2 rounded-xl border p-3 transition-shadow hover:shadow-md">
  <button
    onclick={onOpen}
    class="aspect-square cursor-pointer overflow-hidden rounded-full bg-black"
    title="Open in editor"
  >
    <img
      src={fileUrl(wf, "preview")}
      alt={wf.name}
      class="h-full w-full object-cover"
      loading="lazy"
    />
  </button>
  <div class="flex items-baseline justify-between gap-2">
    <span class="truncate text-sm font-medium">{wf.name}</span>
    {#if wf.type}<Badge variant="outline" class="shrink-0 text-[10px] uppercase">{wf.type}</Badge
      >{/if}
  </div>
  {#if wf.owner}
    <span class="text-xs text-muted-foreground">by {wf.expand?.owner?.name || "—"}</span>
  {/if}
  {#if wf.description}
    <p class="line-clamp-2 text-xs text-muted-foreground">
      {wf.description}
    </p>
  {/if}
  <div class="mt-auto flex items-center gap-1">
    <Button
      size="sm"
      variant="ghost"
      disabled={!canLike}
      onclick={onLike}
      title={canLike ? "Like" : "Sign in to like"}
    >
      <Heart class={["size-4", liked && "fill-red-500 text-red-500"]} />
      <span class="text-xs">{likeCount}</span>
    </Button>
    <Button size="sm" variant="ghost" href={downloadUrl(wf)} title="Download .bin">
      <Download class="size-4" />
      <span class="text-xs">{wf.downloads || 0}</span>
    </Button>
    {#if canRemove}
      <Button size="sm" variant="ghost" class="ml-auto" onclick={onRemove} title="Delete">
        <Trash2 class="size-4 text-destructive" />
      </Button>
    {/if}
  </div>
</div>
