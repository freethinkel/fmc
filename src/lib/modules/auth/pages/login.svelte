<script>
	import LoginForm from "../components/login-form.svelte";
	import { authModel } from "../model";
	import { goto } from "$app/navigation";

	const { user } = authModel;
	// ponytail: уже залогинен — на страницу нечего смотреть
	$effect(() => { if ($user) goto("/market"); });
</script>

<svelte:head><title>Sign in — FMC Watchfaces</title></svelte:head>

<div class="bg-muted flex flex-1 items-center justify-center overflow-y-auto p-6 md:p-10">
	<LoginForm class="w-full max-w-sm" />
</div>
