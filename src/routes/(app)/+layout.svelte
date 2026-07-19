<script>
	import * as Sidebar from "$lib/shared/components/ui/sidebar/index.js";
	import AppSidebar from "$lib/shared/components/app-sidebar.svelte";
	import SiteHeader from "$lib/shared/components/site-header.svelte";
	import BottomNav from "$lib/shared/components/bottom-nav.svelte";

	let { children } = $props();
</script>

<!-- шапка на всю ширину, сайдбар начинается под ней; на мобиле вместо сайдбара нижний таб-бар -->
<div class="[--header-height:calc(var(--spacing)*14)]">
	<Sidebar.Provider class="flex flex-col">
		<SiteHeader />
		<div class="flex flex-1">
			<AppSidebar class="top-(--header-height) !h-[calc(100svh-var(--header-height))]" />
			<Sidebar.Inset
				class="h-[calc(100svh-var(--header-height))] overflow-hidden pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
			>
				{@render children()}
			</Sidebar.Inset>
		</div>
		<BottomNav />
	</Sidebar.Provider>
</div>
