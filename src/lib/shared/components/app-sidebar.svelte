<script>
	import Store from "@lucide/svelte/icons/store";
	import Pencil from "@lucide/svelte/icons/pencil";
	import WatchIcon from "@lucide/svelte/icons/watch";
	import FolderHeart from "@lucide/svelte/icons/folder-heart";
	import NavUser from "./nav-user.svelte";
	import * as Sidebar from "$lib/shared/components/ui/sidebar/index.js";
	import { page } from "$app/state";
	import { authModel } from "$lib/modules/auth/model";

	const { $user: user } = authModel;
	const nav = $derived([
		{ title: "Marketplace", url: "/market", icon: Store },
		{ title: "Editor", url: "/editor", icon: Pencil },
		...($user ? [{ title: "My watchfaces", url: "/my", icon: FolderHeart }] : []),
		{ title: "Watch", url: "/watch", icon: WatchIcon },
	]);

	let { ...restProps } = $props();
</script>

<Sidebar.Root collapsible="offcanvas" {...restProps}>
	<Sidebar.Content>
		<Sidebar.Group>
			<Sidebar.GroupContent>
				<Sidebar.Menu class="gap-1">
					{#each nav as item (item.url)}
						<Sidebar.MenuItem>
							<Sidebar.MenuButton
								tooltipContent={item.title}
								isActive={page.url.pathname.startsWith(item.url)}
							>
								{#snippet child({ props })}
									<a href={item.url} {...props}>
										<item.icon />
										<span>{item.title}</span>
									</a>
								{/snippet}
							</Sidebar.MenuButton>
						</Sidebar.MenuItem>
					{/each}
				</Sidebar.Menu>
			</Sidebar.GroupContent>
		</Sidebar.Group>
	</Sidebar.Content>
	<Sidebar.Footer>
		<NavUser />
	</Sidebar.Footer>
</Sidebar.Root>
