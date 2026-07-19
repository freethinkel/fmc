<script>
	import { Separator } from "$lib/shared/components/ui/separator/index.js";
	import * as Breadcrumb from "$lib/shared/components/ui/breadcrumb/index.js";
	import * as Sidebar from "$lib/shared/components/ui/sidebar/index.js";
	import * as Avatar from "$lib/shared/components/ui/avatar/index.js";
	import * as DropdownMenu from "$lib/shared/components/ui/dropdown-menu/index.js";
	import Watch from "@lucide/svelte/icons/watch";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import { page } from "$app/state";
	import { authModel } from "$lib/modules/auth/model";

	const { user, logout } = authModel;
	const titles = { "/market": "Marketplace", "/editor": "Editor", "/watch": "Watch", "/login": "Sign in", "/register": "Sign up" };
	const title = $derived(titles[page.url.pathname] ?? "");
	const initials = $derived(($user?.name || $user?.email || "?").slice(0, 2).toUpperCase());
</script>

<header class="bg-background sticky top-0 z-50 flex h-(--header-height) w-full shrink-0 items-center border-b">
	<div class="flex w-full items-center gap-2 px-4">
		<Sidebar.Trigger class="-ms-1 hidden md:flex" />
		<Separator orientation="vertical" class="mx-1 hidden data-[orientation=vertical]:h-4 md:block" />
		<Breadcrumb.Root>
			<Breadcrumb.List>
				<Breadcrumb.Item>
					<Breadcrumb.Link href="/" class="flex items-center gap-1.5">
						<Watch class="size-4" /> FCM Watchfaces
					</Breadcrumb.Link>
				</Breadcrumb.Item>
				{#if title}
					<Breadcrumb.Separator />
					<Breadcrumb.Item>
						<Breadcrumb.Page>{title}</Breadcrumb.Page>
					</Breadcrumb.Item>
				{/if}
			</Breadcrumb.List>
		</Breadcrumb.Root>

		<!-- на мобиле сайдбара нет — юзер живёт в шапке -->
		<div class="ms-auto md:hidden">
			{#if $user}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<button {...props} aria-label="Account">
								<Avatar.Root class="size-8 rounded-lg">
									<Avatar.Fallback class="rounded-lg text-xs">{initials}</Avatar.Fallback>
								</Avatar.Root>
							</button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" sideOffset={4} class="min-w-48 rounded-lg">
						<DropdownMenu.Item onclick={() => logout()}>
							<LogOutIcon />
							Log out
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<a href="/login" class="text-muted-foreground flex items-center gap-1.5 text-sm">
					<LogInIcon class="size-4" /> Sign in
				</a>
			{/if}
		</div>
	</div>
</header>
