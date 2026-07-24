<script>
	import Store from "@lucide/svelte/icons/store";
	import Pencil from "@lucide/svelte/icons/pencil";
	import WatchIcon from "@lucide/svelte/icons/watch";
	import FolderHeart from "@lucide/svelte/icons/folder-heart";
	import { page } from "$app/state";
	import { cn } from "$lib/shared/helpers";
	import { authModel } from "$lib/modules/auth/model";

	const { $user: user } = authModel;
	const nav = $derived([
		{ title: "Market", url: "/market", icon: Store },
		{ title: "Editor", url: "/editor", icon: Pencil },
		...($user ? [{ title: "My", url: "/my", icon: FolderHeart }] : []),
		{ title: "Watch", url: "/watch", icon: WatchIcon },
	]);
</script>

<!-- mobile bottom tab bar; on md+ navigation lives in the sidebar -->
<nav class="bg-background fixed inset-x-0 bottom-0 z-50 border-t pb-[env(safe-area-inset-bottom)] md:hidden">
	<div class="flex h-14">
		{#each nav as item (item.url)}
			<a
				href={item.url}
				class={cn(
					"flex flex-1 flex-col items-center justify-center gap-0.5 text-xs",
					page.url.pathname.startsWith(item.url)
						? "text-foreground"
						: "text-muted-foreground"
				)}
			>
				<item.icon class="size-5" />
				{item.title}
			</a>
		{/each}
	</div>
</nav>
