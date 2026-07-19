<script>
	import Store from "@lucide/svelte/icons/store";
	import Pencil from "@lucide/svelte/icons/pencil";
	import WatchIcon from "@lucide/svelte/icons/watch";
	import { page } from "$app/state";
	import { cn } from "$lib/shared/helpers";

	const nav = [
		{ title: "Market", url: "/market", icon: Store },
		{ title: "Editor", url: "/editor", icon: Pencil },
		{ title: "Watch", url: "/watch", icon: WatchIcon },
	];
</script>

<!-- мобильный нижний таб-бар; на md+ навигация в сайдбаре -->
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
