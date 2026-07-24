<script>
	import * as Avatar from "$lib/shared/components/ui/avatar/index.js";
	import * as DropdownMenu from "$lib/shared/components/ui/dropdown-menu/index.js";
	import * as Sidebar from "$lib/shared/components/ui/sidebar/index.js";
	import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
	import LogOutIcon from "@lucide/svelte/icons/log-out";
	import LogInIcon from "@lucide/svelte/icons/log-in";
	import { authModel } from "$lib/modules/auth/model";
	const { $user: user, logout } = authModel;

	const sidebar = Sidebar.useSidebar();
	const initials = $derived(($user?.name || $user?.email || "?").slice(0, 2).toUpperCase());
</script>

<Sidebar.Menu>
	<Sidebar.MenuItem>
		{#if $user}
			<DropdownMenu.Root>
				<DropdownMenu.Trigger>
					{#snippet child({ props })}
						<Sidebar.MenuButton
							{...props}
							size="lg"
							class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
						>
							<Avatar.Root class="size-8 rounded-lg">
								<Avatar.Fallback class="rounded-lg">{initials}</Avatar.Fallback>
							</Avatar.Root>
							<div class="grid flex-1 text-start text-sm leading-tight">
								<span class="truncate font-medium">{$user.name || $user.email}</span>
								<span class="truncate text-xs">{$user.email}</span>
							</div>
							<ChevronsUpDownIcon class="ms-auto size-4" />
						</Sidebar.MenuButton>
					{/snippet}
				</DropdownMenu.Trigger>
				<DropdownMenu.Content
					class="w-(--bits-dropdown-menu-anchor-width) min-w-56 rounded-lg"
					side={sidebar.isMobile ? "bottom" : "right"}
					align="end"
					sideOffset={4}
				>
					<DropdownMenu.Item onclick={() => logout()}>
						<LogOutIcon />
						Log out
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		{:else}
			<Sidebar.MenuButton size="lg">
				{#snippet child({ props })}
					<a href="/login" {...props}>
						<LogInIcon class="size-4" />
						<span>Sign in</span>
					</a>
				{/snippet}
			</Sidebar.MenuButton>
		{/if}
	</Sidebar.MenuItem>
</Sidebar.Menu>
