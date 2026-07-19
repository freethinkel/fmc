<script lang="ts">
	import type { WithElementRef } from "$lib/shared/helpers";
	import type { HTMLAttributes } from "svelte/elements";
	import { cn } from "$lib/shared/helpers";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> = $props();
</script>

<nav
	bind:this={ref}
	data-slot="breadcrumb"
	aria-label="breadcrumb"
	class={cn("cn-breadcrumb", className)}
	{...restProps}
>
	{@render children?.()}
</nav>
