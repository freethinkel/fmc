<script lang="ts">
	import type { HTMLLiAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/shared/helpers";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLLiAttributes> = $props();
</script>

<li
	bind:this={ref}
	data-slot="breadcrumb-item"
	class={cn("gap-1 inline-flex items-center", className)}
	{...restProps}
>
	{@render children?.()}
</li>
